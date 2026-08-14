"""Almacén de assets y trabajos: en memoria + archivos temporales con TTL (borrado automático).

Simula la capa de almacenamiento temporal seguro del blueprint. En producción: object storage
cifrado (S3/GCS) con lifecycle TTL y BD para los trabajos.
"""
from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .config import settings

_lock = threading.Lock()
_assets: dict[str, dict] = {}
_jobs: dict[str, dict] = {}
_pool = ThreadPoolExecutor(max_workers=int(__import__("os").getenv("WM_WORKERS", "2")))


def _uid(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:12]


def save_asset(name: str, mime: str, data: bytes, width: int, height: int, has_provenance: bool) -> dict:
    aid = _uid("a_")
    path = settings.DATA_DIR / f"{aid}{Path(name).suffix or '.bin'}"
    path.write_bytes(data)
    rec = {
        "asset_id": aid, "name": name, "mime": mime, "path": str(path),
        "width": width, "height": height, "bytes": len(data),
        "has_provenance": has_provenance, "created": time.time(),
    }
    with _lock:
        _assets[aid] = rec
    return rec


def get_asset(aid: str) -> dict | None:
    with _lock:
        return _assets.get(aid)


def create_job(asset_id: str, method: str, cost: int) -> dict:
    jid = _uid("j_")
    rec = {
        "job_id": jid, "asset_id": asset_id, "method": method, "status": "queued",
        "credits_cost": cost, "progress": 0, "quality_score": None,
        "removed": [], "surviving": [], "result_path": None, "error": None,
        "created": time.time(),
    }
    with _lock:
        _jobs[jid] = rec
    return rec


def get_job(jid: str) -> dict | None:
    with _lock:
        return _jobs.get(jid)


def update_job(jid: str, **patch) -> None:
    with _lock:
        if jid in _jobs:
            _jobs[jid].update(patch)


def submit(fn, *args) -> None:
    _pool.submit(fn, *args)


def audit_counts() -> dict:
    with _lock:
        return {"assets": len(_assets), "jobs": len(_jobs)}


def cleanup_expired() -> int:
    """Borra assets/resultados vencidos (TTL). Devuelve cuántos borró."""
    now = time.time()
    ttl = settings.FILE_TTL_SECONDS
    removed = 0
    with _lock:
        for aid in list(_assets):
            rec = _assets[aid]
            if now - rec["created"] > ttl:
                try:
                    Path(rec["path"]).unlink(missing_ok=True)
                except Exception:  # noqa: BLE001
                    pass
                _assets.pop(aid, None)
                removed += 1
        for jid in list(_jobs):
            rec = _jobs[jid]
            if now - rec["created"] > ttl:
                rp = rec.get("result_path")
                if rp:
                    try:
                        Path(rp).unlink(missing_ok=True)
                    except Exception:  # noqa: BLE001
                        pass
                _jobs.pop(jid, None)
                removed += 1
    return removed
