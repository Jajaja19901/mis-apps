"""Configuración del servicio (variables de entorno, con valores por defecto seguros)."""
from __future__ import annotations

import os
from pathlib import Path


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    # Claves de API válidas (coma-separadas). En producción, emitidas/revocadas desde BD.
    API_KEYS: list[str] = [
        k.strip() for k in os.getenv("WM_API_KEYS", "dev-key-cambia-esto").split(",") if k.strip()
    ]
    # Límite de peticiones por clave y ventana (token bucket simple en memoria).
    RATE_LIMIT_PER_MIN: int = int(os.getenv("WM_RATE_LIMIT_PER_MIN", "60"))
    # Tamaño máximo de archivo aceptado (bytes).
    MAX_UPLOAD_BYTES: int = int(os.getenv("WM_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
    # Directorio temporal para archivos subidos y resultados.
    DATA_DIR: Path = Path(os.getenv("WM_DATA_DIR", "/tmp/watermark-api-data"))
    # TTL de archivos temporales (segundos). Se borran automáticamente (privacidad).
    FILE_TTL_SECONDS: int = int(os.getenv("WM_FILE_TTL_SECONDS", "3600"))
    # Orígenes CORS permitidos (coma-separados; "*" para demo).
    CORS_ORIGINS: list[str] = [o.strip() for o in os.getenv("WM_CORS_ORIGINS", "*").split(",") if o.strip()]
    # Coste en créditos por operación (informativo; el cobro real va en el servicio de facturación).
    COSTS: dict[str, int] = {"analyze": 0, "metadata": 1, "visible": 4, "all": 8, "invisible": 8}
    # Exigir declaración de derechos (rights_ack) para procesar (uso responsable).
    REQUIRE_RIGHTS_ACK: bool = _bool("WM_REQUIRE_RIGHTS_ACK", True)


settings = Settings()
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
