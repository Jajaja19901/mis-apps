/* Motor del anonimizador para navegador/móvil.
 * Mismo pipeline que la versión de escritorio (Python), portado a JS:
 *  - Pasada 1: detección por fotograma (YOLOX-S personas/vehículos + 2 tiles para
 *    personas pequeñas, YOLOv9-t matrículas con zoom por vehículo).
 *  - Pistas por IoU con interpolación de huecos y extensión de extremos.
 *  - Pasada 2: pixelado en mosaico y codificación (WebCodecs vía mediabunny),
 *    copiando el audio original sin recomprimir.
 * Todo corre en el dispositivo; el vídeo no sale de él.
 */
import {
  Input, ALL_FORMATS, BlobSource, VideoSampleSink, VideoSample,
  Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat,
  VideoSampleSource, EncodedPacketSink, EncodedAudioPacketSource,
  canEncodeVideo, QUALITY_HIGH,
} from './lib/mediabunny.min.mjs';

// ---------- parámetros (idénticos a los que dieron ✅ en QA de escritorio) ----------
const CONF_PERSON = 0.22, CONF_PERSON_TILE = 0.25, CONF_VEHICLE = 0.25;
const CONF_PLATE_FULL = 0.25, CONF_PLATE_ZOOM = 0.28;
const TILE_OVERLAP = 0.16;
const TRACK_CFG = {
  persons: { iou: 0.18, gap: 20, extend: 6 },
  plates:  { iou: 0.15, gap: 30, extend: 8 },
};
const VEHICULOS = new Set([1, 2, 3, 5, 7]);
const TAM_PLACAS = 640;
// candidatos de detector de personas/vehículos, en orden de preferencia (móvil: tiny)
const MODELOS_YOLOX = [
  { fichero: 'yolox_tiny.onnx', tam: 416 },
  { fichero: 'yolox_s.onnx', tam: 640 },
];

// ---------- utilidades geométricas ----------
const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
};

function nms(dets, umbral = 0.45) {
  const orden = [...dets].sort((p, q) => q[4] - p[4]);
  const fuera = [];
  for (const d of orden) {
    if (fuera.every(f => iou(d, f) < umbral)) fuera.push(d);
  }
  return fuera;
}

export const headRegion = ([x1, y1, x2, y2]) => {
  const w = x2 - x1, h = y2 - y1, cx = (x1 + x2) / 2;
  const hw = Math.max(8, w * 0.62) / 2, hh = Math.max(8, h * 0.26);
  return [cx - hw, y1, cx + hw, y1 + hh];
};

const expandir = ([x1, y1, x2, y2], dxf, dyf, mn, W, H) => {
  const dx = Math.max(mn, (x2 - x1) * dxf), dy = Math.max(mn, (y2 - y1) * dyf);
  return [Math.max(0, x1 - dx), Math.max(0, y1 - dy), Math.min(W, x2 + dx), Math.min(H, y2 + dy)];
};

// ---------- puente de inferencia nativa (APK Android) ----------
class PuenteNativo {
  constructor() {
    this.ok = typeof window !== 'undefined' && !!window.Inferir;
    this.cola = [];
    if (this.ok) {
      window.Inferir.onmessage = e => { const fn = this.cola.shift(); if (fn) fn(e.data); };
    }
  }
  llamar(carga) {
    return new Promise((res, rej) => {
      this.cola.push(res);
      try { window.Inferir.postMessage(carga); }
      catch (e) { this.cola.pop(); rej(e); }
    });
  }
}

// ---------- detectores ----------
export class Detectores {
  constructor(rutaModelos = './modelos', rutaLibs = './lib/') {
    this.rutaModelos = rutaModelos;
    this.rutaLibs = rutaLibs;
    this.backend = '?';
    this.hilos = 1;
  }

  async init(avisa = () => {}) {
    this.puente = new PuenteNativo();
    this.nativo = false;
    if (this.puente.ok) {
      try {
        avisa('Conectando con el motor nativo…');
        const h = JSON.parse(await this.puente.llamar('hola'));
        this.nativo = true;
        this.backend = 'nativo';
        this.hilos = h.nucleos || 2;
        this.versionApp = h.version || '';
        this.modelo = 'yolox_tiny';
        this.tamY = 416;
      } catch (_) { this.nativo = false; }
    }
    if (!this.nativo) await this._prepararWasm(avisa);
    this._rejillas();
  }

