// Indexador de proyectos: recorre los ficheros, los trocea, mantiene un
// índice BM25 siempre disponible y, si está activado, un índice vectorial
// con embeddings del modelo local. La indexación es incremental: se
// guarda el hash de cada fichero y solo se reprocesa lo que cambió.

import fs from 'node:fs';
import path from 'node:path';
import type { CodeChunk, IndexStatus, Result, SearchResult, Settings } from '../../shared/types';
import { err, ok } from '../../shared/types';
import { fnv1a } from '../../shared/textUtils';
import { Bm25Index, type Bm25Snapshot } from '../../shared/bm25';
import { VectorStore, reciprocalRankFusion, type VectorSnapshot } from '../../shared/vector';
import { chunkFile, looksBinaryContent, looksBinaryPath } from '../../shared/chunker';
import { IgnoreMatcher } from '../../shared/ignore';
import { ensureDir, readJson, writeJsonAtomic } from '../storage';
import type { AiProvider } from './ai/providers';
import type { ProjectService } from './projects';

interface PersistedIndex {
  version: 1;
  fileHashes: Record<string, string>;
  chunks: Record<string, CodeChunk>;
  bm25: Bm25Snapshot;
  vectors: VectorSnapshot | null;
}

interface ProjectIndex {
  bm25: Bm25Index;
  vectors: VectorStore | null;
  chunks: Map<string, CodeChunk>;
  fileHashes: Map<string, string>;
  /** chunks por fichero, para invalidar rápido */
  fileChunks: Map<string, string[]>;
  status: IndexStatus;
}

const EMBED_BATCH = 16;

export class IndexerService {
  private indices = new Map<string, ProjectIndex>();
  private building = new Set<string>();
  private pendingFiles = new Map<string, Set<string>>();

  constructor(
    private baseDir: string,
    private projects: ProjectService,
    private getProvider: () => AiProvider,
    private getSettings: () => Settings,
    private emitProgress: (status: IndexStatus) => void
  ) {}

  private indexFile(projectId: string): string {
    return path.join(this.baseDir, 'index', `${projectId}.json`);
  }

  private emptyStatus(projectId: string): IndexStatus {
    return { projectId, state: 'idle', files: 0, chunks: 0, vectors: 0, lastUpdated: 0 };
  }

  status(projectId: string): IndexStatus {
    return this.indices.get(projectId)?.status ?? this.emptyStatus(projectId);
  }

  private getOrLoad(projectId: string): ProjectIndex {
    const existing = this.indices.get(projectId);
    if (existing) return existing;
    const persisted = readJson<PersistedIndex | null>(this.indexFile(projectId), null);
    const index: ProjectIndex = {
      bm25: persisted ? Bm25Index.fromSnapshot(persisted.bm25) : new Bm25Index(),
      vectors: persisted?.vectors ? VectorStore.fromSnapshot(persisted.vectors) : null,
      chunks: new Map(persisted ? Object.entries(persisted.chunks) : []),
      fileHashes: new Map(persisted ? Object.entries(persisted.fileHashes) : []),
      fileChunks: new Map(),
      status: this.emptyStatus(projectId)
    };
    for (const chunk of index.chunks.values()) {
      const list = index.fileChunks.get(chunk.filePath) ?? [];
      list.push(chunk.id);
      index.fileChunks.set(chunk.filePath, list);
    }
    if (persisted) {
      index.status = {
        projectId,
        state: 'ready',
        files: index.fileHashes.size,
        chunks: index.chunks.size,
        vectors: index.vectors?.size ?? 0,
        lastUpdated: Date.now()
      };
    }
    this.indices.set(projectId, index);
    return index;
  }

  private persist(projectId: string, index: ProjectIndex): void {
    const chunks: Record<string, CodeChunk> = {};
    for (const [id, chunk] of index.chunks) chunks[id] = chunk;
    const fileHashes: Record<string, string> = {};
    for (const [file, hash] of index.fileHashes) fileHashes[file] = hash;
    const data: PersistedIndex = {
      version: 1,
      fileHashes,
      chunks,
      bm25: index.bm25.toSnapshot(),
      vectors: index.vectors ? index.vectors.toSnapshot() : null
    };
    ensureDir(path.dirname(this.indexFile(projectId)));
    writeJsonAtomic(this.indexFile(projectId), data);
  }

