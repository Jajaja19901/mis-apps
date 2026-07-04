# Fragua

**Asistente profesional de programación con IA, 100% offline.** Aplicación de escritorio
(Windows / macOS / Linux) que conecta con modelos de lenguaje ejecutados **en tu propia
máquina** para generar, analizar, explicar, depurar y refactorizar código sobre proyectos
reales de miles de archivos. Ningún dato sale de tu equipo.

## Capacidades

| Área | Qué incluye |
| --- | --- |
| **Chat con IA** | Streaming, cancelación, markdown seguro, historial persistente, autotítulos |
| **Memoria** | Notas persistentes (globales o por proyecto) inyectadas en cada petición + compactación automática de conversaciones largas |
| **Editor** | Monaco (el motor de VS Code): pestañas, guardado con versionado, diff lado a lado |
| **Explorador** | Múltiples proyectos abiertos, árbol con reglas .gitignore, crear/renombrar/borrar |
| **Terminal** | xterm.js + node-pty (PTY real; con fallback a tuberías si el módulo nativo falta) |
| **Indexación** | Índice BM25 propio incremental + embeddings opcionales; escala a miles de archivos |
| **Búsqueda semántica** | Léxica, semántica o híbrida (fusión RRF) con salto directo a la línea |
| **Refactorización** | El modelo propone cambios con un protocolo estricto (`fragua:write/patch/delete`); revisión con diff y aplicación atómica con versionado previo |
| **Depuración** | Adjunta ficheros y errores al chat con contexto recuperado del índice |
| **Documentación automática** | Pide docs al modelo y aplícalas como ficheros con el mismo protocolo |
| **Generación de proyectos** | Plantillas deterministas integradas + generación completa vía IA |
| **Comparación de versiones** | Historial local por fichero (cada guardado/edición de IA) con diff y restauración |
| **Plugins** | Carpeta de plugins con manifiesto + comandos JS con acceso controlado al proyecto y al modelo |
| **Export/Import** | Un único `.fragua.json` con configuración, conversaciones, memoria y plantillas |

## Modelos locales soportados

Fragua no incluye pesos de modelos: se conecta a cualquier servidor local:

- **[Ollama](https://ollama.com)** (recomendado): `ollama pull qwen2.5-coder:7b` y listo.
- **llama.cpp server / LM Studio / vLLM / LocalAI** vía API OpenAI-compatible.
- **Simulador integrado**: toda la app funciona sin ningún modelo (útil para probarla).

Cambiar de modelo = cambiar el perfil activo en *Configuración → Modelo*. Ver
[docs/MODELOS-LOCALES.md](docs/MODELOS-LOCALES.md).

## Instalación y desarrollo

Requisitos: Node.js ≥ 20.

```bash
npm install          # dependencias (node-pty es opcional: si no compila, hay fallback)
npm run dev          # desarrollo: tsc --watch + Vite + Electron con recarga
npm test             # 69 tests unitarios y de integración (vitest)
npm run typecheck    # TypeScript estricto en main y renderer
npm run build        # compila main (tsc) + renderer (vite) a dist/
npm start            # build + ejecutar la app empaquetada localmente
npm run dist         # instaladores nativos con electron-builder (AppImage/deb/nsis/dmg)
```

## Arquitectura (resumen)

```
src/
├── shared/    Dominio puro y portable: tipos, contrato IPC tipado, BM25,
│              vectores+RRF, chunker, protocolo de ediciones, markdown seguro,
│              prompts, plantillas. Sin dependencias de Node ni DOM → testeable.
├── main/      Proceso principal Electron: servicios (proyectos, ficheros con
│              historial, indexador, proveedores de IA, chat, terminal, plugins,
│              plantillas, export) + registro IPC. CommonJS vía tsc.
├── preload/   Puente contextBridge con lista blanca de canales.
└── renderer/  UI sin frameworks: TS + DOM + Monaco + xterm, empaquetado con Vite.
```

Decisiones clave y su justificación en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Seguridad y privacidad

- **Offline por diseño**: los únicos sockets salientes van a `127.0.0.1` (tu servidor de modelos). Sin telemetría — el propio tipo `Settings.telemetry: false` lo impide en compilación.
- Renderer con `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta y lista blanca de canales IPC.
- Anti path-traversal en todas las operaciones de fichero (las rutas absolutas y `..` se rechazan).
- El markdown del modelo se renderiza con escapado completo (sin `innerHTML` de origen externo).
- Toda edición destructiva (guardar, parche de IA, borrado) deja versión previa en el historial local.

## Estructura de datos del usuario

Todo vive en el directorio de datos de la app (`~/.config/Fragua` en Linux):
`settings.json`, `conversations/`, `memory.json`, `templates.json`, `plugins/`,
`history/` (versiones), `index/` (índices por proyecto). Borrable y portable.

---

Diseñado por **Incuba tu Negocio · por Jaime M. M.**
