# Watermark API — backend del Gestor de Marcas de Agua IA

Servicio **FastAPI** que hace funcionar de verdad la detección y el borrado de marcas de agua de IA,
integrando el motor real **[`remove-ai-watermarks`](https://github.com/wiltodelta/remove-ai-watermarks)**
(Apache-2.0) de wiltodelta. Es el backend que el blueprint (`docs/watermark-saas/ARQUITECTURA.md`)
describía; el frontend `apps/gestor-marcas-agua-ia.html` lo usa cuando lo configuras (si no, procesa en local).

## Qué hace (y qué necesita)

| Capacidad | Endpoint / método | GPU | Motor |
|-----------|-------------------|-----|-------|
| Detectar procedencia oculta (C2PA, EXIF, XMP, IPTC, chunks, firmas de IA) | `POST /v1/analyze` | No | remove-ai-watermarks `identify` (o nativo) |
| Borrar marcas ocultas (metadatos/procedencia) | `POST /v1/process` `method=metadata` | No | `metadata.strip_and_verify` (o nativo) |
| Quitar marca **visible** de generador (Gemini, Doubao, Kling…) | `method=visible` | No | `remove_visible` (opencv) |
| Pipeline completo (visible → invisible → metadatos) | `method=all` | Recom. | `remove_all` |
| Romper marca **invisible** (SynthID) | `method=invisible` | **Sí (CUDA)** | `[diffusion]` (si no, `unavailable`) |

Sin la librería instalada, un **motor nativo** ligero (Pillow, bytes) cubre detección y borrado de
metadatos en CPU, así que el servicio arranca y funciona igualmente.

## Arrancar en local

```bash
cd services/watermark-api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt          # núcleo (FastAPI, uvicorn, pillow)
pip install -r requirements-engine.txt   # motor real CPU (remove-ai-watermarks[visible,detect])
uvicorn app.main:app --reload --port 8000
```

Comprueba: `curl localhost:8000/healthz` → muestra el motor activo y sus capacidades.

### Docker

```bash
docker build -t watermark-api services/watermark-api
docker run -p 8000:8000 -e WM_API_KEYS=mi-clave watermark-api
```

## Uso rápido (HTTP real)

```bash
# 1) sube una imagen
curl -s -H "Authorization: Bearer dev-key-cambia-esto" -F file=@foto.png \
     localhost:8000/v1/assets                              # -> {asset_id: ...}
# 2) analiza (detecta procedencia)
curl -s -H "Authorization: Bearer dev-key-cambia-esto" -H "Content-Type: application/json" \
     -d '{"asset_id":"a_..."}' localhost:8000/v1/analyze
# 3) borra las marcas ocultas (requiere rights_ack)
curl -s -H "Authorization: Bearer dev-key-cambia-esto" -H "Content-Type: application/json" \
     -d '{"asset_id":"a_...","method":"metadata","rights_ack":true}' localhost:8000/v1/process
# 4) descarga el resultado limpio
curl -s -H "Authorization: Bearer dev-key-cambia-esto" localhost:8000/v1/results/j_... -o limpio.png
```

O el recorrido guiado, con imagen de ejemplo incluida:

```bash
python -m tools.demo http://localhost:8000
```

## Seguridad y uso responsable

- **Clave de API** obligatoria (`Authorization: Bearer …` o `X-API-Key`), configurable con `WM_API_KEYS`.
- **Rate limit** por clave (`WM_RATE_LIMIT_PER_MIN`).
- **`rights_ack` obligatorio** para procesar: declaración de que el contenido es propio o autorizado
  (uso responsable). Queda en el **registro de acciones** (`GET /v1/audit`).
- **Almacenamiento temporal con TTL**: los archivos se borran solos (`WM_FILE_TTL_SECONDS`). Privacidad.
- CORS configurable (`WM_CORS_ORIGINS`).

Igual que la librería que integra: **solo para contenido propio o con autorización**; no está pensado
para eludir la procedencia de material protegido de terceros. Ver `docs/watermark-saas/ARQUITECTURA.md` §9.

## Estructura

```
services/watermark-api/
├─ app/
│  ├─ main.py         # FastAPI + rutas v1
│  ├─ engine.py       # registro de motores (remove-ai-watermarks | nativo)
│  ├─ native_meta.py  # detección/borrado de metadatos en CPU puro (fallback)
│  ├─ security.py     # API key, rate limit, registro de acciones
│  ├─ store.py        # assets/trabajos en memoria + temporales con TTL
│  ├─ schemas.py      # modelos Pydantic
│  └─ config.py       # variables de entorno
├─ tests/test_api.py  # sube → analiza → limpia → re-analiza (motor real o nativo)
├─ tools/             # make_sample.py (imagen con metadatos IA), demo.py
├─ requirements.txt · requirements-engine.txt · Dockerfile · .env.example
```

## Tests

```bash
. .venv/bin/activate && pip install pytest httpx && pytest -q
```

## Producción (resumen del blueprint)

Para escalar: poner esto detrás de un API Gateway (rate limit/WAF), mover la cola a Redis/SQS con
workers **CPU** (metadatos/visible) y **GPU** (invisible/SynthID) autoescalables por separado, BD
PostgreSQL para trabajos/créditos, object storage cifrado con TTL, y Stripe para facturación.
Detalle completo en `docs/watermark-saas/ARQUITECTURA.md`.