  private removeFileFromIndex(index: ProjectIndex, relPath: string): void {
    const chunkIds = index.fileChunks.get(relPath) ?? [];
    for (const id of chunkIds) {
      index.chunks.delete(id);
      index.bm25.remove(id);
      index.vectors?.remove(id);
    }
    index.fileChunks.delete(relPath);
    index.fileHashes.delete(relPath);
  }

  private async indexOneFile(
    projectId: string,
    index: ProjectIndex,
    relPath: string,
    absPath: string,
    settings: Settings
  ): Promise<void> {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absPath);
    } catch {
      this.removeFileFromIndex(index, relPath);
      return;
    }
    if (!stat.isFile() || stat.size > settings.indexing.maxFileSizeKb * 1024) return;
    if (looksBinaryPath(relPath)) return;
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      return;
    }
    if (looksBinaryContent(content.slice(0, 2000))) return;
    const hash = fnv1a(content);
    if (index.fileHashes.get(relPath) === hash) return; // sin cambios
    this.removeFileFromIndex(index, relPath);
    if (index.chunks.size >= settings.indexing.maxChunksPerProject) return;
    const chunks = chunkFile(relPath, content);
    const ids: string[] = [];
    for (const chunk of chunks) {
      index.chunks.set(chunk.id, chunk);
      index.bm25.add({ id: chunk.id, text: chunk.content, symbols: chunk.symbols });
      ids.push(chunk.id);
    }
    index.fileChunks.set(relPath, ids);
    index.fileHashes.set(relPath, hash);
    if (settings.indexing.useEmbeddings) {
      await this.embedChunks(index, chunks);
    }
  }

  private async embedChunks(index: ProjectIndex, chunks: CodeChunk[]): Promise<void> {
    const provider = this.getProvider();
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const inputs = batch.map((c) => `${c.filePath}\n${c.content}`.slice(0, 4000));
      const vectors = await provider.embed(inputs);
      if (!index.vectors && vectors.length > 0) index.vectors = new VectorStore();
      for (let j = 0; j < batch.length; j++) {
        const v = vectors[j];
        if (v) index.vectors!.add(batch[j]!.id, v);
      }
    }
  }

  async build(projectId: string): Promise<Result<IndexStatus>> {
    const project = this.projects.get(projectId);
    if (!project) return err('Proyecto no abierto');
    if (this.building.has(projectId)) return err('Ya hay una indexación en curso');
    const settings = this.getSettings();
    if (!settings.indexing.enabled) return err('La indexación está desactivada en Configuración');
    this.building.add(projectId);
    const index = this.getOrLoad(projectId);
    index.status = { ...index.status, state: 'indexing', error: undefined };
    this.emitProgress(index.status);
    try {
      const files = this.projects.listFiles(projectId);
      const liveSet = new Set(files);
      // ficheros borrados desde la última indexación
      for (const known of [...index.fileHashes.keys()]) {
        if (!liveSet.has(known)) this.removeFileFromIndex(index, known);
      }
      let processed = 0;
      for (const rel of files) {
        await this.indexOneFile(projectId, index, rel, path.join(project.path, rel), settings);
        processed++;
        if (processed % 200 === 0) {
          index.status = {
            projectId,
            state: 'indexing',
            files: processed,
            chunks: index.chunks.size,
            vectors: index.vectors?.size ?? 0,
            lastUpdated: Date.now()
          };
          this.emitProgress(index.status);
          // ceder el event loop para no congelar IPC en proyectos enormes
          await new Promise((r) => setImmediate(r));
        }
      }
      index.status = {
        projectId,
        state: 'ready',
        files: index.fileHashes.size,
        chunks: index.chunks.size,
        vectors: index.vectors?.size ?? 0,
        lastUpdated: Date.now()
      };
      this.persist(projectId, index);
      this.emitProgress(index.status);
      return ok(index.status);
    } catch (e) {
      index.status = { ...index.status, state: 'error', error: (e as Error).message };
      this.emitProgress(index.status);
      return err((e as Error).message);
    } finally {
      this.building.delete(projectId);
      // procesar los cambios de fichero que llegaron durante la reconstrucción
      void this.flushPending(projectId);
    }
  }

  private async flushPending(projectId: string): Promise<void> {
    const pending = this.pendingFiles.get(projectId);
    if (!pending || pending.size === 0) return;
    this.pendingFiles.delete(projectId);
    for (const rel of pending) {
      await this.onFileChanged(projectId, rel);
    }
  }

  /** Reindexado incremental de un fichero que cambió en disco. */
  async onFileChanged(projectId: string, relPath: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) return;
    const settings = this.getSettings();
    if (!settings.indexing.enabled) return;
    const index = this.indices.get(projectId);
    if (!index || index.status.state === 'idle') return;
    if (this.building.has(projectId)) {
      // en plena reconstrucción: apuntar para después
      const pending = this.pendingFiles.get(projectId) ?? new Set();
      pending.add(relPath);
      this.pendingFiles.set(projectId, pending);
      return;
    }
    const matcher = this.projects.buildIgnoreMatcher(project.path);
    if (matcher.ignores(relPath, false)) return;
    try {
      await this.indexOneFile(projectId, index, relPath, path.join(project.path, relPath), settings);
      index.status = {
        projectId,
        state: 'ready',
        files: index.fileHashes.size,
        chunks: index.chunks.size,
        vectors: index.vectors?.size ?? 0,
        lastUpdated: Date.now()
      };
      this.persist(projectId, index);
      this.emitProgress(index.status);
    } catch {
      // un fallo puntual de reindexado incremental no es crítico
    }
  }

  async search(
    projectId: string,
    query: string,
    limit: number,
    mode: 'lexical' | 'semantic' | 'hybrid'
  ): Promise<Result<SearchResult[]>> {
    const index = this.indices.get(projectId) ?? this.getOrLoad(projectId);
    if (index.chunks.size === 0) return err('El proyecto no está indexado todavía (pulsa "Indexar")');
    const cap = Math.max(1, Math.min(limit, 50));

    const lexical = index.bm25.search(query, cap * 3);
    const toResults = (hits: { id: string; score: number }[], origin: SearchResult['origin']): SearchResult[] =>
      hits
        .map((h) => {
          const chunk = index.chunks.get(h.id);
          return chunk ? { chunk, score: h.score, origin } : null;
        })
        .filter((r): r is SearchResult => r !== null)
        .slice(0, cap);

    if (mode === 'lexical') return ok(toResults(lexical, 'lexical'));

    if (!index.vectors || index.vectors.size === 0) {
      if (mode === 'semantic') {
        return err('No hay índice vectorial: activa los embeddings en Configuración y reindexa');
      }
      return ok(toResults(lexical, 'lexical'));
    }

    let queryVector: number[];
    try {
      const embedded = await this.getProvider().embed([query]);
      const first = embedded[0];
      if (!first) throw new Error('el proveedor devolvió un embedding vacío');
      queryVector = first;
    } catch (e) {
      if (mode === 'semantic') return err(`No se pudo generar el embedding de la consulta: ${(e as Error).message}`);
      return ok(toResults(lexical, 'lexical'));
    }
    const semantic = index.vectors.search(queryVector, cap * 3);
    if (mode === 'semantic') return ok(toResults(semantic, 'semantic'));
    const fused = reciprocalRankFusion([lexical, semantic], cap);
    return ok(toResults(fused, 'hybrid'));
  }

  /** Recupera contexto para el chat: consulta híbrida silenciosa. */
  async retrieve(projectId: string, query: string, limit: number): Promise<SearchResult[]> {
    const result = await this.search(projectId, query, limit, 'hybrid');
    return result.ok ? result.value : [];
  }
}
