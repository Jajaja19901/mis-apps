# Arquitectura de Fragua

Este documento justifica cada decisión técnica del proyecto.

## 1. Objetivos que condicionan el diseño

1. **100% offline**: ningún byte sale de la máquina; la IA es un servidor local.
2. **Proyectos enormes**: miles de archivos indexados sin congelar la UI.
3. **Producto comercial**: seguridad de escritorio seria, datos del usuario portables,
   instaladores nativos, base de código testeable y ampliable.
4. **Modelo intercambiable**: cambiar de runtime de IA sin tocar el resto de la app.

## 2. Elección de plataforma: Electron + TypeScript

| Alternativa | Por qué se descartó |
| --- | --- |
| Tauri (Rust) | Excelente peso, pero exige toolchain Rust y duplicar el dominio en dos lenguajes; el editor y el terminal (Monaco/xterm) siguen siendo web igualmente. |
| App nativa (Qt/Swift/WinUI) | Triplica el coste multiplataforma y renuncia a Monaco, el mejor editor embebible existente. |
| Web app + servidor local | Rompe el requisito de escritorio (diálogos nativos, PTY, ficheros) y complica la instalación. |

Electron da acceso directo a PTY, filesystem y diálogos nativos con un único lenguaje
(TypeScript estricto de punta a punta) y es la plataforma de VS Code: el caso de uso
más parecido a Fragua que existe.

**Renderer sin framework** (sin React/Vue): la UI es un IDE con pocos árboles de
componentes muy estables; DOM directo + un helper `h()` de 100 líneas elimina una
dependencia pesada, reduce superficie de ataque y mantiene el arranque rápido.
Monaco y xterm son los dos únicos componentes grandes, y son inevitables por calidad.

## 3. Los tres procesos y el contrato IPC

```
┌───────────── renderer (sandbox, sin Node) ─────────────┐
│  UI: Monaco, xterm, paneles. Importa SOLO src/shared.  │
└──────────────△─────────────────────────────────────────┘
               │ window.fragua (contextBridge, lista blanca)
┌──────────────▽─────────────── preload ─────────────────┐
└──────────────△─────────────────────────────────────────┘
               │ ipcMain.handle / webContents.send
┌──────────────▽──────────────── main ───────────────────┐
│  Servicios: Settings, Projects, Files(+historial),     │
│  Indexer, Providers IA, Chat, Conversations, Memory,   │
│  Terminal, Plugins, Templates, Exporter                │
└────────────────────────────────────────────────────────┘
```

`src/shared/ipc.ts` define **un mapa canal → {petición, respuesta}**. El helper de
registro en main y el puente del preload usan ese mapa: usar un canal con el payload
equivocado **no compila**. Los eventos asíncronos (streaming de IA, datos de terminal,
progreso de indexado, cambios de fichero) van en un mapa separado main→renderer.

Regla de dependencias: `shared` no importa nada de Node ni del DOM → es ejecutable en
los dos procesos y en vitest sin mocks. Los servicios de main reciben su directorio de
datos y sus emisores por constructor → integración testeable con directorios temporales
(así están escritos los tests de `tests/services.test.ts`).

## 4. IA local intercambiable

`AiProvider` es la única interfaz que el resto de la app conoce:

```ts
chat(messages, {temperature, maxOutputTokens, signal, onDelta}): Promise<string>
embed(texts): Promise<number[][]>
health(): Promise<ProviderHealth>
```

Tres implementaciones completas: **Ollama** (protocolo NDJSON nativo),
**OpenAI-compatible** (SSE; llama.cpp server, LM Studio, vLLM, LocalAI) y
**Mock** (determinista, streaming simulado y embeddings por trigramas: permite usar y
testear TODA la aplicación sin ningún modelo instalado). Los perfiles de modelo viven
en Settings; el proveedor activo se cachea y se reconstruye al cambiar el perfil.

