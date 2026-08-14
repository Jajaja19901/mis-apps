"""API del Gestor de Marcas de Agua IA (FastAPI).

Endpoints (v1): assets, analyze, process, jobs, results, credits, capabilities, audit.
Autenticación por clave de API, rate limit, declaración de derechos (rights_ack) y registro de acciones.
Motor real: remove-ai-watermarks (con fallback nativo para metadatos).
"""
from __future__ import annotations

import io
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import __version__, engine, native_meta, security, store
from .config import settings
from .schemas import AnalyzeOut, AssetOut, Capabilities, JobOut, Mark, ProcessIn


@asynccontextmanager
async def lifespan(_app: FastAPI):
    cap = engine.capabilities()
    print(f"[watermark-api] motor={cap['engine']} visible={cap['visible']} invisible={cap['invisible']}")

    def _sweep() -> None:
        while True:
            time.sleep(300)
            try:
                store.cleanup_expired()
            except Exception:  # noqa: BLE001
                pass

    threading.Thread(target=_sweep, daemon=True).start()
    yield


app = FastAPI(
    title="Gestor de Marcas de Agua IA — API",
    version=__version__,
    lifespan=lifespan,
    description="Detecta y elimina marcas de agua de IA: ocultas (metadatos/C2PA/firmas), "
    "visibles (sellos de generador) e invisibles (SynthID). Uso responsable: solo contenido propio o autorizado.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _dims(data: bytes) -> tuple[int, int]:
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as im:
            return int(im.width), int(im.height)
    except Exception:  # noqa: BLE001
        return 0, 0


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "version": __version__, "capabilities": engine.capabilities(),
            "counts": store.audit_counts()}


@app.get("/v1/capabilities", response_model=Capabilities)
def get_capabilities(key: str = Depends(security.require_api_key)) -> Capabilities:
    return Capabilities(**engine.capabilities())


@app.post("/v1/assets", response_model=AssetOut)
async def upload_asset(
    request: Request,
    file: UploadFile = File(...),
    key: str = Depends(security.require_api_key),
) -> AssetOut:
    security.rate_limit(key)
    data = await file.read()
    if not data:
        raise HTTPException(400, "Archivo vacío")
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Archivo demasiado grande")
    w, h = _dims(data)
    if w == 0 and h == 0:
        raise HTTPException(400, "No es una imagen válida (PNG, JPG o WEBP)")
    prov = native_meta.detect(data)["has_provenance"]
    rec = store.save_asset(file.filename or "upload", file.content_type or "image/png", data, w, h, prov)
    security.audit("upload", f"{rec['name']} {w}x{h}", key=key, request=request)
    return AssetOut(**{k: rec[k] for k in ("asset_id", "name", "mime", "width", "height", "bytes", "has_provenance")})


@app.post("/v1/analyze", response_model=AnalyzeOut)
def analyze(body: dict, request: Request, key: str = Depends(security.require_api_key)) -> AnalyzeOut:
    security.rate_limit(key)
    asset = store.get_asset(body.get("asset_id", ""))
    if not asset:
        raise HTTPException(404, "asset_id no encontrado")
    result = engine.analyze(Path(asset["path"]))
    security.audit("analyze", f"{asset['name']} · {result['engine']}", key=key, request=request)
    marks = [Mark(**{k: m.get(k, "") for k in ("source", "label", "detail", "kind", "confidence")}) for m in result["marks"]]
    return AnalyzeOut(
        asset_id=asset["asset_id"], engine=result["engine"], is_ai_generated=result.get("is_ai_generated"),
        has_provenance=result["has_provenance"], marks=marks, raw=result.get("raw", {}),
    )


def _run_job(job_id: str) -> None:
    job = store.get_job(job_id)
    if not job:
        return
    asset = store.get_asset(job["asset_id"])
    if not asset:
        store.update_job(job_id, status="failed", error="asset no encontrado")
        return
    store.update_job(job_id, status="running", progress=25)
    src = Path(asset["path"])
    dst = settings.DATA_DIR / f"{job_id}{src.suffix or '.png'}"
    try:
        out = engine.process(job["method"], src, dst, keep_metadata=False)
        surviving = out.get("surviving", [])
        status = "done"
        if job["method"] in ("all", "invisible") and out.get("invisible") == "unavailable":
            status = "done"  # visible+metadatos hechos; invisible requiere GPU (avisado en 'invisible')
        if surviving:
            status = "incomplete"
        store.update_job(
            job_id, status=status, progress=100,
            removed=out.get("removed", []), surviving=surviving,
            invisible=out.get("invisible"), result_path=str(dst),
            quality_score=1.0 if not surviving else 0.5,
        )
    except Exception as exc:  # noqa: BLE001
        store.update_job(job_id, status="failed", progress=100, error=str(exc))


@app.post("/v1/process", response_model=JobOut)
def process(body: ProcessIn, request: Request, key: str = Depends(security.require_api_key)) -> JobOut:
    security.rate_limit(key)
    asset = store.get_asset(body.asset_id)
    if not asset:
        raise HTTPException(404, "asset_id no encontrado")
    if settings.REQUIRE_RIGHTS_ACK and not body.rights_ack:
        raise HTTPException(403, "Debes confirmar que tienes derechos sobre el contenido (rights_ack=true)")
    cost = settings.COSTS.get(body.method, 0)
    job = store.create_job(body.asset_id, body.method, cost)
    security.audit("process", f"{asset['name']} · método={body.method}", key=key, request=request, rights_ack=body.rights_ack)
    store.submit(_run_job, job["job_id"])
    return JobOut(job_id=job["job_id"], status="queued", method=body.method, credits_cost=cost)


@app.get("/v1/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, key: str = Depends(security.require_api_key)) -> JobOut:
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(404, "job_id no encontrado")
    return JobOut(
        job_id=job["job_id"], status=job["status"], method=job["method"], credits_cost=job["credits_cost"],
        progress=job["progress"], quality_score=job["quality_score"],
        removed=job.get("removed", []), surviving=job.get("surviving", []), error=job.get("error"),
    )


@app.get("/v1/results/{job_id}")
def get_result(job_id: str, key: str = Depends(security.require_api_key)) -> FileResponse:
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(404, "job_id no encontrado")
    if job["status"] not in ("done", "incomplete") or not job.get("result_path"):
        raise HTTPException(409, f"Trabajo no listo (estado: {job['status']})")
    p = Path(job["result_path"])
    if not p.exists():
        raise HTTPException(410, "Resultado expirado o borrado")
    return FileResponse(str(p), filename=f"limpio-{Path(job['asset_id']).name}{p.suffix}")


@app.get("/v1/credits")
def credits(key: str = Depends(security.require_api_key)) -> dict:
    # Stub: en producción, saldo real desde el servicio de facturación (Stripe-ready).
    return {"balance": 1000, "plan": "api-demo", "costs": settings.COSTS}


@app.get("/v1/audit")
def audit(key: str = Depends(security.require_api_key)) -> JSONResponse:
    return JSONResponse(security.audit_log())
