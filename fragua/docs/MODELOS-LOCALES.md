# Modelos locales

Fragua funciona con cualquier modelo servido en tu máquina. No descarga pesos ni
llama a ninguna nube: tú eliges el runtime y el modelo.

## Opción A — Ollama (recomendada)

1. Instala Ollama: <https://ollama.com/download>
2. Descarga un modelo de código y uno de embeddings (una sola vez, con internet):

```bash
ollama pull qwen2.5-coder:7b     # chat/código (equilibrado en 8–16 GB de RAM)
ollama pull nomic-embed-text     # embeddings para búsqueda semántica
```

3. En Fragua: *Configuración → Modelo → perfil "Ollama (local)" → Comprobar conexión*.

Modelos según tu hardware (todos vía `ollama pull`):

| RAM/VRAM | Chat recomendado |
| --- | --- |
| 8 GB | `qwen2.5-coder:3b`, `llama3.2:3b` |
| 16 GB | `qwen2.5-coder:7b`, `deepseek-coder-v2:16b` (MoE) |
| 32 GB+ | `qwen2.5-coder:32b`, `codestral` |

## Opción B — llama.cpp / LM Studio / vLLM (API OpenAI)

Cualquier servidor con endpoint `/v1/chat/completions` sirve. Ejemplos:

```bash
# llama.cpp
llama-server -m modelo.gguf --port 8080
# LM Studio: activa el servidor local (por defecto puerto 1234)
```

En Fragua edita el perfil "llama.cpp / LM Studio": URL base (`http://127.0.0.1:8080/v1`
o `http://127.0.0.1:1234/v1`) y el nombre de modelo que espere tu servidor.

## Opción C — Simulador (sin modelo)

El perfil "Simulador" responde de forma determinista y genera embeddings sintéticos.
Sirve para evaluar toda la aplicación (editor, índice, plantillas, plugins, terminal)
sin instalar nada. Las respuestas no son IA real.

## Parámetros del perfil

- **Ventana de contexto**: debe coincidir con la del modelo servido; Fragua presupuesta
  memoria, fragmentos recuperados y mensajes dentro de ese límite.
- **Temperatura**: 0.1–0.3 para código.
- **Máx. tokens de salida**: reserva de la ventana para la respuesta.
- **Modelo de embeddings**: solo necesario si activas la búsqueda semántica
  (*Configuración → Indexación → Embeddings*). La búsqueda léxica BM25 funciona siempre.

## Diagnóstico rápido

- *Comprobar conexión* en Configuración muestra el estado y los modelos disponibles.
- La barra de estado (abajo a la derecha) revisa la salud del proveedor cada 30 s.
- Errores típicos: servidor no arrancado (`ollama serve`), modelo no descargado
  (`ollama pull …`), puerto distinto al del perfil.