El streaming usa `fetch` + `ReadableStream` con `AbortController` (cancelación real
desde la UI) y timeouts de conexión para diagnósticos claros ("¿está arrancado el
servidor del modelo?").

## 5. Indexación que escala

- **Troceado**: ventanas de ~60 líneas con solape de 10, cortando en fronteras
  naturales (línea en blanco / inicio de declaración) y extrayendo símbolos por regex
  multi-lenguaje. Id de chunk = hash estable de ruta+rango+contenido.
- **Índice léxico BM25 propio** (`shared/bm25.ts`): tokenización consciente de código
  (camelCase, snake_case), boost de símbolos, inserción/borrado incremental y
  serialización JSON. Siempre disponible, sin modelo. Es la base: en código, la
  búsqueda léxica bien tokenizada rinde sorprendentemente cerca de la semántica.
- **Vectores opcionales** (`shared/vector.ts`): embeddings del proveedor, normalizados
  y **cuantizados a int8** (4× menos memoria/disco), búsqueda coseno por fuerza bruta
  con typed arrays. Para el objetivo (≤60k chunks) la fuerza bruta es más rápida y
  simple que un ANN y no añade dependencias nativas.
- **Híbrida**: fusión Reciprocal Rank Fusion de ambos rankings (sin calibrar escalas).
- **Incremental**: hash FNV-1a por fichero; solo se reprocesa lo que cambia (el
  watcher de proyecto dispara reindexado por fichero con debounce). Durante el build
  se cede el event loop cada 200 ficheros para no bloquear IPC.
- **Límites configurables**: tamaño máximo de fichero, número máximo de chunks,
  exclusiones (.gitignore + defaults + globs de usuario).

## 6. Contexto del chat con presupuesto

`promptBuilder.assembleChatRequest` compone cada petición dentro de la ventana del
modelo: system (protocolo de edición) + memoria (10%) + fragmentos recuperados (35%) +
adjuntos (20%) + resumen de conversación (10%) + cola de mensajes recientes hasta agotar
presupuesto. Cuando una conversación supera 24 mensajes, el `ChatService` la **compacta**:
resume los antiguos con el propio modelo y conserva los 8 últimos (el resumen pasa a
inyectarse en el system). La estimación de tokens es char-based deliberadamente
conservadora (sin tokenizador por modelo, sobreestimar es lo seguro).

## 7. Protocolo de ediciones (refactor/generación seguros)

El system prompt exige bloques `fragua:write|patch|delete path=…`. El parser
(`shared/editProtocol.ts`) además tolera variantes habituales de modelos locales
(ruta en la línea anterior, bloques ```diff con cabeceras `+++`). Las rutas se sanean
(nada absoluto, nada con `..`). Los parches unificados se aplican con **búsqueda de
contexto en ventana creciente**, porque los modelos locales fallan los números de línea.
Antes de tocar cualquier fichero se guarda versión en el historial local → toda edición
de la IA es reversible con un clic. La UI muestra el plan (diff por operación) y el
usuario decide aplicar.

## 8. Seguridad

- Renderer: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
  CSP estricta, permisos de Chromium denegados por defecto, navegación externa
  bloqueada (los enlaces van al navegador del sistema).
- IPC: lista blanca doble (preload y contrato tipado); los handlers capturan toda
  excepción (un fallo interno nunca tumba el main).
- Ficheros: resolución anti-traversal centralizada; límites de tamaño; detección de
  binarios por extensión y contenido.
- Markdown del modelo: renderizador propio con escapado total; enlaces solo http(s).
- Plugins: código local del usuario ejecutado en main (como las extensiones de
  VS Code); el aislamiento es de errores por llamada, no de privilegios, y así se
  documenta explícitamente. Manifiestos validados; comandos con contexto acotado.

## 9. Persistencia

JSON con **escritura atómica** (tmp + rename) para sobrevivir a cortes de luz:
`settings.json`, `conversations/*.json`, `memory.json`, `templates.json`,
`index/<proyecto>.json`, `history/<proyecto>/<fichero>/<version>.json` (máx. 20 por
fichero, poda automática). Sin base de datos nativa: cero fricción de instalación,
datos legibles y exportables (bundle `.fragua.json` versionado con validación).

## 10. Calidad

- TypeScript `strict` + `noUncheckedIndexedAccess` en los tres procesos.
- 69 tests (vitest): unitarios del dominio (BM25, vectores, chunker, ignore,
  protocolo de ediciones, markdown, prompts, plantillas) e integración de servicios
  reales sobre directorios temporales, incluido el flujo completo de chat con
  streaming usando el MockProvider.
- Build reproducible: `tsc` (main, CJS) + Vite (renderer, chunks separados para
  Monaco/xterm) + electron-builder (AppImage, deb, NSIS, dmg).