  _rejillas() {
    this.grids = [];
    for (const s of [8, 16, 32]) {
      const n = this.tamY / s;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) this.grids.push([x, y, s]);
    }
    this.cnvY = new OffscreenCanvas(this.tamY, this.tamY);
    this.ctxY = this.cnvY.getContext('2d', { willReadFrequently: true });
    this.cnvP = new OffscreenCanvas(TAM_PLACAS, TAM_PLACAS);
    this.ctxP = this.cnvP.getContext('2d', { willReadFrequently: true });
  }

  async _prepararWasm(avisa = () => {}) {
    const ort = globalThis.ort;
    // ruta ABSOLUTA: ort resuelve rutas relativas contra su propio script (ya en lib/)
    ort.env.wasm.wasmPaths = new URL(this.rutaLibs, document.baseURI).href;
    // multi-hilo solo con aislamiento de origen (COOP/COEP)
    const hilosWasm = globalThis.crossOriginIsolated
      ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1)) : 1;
    ort.env.wasm.numThreads = hilosWasm;
    const carga = async n => {
      avisa(`Cargando modelo ${n}…`);
      const r = await fetch(`${this.rutaModelos}/${n}`);
      if (!r.ok) return null;
      return new Uint8Array(await r.arrayBuffer());
    };
    let byolox = null;
    for (const m of MODELOS_YOLOX) {
      byolox = await carga(m.fichero);
      if (byolox) { this.modelo = m.fichero.replace('.onnx', ''); this.tamY = this.tamY || m.tam;
        if (!this.nativo) this.tamY = m.tam; break; }
    }
    if (!byolox) throw new Error('No encuentro ningún modelo YOLOX en ' + this.rutaModelos);
    const bplacas = await carga('plates-yolov9t-640.onnx');
    if (!bplacas) throw new Error('No encuentro el modelo de matrículas');
    for (const eps of [['webgpu'], ['wasm']]) {
      try {
        avisa(`Preparando el motor (${eps[0]}, ${hilosWasm} hilo${hilosWasm > 1 ? 's' : ''})…`);
        this.yolox = await ort.InferenceSession.create(byolox, { executionProviders: eps });
        this.placas = await ort.InferenceSession.create(bplacas, { executionProviders: eps });
        if (!this.nativo) { this.backend = eps[0]; this.hilos = hilosWasm; }
        break;
      } catch (e) {
        if (eps[0] === 'wasm') throw e;
      }
    }
  }

  /** Ejecuta un modelo sobre los píxeles RGBA de un letterbox y devuelve los floats de salida.
   *  modeloId: 1=yolox, 2=matrículas. */
  async _inferir(modeloId, datos, tam, bgr, norm255, forzarWasm = false) {
    if (this.nativo && !forzarWasm) {
      const buf = new ArrayBuffer(16 + datos.length);
      new Int32Array(buf, 0, 4).set([777, modeloId, bgr ? 1 : 0, norm255 ? 1 : 0]);
      new Uint8Array(buf, 16).set(datos);
      const r = await this.puente.llamar(buf);
      if (typeof r === 'string') throw new Error(r);
      return new Float32Array(r);
    }
    const sesion = modeloId === 1 ? this.yolox : this.placas;
    const salida = await sesion.run({
      images: this._tensor(datos, tam, bgr ? [2, 1, 0] : [0, 1, 2], norm255 ? 255 : 1) });
    return (modeloId === 1 ? salida.output : salida.output0).data;
  }

  /** Comprueba en el primer fotograma que el motor nativo devuelve lo mismo que WASM;
   *  si se desvía, degrada a WASM (lento pero probado). */
  async _autoverificar(base, W, H) {
    try {
      const { datos } = this._letterbox(this.ctxY, this.tamY, base, 0, 0, W, H);
      const nat = await this._inferir(1, datos, this.tamY, true, false);
      await this._prepararWasm(() => {});
      const was = await this._inferir(1, datos, this.tamY, true, false, true);
      let dif = 0;
      for (let i = 0; i < nat.length; i += 97) dif = Math.max(dif, Math.abs(nat[i] - was[i]));
      if (!(dif < 0.15)) throw new Error(`desviación ${dif.toFixed(3)}`);
      try { this.yolox?.release?.(); this.placas?.release?.(); } catch (_) {}
      this.yolox = this.placas = null;
    } catch (e) {
      console.warn('Autoverificación del motor nativo falló; sigo con WASM:', e);
      this.nativo = false;
      this.backend = 'wasm (a salvo)';
      this.hilos = 1;
      if (!this.yolox) await this._prepararWasm(() => {});
    }
  }

  // dibuja fuente (canvas) con letterbox al tamaño dado, devuelve ratio y los píxeles RGBA
  _letterbox(ctx, tam, fuente, sx, sy, sw, sh) {
    const r = Math.min(tam / sw, tam / sh);
    const nw = Math.round(sw * r), nh = Math.round(sh * r);
    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, tam, tam);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fuente, sx, sy, sw, sh, 0, 0, nw, nh);
    return { r, datos: ctx.getImageData(0, 0, tam, tam).data };
  }

  _tensor(datos, tam, orden, norm) {
    const n = tam * tam;
    const t = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      t[i] = datos[p + orden[0]] / norm;
      t[n + i] = datos[p + orden[1]] / norm;
      t[2 * n + i] = datos[p + orden[2]] / norm;
    }
    return new globalThis.ort.Tensor('float32', t, [1, 3, tam, tam]);
  }

  // personas y vehículos sobre un recorte (sx,sy,sw,sh) del canvas fuente
  async _yolox(fuente, sx, sy, sw, sh, confP, confV) {
    const { r, datos } = this._letterbox(this.ctxY, this.tamY, fuente, sx, sy, sw, sh);
    const o = await this._inferir(1, datos, this.tamY, true, false); // BGR sin normalizar
    const P = [], V = [];
    const nAnclas = this.grids.length;
    for (let i = 0; i < nAnclas; i++) {
      const b = i * 85, obj = o[b + 4];
      if (obj < 0.05) continue;
      const [gx, gy, s] = this.grids[i];
      const cx = (o[b] + gx) * s, cy = (o[b + 1] + gy) * s;
      const w = Math.exp(o[b + 2]) * s, h = Math.exp(o[b + 3]) * s;
      const caja = [(cx - w / 2) / r + sx, (cy - h / 2) / r + sy, (cx + w / 2) / r + sx, (cy + h / 2) / r + sy];
      const sp = obj * o[b + 5];
      if (sp >= confP) P.push([...caja, sp]);
      let mejor = 0;
      for (const c of VEHICULOS) mejor = Math.max(mejor, o[b + 5 + c]);
      const sv = obj * mejor;
      if (sv >= confV) V.push([...caja, sv]);
    }
    return { P: nms(P), V: nms(V) };
  }

  async _placas(fuente, sx, sy, sw, sh, conf) {
    const { r, datos } = this._letterbox(this.ctxP, TAM_PLACAS, fuente, sx, sy, sw, sh);
    const o = await this._inferir(2, datos, TAM_PLACAS, false, true); // RGB /255
    // (N, 7): [batch, x1,y1,x2,y2, clase, score]
    const res = [];
    for (let i = 0; i < o.length; i += 7) {
      const sc = o[i + 6];
      if (sc < conf) continue;
      res.push([o[i + 1] / r + sx, o[i + 2] / r + sy, o[i + 3] / r + sx, o[i + 4] / r + sy, sc]);
    }
    return res;
  }

  /** Detección completa de un fotograma (canvas a tamaño nativo WxH).
   *  opciones: { tiles: bool, maxZooms: number } */
  async detectar(base, W, H, opciones = {}) {
    const { tiles = true, maxZooms = 99 } = opciones;
    if (this.nativo && !this._verificado) {
      await this._autoverificar(base, W, H);
      this._verificado = true;
    }
    let { P, V } = await this._yolox(base, 0, 0, W, H, CONF_PERSON, CONF_VEHICLE);
    if (tiles) { // 2 tiles verticales para personas pequeñas
      const corte = Math.round(H * (0.5 + TILE_OVERLAP / 2));
      for (const [y1, y2] of [[0, corte], [H - corte, H]]) {
        const t = await this._yolox(base, 0, y1, W, y2 - y1, CONF_PERSON_TILE, 1.01);
        P = P.concat(t.P);
      }
      P = nms(P);
    }
    let PL = await this._placas(base, 0, 0, W, H, CONF_PLATE_FULL);
    // zoom por vehículo: primero los MENORES (sus matrículas son las que lo necesitan)
    const conZoom = [...V].sort((a, b) =>
      (a[2] - a[0]) * (a[3] - a[1]) - (b[2] - b[0]) * (b[3] - b[1])).slice(0, maxZooms);
    for (const v of conZoom) {
      const mw = (v[2] - v[0]) * 0.25, mh = (v[3] - v[1]) * 0.25;
      const cx1 = Math.max(0, v[0] - mw), cy1 = Math.max(0, v[1] - mh);
      const cw = Math.min(W, v[2] + mw) - cx1, ch = Math.min(H, v[3] + mh) - cy1;
      if (cw < 12 || ch < 12) continue;
      PL = PL.concat(await this._placas(base, cx1, cy1, cw, ch, CONF_PLATE_ZOOM));
    }
    return { persons: P, vehicles: V, plates: nms(PL, 0.35) };
  }
}

