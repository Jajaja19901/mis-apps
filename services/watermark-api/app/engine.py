"""Registro de motores: usa remove-ai-watermarks cuando está instalado; si no, el motor nativo.

Diseño modular (igual que el blueprint): cada capacidad se resuelve al mejor motor disponible.
- analyze / metadata: remove-ai-watermarks (identify + strip_and_verify) o native_meta. CPU.
- visible: remove-ai-watermarks[visible] (opencv, CPU). Si falta, no disponible.
- invisible: remove-ai-watermarks[diffusion] (CUDA/GPU). Aquí normalmente 'unavailable'.
"""
from __future__ import annotations

import importlib
from pathlib import Path
from typing import Any

from . import native_meta

# ── Detección de capacidades del entorno (import perezoso, sin cargar torch) ──
_raiw: Any = None
_identify: Any = None
_metadata: Any = None
try:  # base install (metadata + identify): pillow, piexif, c2pa-python. CPU.
    _raiw = importlib.import_module("remove_ai_watermarks")
    _identify = importlib.import_module("remove_ai_watermarks.identify")
    _metadata = importlib.import_module("remove_ai_watermarks.metadata")
except Exception:  # noqa: BLE001
    _raiw = None


def _has_cv2() -> bool:
    try:
        importlib.import_module("cv2")
        return True
    except Exception:  # noqa: BLE001
        return False


def _invisible_available() -> bool:
    try:
        eng = importlib.import_module("remove_ai_watermarks.invisible_engine")
        return bool(eng.is_available())
    except Exception:  # noqa: BLE001
        return False


def capabilities() -> dict:
    raiw_ok = _raiw is not None
    visible = raiw_ok and _has_cv2()
    return {
        "engine": "remove-ai-watermarks" if raiw_ok else "native",
        "metadata": True,  # siempre (native como mínimo)
        "identify": raiw_ok,
        "visible": visible,
        "invisible": _invisible_available(),
        "detail": {
            "remove_ai_watermarks_installed": raiw_ok,
            "opencv_installed": _has_cv2(),
            "version": getattr(_raiw, "__version__", None) if raiw_ok else None,
        },
    }


def _marks_from_report(rep_dict: dict) -> list[dict]:
    """Traduce el report de remove-ai-watermarks a nuestras 'marks'."""
    marks: list[dict] = []
    for s in rep_dict.get("signals", []):
        name = s.get("name", "")
        kind = "generador"
        if name.startswith("visible_"):
            kind = "visible"
        elif any(t in name for t in ("c2pa", "synthid", "trustmark", "iptc", "aigc", "provenance")):
            kind = "procedencia"
        marks.append({
            "source": "remove-ai-watermarks",
            "label": name or "señal",
            "detail": str(s.get("detail", "") or ""),
            "kind": kind,
            "confidence": str(s.get("confidence", "") or ""),
        })
    for w in rep_dict.get("watermarks", []):
        marks.append({"source": "remove-ai-watermarks", "label": str(w), "detail": "marca detectada", "kind": "generador"})
    return marks


def analyze(path: Path) -> dict:
    """Detecta marcas ocultas/procedencia. Devuelve dict unificado."""
    if _raiw is not None and _identify is not None:
        try:
            rep = _identify.identify(path, check_visible=True, check_invisible=True)
            raw = rep.to_dict()
            marks = _marks_from_report(raw)
            # Completar con el escáner nativo (chunks/firmas) por si el report no los lista.
            for m in native_meta.detect(path.read_bytes())["marks"]:
                marks.append(m)
            return {
                "engine": "remove-ai-watermarks",
                "is_ai_generated": raw.get("is_ai_generated"),
                "has_provenance": bool(raw.get("ai_from_metadata")) or any(
                    m["kind"] in ("procedencia", "generador") for m in marks
                ),
                "marks": marks,
                "raw": raw,
            }
        except Exception as exc:  # noqa: BLE001
            # Falla segura: caemos al nativo, nunca 500 por un archivo raro.
            native = native_meta.detect(path.read_bytes())
            return {"engine": "native(fallback)", "is_ai_generated": None,
                    "has_provenance": native["has_provenance"], "marks": native["marks"],
                    "raw": {"error": str(exc)}}
    native = native_meta.detect(path.read_bytes())
    return {"engine": "native", "is_ai_generated": None, "has_provenance": native["has_provenance"],
            "marks": native["marks"], "raw": {}}


def strip_metadata(src: Path, dst: Path, mime: str = "") -> list[str]:
    """Borra marcas ocultas (metadatos/procedencia). Devuelve lo que sobreviva ([] = limpio)."""
    if _raiw is not None and _metadata is not None:
        try:
            # keep_standard=False: limpieza a fondo — quita también los tags de texto embebidos
            # (prompt, Software, Comment…), no solo los marcadores de IA. Es lo que el usuario
            # espera de "borrar marcas ocultas" y evita dejar rastros de procedencia en texto.
            _out, surviving = _metadata.strip_and_verify(src, dst, keep_standard=False)
            return sorted(surviving.keys()) if isinstance(surviving, dict) else list(surviving or [])
        except Exception:  # noqa: BLE001
            pass
    return native_meta.strip_and_verify(src, dst, mime)


def remove_visible(src: Path, dst: Path) -> list[str]:
    """Elimina marcas VISIBLES de generador. Requiere remove-ai-watermarks[visible] (opencv)."""
    if _raiw is None or not _has_cv2():
        raise RuntimeError("Motor de marca visible no disponible: instala remove-ai-watermarks[visible]")
    _result, removed = _raiw.remove_visible(str(src), str(dst), strip_metadata=True)
    return list(removed or [])


def remove_all(src: Path, dst: Path) -> dict:
    """Pipeline completo (visible → invisible → metadatos). El invisible cae a 'unavailable' sin GPU."""
    if _raiw is None or not _has_cv2():
        raise RuntimeError("El modo 'all' requiere remove-ai-watermarks[visible] (opencv)")
    result = _raiw.remove_all(str(src), str(dst))
    label = getattr(result, "visible_label", None)
    return {"removed": [label] if label else [], "invisible": getattr(result, "invisible", None)}


def process(method: str, src: Path, dst: Path, *, keep_metadata: bool = False) -> dict:
    """Despachador único que usa el worker. Lanza RuntimeError con mensaje claro si falta un extra."""
    if method == "metadata":
        surviving = strip_metadata(src, dst)
        return {"removed": [], "surviving": surviving, "invisible": None, "engine": capabilities()["engine"]}
    if method == "visible":
        removed = remove_visible(src, dst)
        return {"removed": removed, "surviving": [], "invisible": None, "engine": "remove-ai-watermarks"}
    if method in ("all", "invisible"):
        res = remove_all(src, dst)
        return {"removed": res["removed"], "surviving": [], "invisible": res["invisible"], "engine": "remove-ai-watermarks"}
    raise RuntimeError(f"Método no soportado: {method}")
