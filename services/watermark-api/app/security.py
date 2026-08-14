"""Autenticación por clave de API, rate limit y registro de acciones (uso responsable)."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Request

from .config import settings

_lock = threading.Lock()
_buckets: dict[str, deque[float]] = defaultdict(deque)
_audit: deque[dict] = deque(maxlen=1000)


def require_api_key(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> str:
    """Valida la clave (Bearer o X-API-Key). Devuelve la clave si es válida."""
    key = None
    if authorization and authorization.lower().startswith("bearer "):
        key = authorization[7:].strip()
    key = key or x_api_key
    if not key or key not in settings.API_KEYS:
        raise HTTPException(status_code=401, detail="Clave de API inválida o ausente")
    return key


def rate_limit(key: str) -> None:
    """Token bucket por clave: máx settings.RATE_LIMIT_PER_MIN peticiones/minuto."""
    now = time.time()
    with _lock:
        q = _buckets[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= settings.RATE_LIMIT_PER_MIN:
            raise HTTPException(status_code=429, detail="Límite de peticiones superado, prueba en un momento")
        q.append(now)


def audit(action: str, detail: str, *, key: str = "", request: Request | None = None, rights_ack: bool = False) -> None:
    """Registro de acciones append-only (quién/qué/cuándo). Para uso responsable y cumplimiento."""
    ip = request.client.host if request and request.client else ""
    _audit.appendleft({
        "ts": time.time(),
        "action": action,
        "detail": detail[:300],
        "key": (key[:6] + "…") if key else "",
        "ip": ip,
        "rights_ack": bool(rights_ack),
    })


def audit_log() -> list[dict]:
    return list(_audit)