// ---------- pistas (idéntico a la versión Python) ----------
export function pistas(dets, clase, total) {
  const cfg = TRACK_CFG[clase];
  const tracks = [];
  for (let n = 0; n < total; n++) {
    const lista = dets.get(n)?.[clase] || [];
    for (const det of lista) {
      const caja = det.slice(0, 4);
      let mejor = null, mejorIou = cfg.iou;
      for (const tr of tracks) {
        if (n - tr.ultimoF > cfg.gap || n === tr.ultimoF) continue;
        const v = iou(caja, tr.ultimaB);
        if (v > mejorIou) { mejor = tr; mejorIou = v; }
      }
      if (!mejor) tracks.push({ obs: new Map([[n, caja]]), ultimoF: n, ultimaB: caja });
      else { mejor.obs.set(n, caja); mejor.ultimoF = n; mejor.ultimaB = caja; }
    }
  }
  const porFrame = Array.from({ length: total }, () => []);
  tracks.forEach((tr, i) => {
    const tid = `${clase[0]}${i}`;
    const fs = [...tr.obs.keys()].sort((a, b) => a - b);
    const f0 = fs[0], f1 = fs[fs.length - 1];
    for (let k = 0; k < fs.length - 1; k++) {
      const a = fs[k], b = fs[k + 1];
      porFrame[a].push([tid, tr.obs.get(a)]);
      for (let m = a + 1; m < b; m++) {
        const t = (m - a) / (b - a);
        const ca = tr.obs.get(a), cb = tr.obs.get(b);
        porFrame[m].push([tid, ca.map((v, j) => v * (1 - t) + cb[j] * t)]);
      }
    }
    porFrame[f1].push([tid, tr.obs.get(f1)]);
    for (let m = Math.max(0, f0 - cfg.extend); m < f0; m++) porFrame[m].push([tid, tr.obs.get(f0)]);
    for (let m = f1 + 1; m < Math.min(total, f1 + cfg.extend + 1); m++) porFrame[m].push([tid, tr.obs.get(f1)]);
  });
  return porFrame;
}

// ---------- pixelado ----------
const clip = (v, a, b) => Math.max(a, Math.min(b, v));
export function pixelar(ctx, base, caja, celda) {
  let [x1, y1, x2, y2] = caja.map(Math.round);
  const W = base.width, H = base.height;
  x1 = clip(x1, 0, W); x2 = clip(x2, 0, W); y1 = clip(y1, 0, H); y2 = clip(y2, 0, H);
  const w = x2 - x1, h = y2 - y1;
  if (w < 2 || h < 2) return;
  const nx = clip(Math.floor(w / celda), 3, 16), ny = clip(Math.floor(h / celda), 3, 16);
  const tiny = pixelar._tiny || (pixelar._tiny = new OffscreenCanvas(16, 16));
  const tctx = tiny.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.clearRect(0, 0, 16, 16);
  tctx.drawImage(base, x1, y1, w, h, 0, 0, nx, ny);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, nx, ny, x1, y1, w, h);
  ctx.imageSmoothingEnabled = true;
}

// ---------- elección de códecs ----------
async function elegirSalida(W, H, codecAudio) {
  for (const [vc, Formato, ext, audioOk] of [
    ['avc', Mp4OutputFormat, 'mp4', new Set(['aac', 'mp3', 'opus'])],
    ['vp9', WebMOutputFormat, 'webm', new Set(['opus', 'vorbis'])],
    ['vp8', WebMOutputFormat, 'webm', new Set(['opus', 'vorbis'])],
  ]) {
    if (await canEncodeVideo(vc, { width: W, height: H })) {
      return { vcodec: vc, Formato, ext, audio: codecAudio && audioOk.has(codecAudio) };
    }
  }
  throw new Error('Este navegador no puede codificar vídeo (WebCodecs no disponible).');
}

// ---------- pipeline completo ----------
/**
 * opciones: { salto: 1|2|3, tiles: bool, maxZooms: number }
 * eventos: { fase(nombre, detalle), progreso(pct), vivo(canvas, cajas|null), aviso(txt) }
 * Devuelve { blob, ext, mime, stats }
 */
export async function anonimizar(fichero, opciones, eventos) {
  const { salto = 2, tiles = true, maxZooms = 4 } = opciones || {};
  const ev = { fase() {}, progreso() {}, vivo() {}, aviso() {}, diag() {}, ...eventos };

  const det = new Detectores(opciones?.rutaModelos, opciones?.rutaLibs);
  ev.fase('modelos', 'Cargando los modelos de detección…');
  await det.init(d => ev.fase('modelos', d));
  const textoMotor = extra => {
    const m = det.backend === 'nativo' ? `⚡ motor nativo · ${det.hilos} núcleos`
      : det.backend === 'webgpu' ? '⚡ GPU (WebGPU)'
      : `🐢 CPU wasm · ${det.hilos} hilo${det.hilos > 1 ? 's' : ''}`;
    return `${m} · ${det.modelo}${det.versionApp ? ` · app ${det.versionApp}` : ''}${extra || ''}`;
  };
  ev.diag(textoMotor());

  const input = new Input({ source: new BlobSource(fichero), formats: ALL_FORMATS });
  if (!(await input.canRead())) throw new Error('No puedo leer este vídeo. ¿Es un formato compatible (mp4, mov, webm…)?');
  const pistaV = await input.getPrimaryVideoTrack();
  if (!pistaV) throw new Error('El archivo no tiene pista de vídeo.');
  const pistaA = await input.getPrimaryAudioTrack();
  const codecAudio = pistaA ? await pistaA.getCodec() : null;
  const duracion = await input.computeDuration();

  // --- pasada 1: detección (con cronómetro para saber dónde se va el tiempo) ---
  ev.fase('deteccion', 'Buscando caras, personas y matrículas…');
  const dets = new Map();
  let W = 0, H = 0, total = 0;
  let base = null, bctx = null;
  const tAnalisis0 = performance.now();
  let msDetectar = 0, nAnalizados = 0;
  {
    const sink = new VideoSampleSink(pistaV);
    let n = 0;
    for await (const s of sink.samples()) {
      if (!base) {
        W = s.displayWidth; H = s.displayHeight;
        base = new OffscreenCanvas(W, H);
        bctx = base.getContext('2d', { willReadFrequently: true });
      }
      if (n % salto === 0) {
        s.draw(bctx, 0, 0, W, H); // draw() aplica la rotación del vídeo
        const td = performance.now();
        const d = await det.detectar(base, W, H, { tiles, maxZooms });
        msDetectar += performance.now() - td;
        nAnalizados++;
        dets.set(n, d);
        ev.vivo(base, d);
        if (n === 0 || nAnalizados % 20 === 0) {
          ev.diag(textoMotor(` · vídeo ${W}×${H} · ${Math.round(msDetectar / nAnalizados)} ms/análisis`));
        }
      }
      ev.progreso(Math.min(49, (s.timestamp / duracion) * 49));
      s.close();
      n++;
    }
    total = n;
  }
  if (!total) throw new Error('El vídeo no tiene fotogramas legibles.');
  const segAnalisis = (performance.now() - tAnalisis0) / 1000;

  // --- pistas ---
  ev.fase('pistas', 'Siguiendo cada zona entre fotogramas…');
  const cabezas = pistas(dets, 'persons', total).map(l => l.map(([t, b]) => [t, headRegion(b)]));
  const placas = pistas(dets, 'plates', total);

  // --- pasada 2: pixelar + codificar ---
  const salida = await elegirSalida(W, H, codecAudio);
  const tPixelado0 = performance.now();
  ev.fase('pixelado', `Pixelando y codificando (${salida.vcodec}${salida.audio ? ' + audio' : ''})…`);
  if (pistaA && !salida.audio) ev.aviso('El audio original no cabe en el formato de salida de este navegador; el vídeo saldrá sin sonido.');

  const output = new Output({ format: new salida.Formato({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const fuenteV = new VideoSampleSource({ codec: salida.vcodec, quality: QUALITY_HIGH });
  output.addVideoTrack(fuenteV);
  let fuenteA = null;
  if (salida.audio) {
    fuenteA = new EncodedAudioPacketSource(codecAudio);
    output.addAudioTrack(fuenteA);
  }
  await output.start();

  const regiones = new Map();
  {
    const sink = new VideoSampleSink(pistaV);
    let n = 0;
    for await (const s of sink.samples()) {
      s.draw(bctx, 0, 0, W, H);
      const regs = [];
      if (n < total) {
        for (const [tid, b] of cabezas[n]) regs.push(['head', tid, expandir(b, 0.15, 0.15, 2, W, H)]);
        for (const [tid, b] of placas[n]) regs.push(['plate', tid, expandir(b, 0.30, 0.50, 3, W, H)]);
      }
      for (const [clase, , caja] of regs) pixelar(bctx, base, caja, clase === 'plate' ? 5 : 6);
      regiones.set(n, regs);
      const muestra = new VideoSample(base, { timestamp: s.timestamp, duration: s.duration || 1 / 30 });
      await fuenteV.add(muestra);
      muestra.close();
      if (n % 6 === 0) ev.vivo(base, null);
      ev.progreso(50 + Math.min(45, (s.timestamp / duracion) * 45));
      s.close();
      n++;
    }
  }
  if (fuenteA) {
    ev.fase('audio', 'Copiando el audio original…');
    const psink = new EncodedPacketSink(pistaA);
    const meta = { decoderConfig: await pistaA.getDecoderConfig() };
    let p = await psink.getFirstPacket();
    let primero = true;
    while (p) {
      await fuenteA.add(p, primero ? meta : undefined);
      primero = false;
      p = await psink.getNextPacket(p);
    }
  }
  ev.fase('final', 'Cerrando el archivo…');
  await output.finalize();

  // --- QA de cobertura ---
  let revisadas = 0, sinCubrir = 0;
  for (const [n, d] of dets) {
    const rl = regiones.get(n) || [];
    for (const [clase, regClase, transf] of [['persons', 'head', headRegion], ['plates', 'plate', x => x]]) {
      for (const detq of d[clase]) {
        const target = transf(detq.slice(0, 4));
        const ta = Math.max(1e-6, (target[2] - target[0]) * (target[3] - target[1]));
        let cov = 0;
        for (const r of rl) {
          if (r[0] !== regClase) continue;
          const b = r[2];
          const ix = Math.max(0, Math.min(target[2], b[2]) - Math.max(target[0], b[0]));
          const iy = Math.max(0, Math.min(target[3], b[3]) - Math.max(target[1], b[1]));
          cov = Math.max(cov, ix * iy / ta);
          if (cov >= 0.7) break;
        }
        revisadas++;
        if (cov < 0.7) sinCubrir++;
      }
    }
  }
  ev.progreso(100);

  const mime = salida.ext === 'mp4' ? 'video/mp4' : 'video/webm';
  const blob = new Blob([output.target.buffer], { type: mime });
  input.dispose?.();
  return {
    blob, ext: salida.ext, mime,
    stats: {
      frames: total, duracion, backend: det.backend, hilos: det.hilos,
      modelo: det.modelo, codec: salida.vcodec,
      audio: !!fuenteA, revisadas, sinCubrir,
      detecciones: [...dets.values()].reduce((a, d) => a + d.persons.length + d.plates.length, 0),
      segAnalisis: Math.round(segAnalisis),
      msPorAnalisis: nAnalizados ? Math.round(msDetectar / nAnalizados) : 0,
      segPixelado: Math.round((performance.now() - tPixelado0) / 1000),
    },
  };
}
