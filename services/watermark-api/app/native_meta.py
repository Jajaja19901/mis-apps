"""Motor NATIVO ligero: detección y borrado de marcas ocultas (metadatos/procedencia).

Funciona en CPU puro, sin la librería remove-ai-watermarks. Cubre:
- Detección: chunks PNG (tEXt/iTXt/zTXt/eXIf), XMP, EXIF, C2PA/JUMBF y firmas de generadores IA.
- Borrado: PNG reconstruido sin chunks de texto; otros formatos re-codificados (Pillow) sin metadatos.

Es un respaldo honesto; el motor de referencia (remove-ai-watermarks, con c2pa-python oficial)
es más completo y se usa cuando está disponible.
"""
from __future__ import annotations

import re
import struct
import zlib
from pathlib import Path

# Firmas de generadores / procedencia de IA que buscamos "en el código" del archivo.
AI_SIGNATURES: list[tuple[re.Pattern[bytes], str, str]] = [
    (re.compile(rb"c2pa|contentauth|content[_ ]?credentials|jumbf|urn:uuid:.*c2pa", re.I), "C2PA / Content Credentials", "procedencia"),
    (re.compile(rb"synthid|made with google ai|deepmind", re.I), "Google SynthID", "procedencia"),
    (re.compile(rb"trustmark|com\.adobe\.trustmark", re.I), "Adobe TrustMark", "procedencia"),
    (re.compile(rb"dall[\W_]?e|openai", re.I), "OpenAI / DALL·E", "generador"),
    (re.compile(rb"midjourney", re.I), "Midjourney", "generador"),
    (re.compile(rb"stable[ -]?diffusion|automatic1111|sd-webui|comfyui|invokeai", re.I), "Stable Diffusion", "generador"),
    (re.compile(rb"adobe firefly|firefly", re.I), "Adobe Firefly", "generador"),
    (re.compile(rb"nano[ -]?banana|gemini|imagen", re.I), "Google Gemini / Nano Banana", "generador"),
    (re.compile(rb"doubao|jimeng|qwen|kling|yuanbao|liblib|runninghub|baidu", re.I), "Generador IA chino (TC260)", "generador"),
    (re.compile(rb"leonardo\.?ai|ideogram|\bflux\b|runway|\bsora\b|\bveo\b|grok|x\.?ai", re.I), "Otros generadores de IA", "generador"),
    (re.compile(rb"negative prompt|steps:\s?\d|sampler:|cfg scale|seed:\s?\d", re.I), "Parámetros de generación IA", "generador"),
]

_PNG_SIG = b"\x89PNG\r\n\x1a\n"
_TEXT_CHUNKS = {b"tEXt", b"iTXt", b"zTXt", b"eXIf", b"tIME"}


def is_png(data: bytes) -> bool:
    return data[:8] == _PNG_SIG


def _png_chunks(data: bytes):
    """Itera (type, start, end_of_data) de cada chunk PNG."""
    p = 8
    n = len(data)
    while p + 8 <= n:
        (length,) = struct.unpack(">I", data[p : p + 4])
        ctype = data[p + 4 : p + 8]
        start = p + 8
        end = start + length
        if end + 4 > n:
            break
        yield ctype, p, start, end
        p = end + 4
        if ctype == b"IEND":
            break


def _read_png_text(data: bytes, ctype: bytes, start: int, end: int) -> tuple[str, str]:
    raw = data[start:end]
    z = raw.find(b"\x00")
    key = raw[:z].decode("latin-1", "replace") if z >= 0 else ""
    val = ""
    if ctype == b"tEXt":
        val = raw[z + 1 :].decode("latin-1", "replace")
    elif ctype == b"iTXt":
        # key\0 comp(1) method(1) lang\0 transKey\0 text
        try:
            comp = raw[z + 1]
            p = z + 3
            p = raw.find(b"\x00", p) + 1
            p = raw.find(b"\x00", p) + 1
            val = "(comprimido)" if comp else raw[p:].decode("utf-8", "replace")
        except Exception:
            val = ""
    elif ctype == b"zTXt":
        val = "(comprimido zlib)"
    return key, val


def detect(data: bytes) -> dict:
    """Devuelve {marks:[{source,label,detail,kind}], has_provenance:bool}."""
    marks: list[dict] = []
    seen: set[str] = set()

    def push(source: str, label: str, detail: str, kind: str) -> None:
        ident = f"{source}|{label}|{detail[:40]}"
        if ident in seen:
            return
        seen.add(ident)
        marks.append({"source": source, "label": label, "detail": detail[:240], "kind": kind})

    try:
        if is_png(data):
            for ctype, _cs, start, end in _png_chunks(data):
                if ctype in (b"tEXt", b"iTXt", b"zTXt"):
                    key, val = _read_png_text(data, ctype, start, end)
                    push(f"PNG {ctype.decode()}", key or "(texto)", val, "metadato")
                elif ctype == b"eXIf":
                    push("PNG eXIf", "EXIF", "bloque EXIF presente", "metadato")
        head = data[:1_500_000]
        # XMP
        m = re.search(rb"<x:xmpmeta[\s\S]{0,20000}?</x:xmpmeta>", head, re.I)
        if m:
            push("XMP", "packet", f"XMP presente ({len(m.group(0))} bytes)", "metadato")
        # EXIF (JPEG)
        if b"Exif\x00\x00" in head:
            push("EXIF", "bloque", "EXIF presente en el archivo", "metadato")
        # C2PA / JUMBF
        if re.search(rb"jumbf|c2pa|contentauth", head, re.I):
            push("Procedencia", "C2PA", "Manifiesto de Content Credentials detectado", "procedencia")
        # Firmas de IA
        for pat, label, kind in AI_SIGNATURES:
            if pat.search(head):
                push("Firma IA", label, "marca de generador de IA" if kind == "generador" else "credencial de procedencia", kind)
    except Exception:
        pass

    has_prov = any(m["kind"] in ("procedencia", "generador") for m in marks)
    return {"marks": marks, "has_provenance": has_prov}


def _png_strip(data: bytes) -> bytes:
    """Reconstruye el PNG sin chunks de texto/EXIF (borrado sin pérdida de píxeles)."""
    out = bytearray(_PNG_SIG)
    for ctype, cstart, _start, end in _png_chunks(data):
        if ctype in _TEXT_CHUNKS:
            continue
        out += data[cstart : end + 4]
    return bytes(out)


def strip(data: bytes, mime: str = "") -> bytes:
    """Elimina metadatos. PNG: reconstrucción sin pérdida. Otros: re-codificado con Pillow."""
    if is_png(data):
        return _png_strip(data)
    try:
        import io

        from PIL import Image

        img = Image.open(io.BytesIO(data))
        fmt = img.format or ("JPEG" if "jpeg" in mime or "jpg" in mime else "PNG")
        buf = io.BytesIO()
        params: dict = {}
        if fmt in ("JPEG", "JPG"):
            params = {"quality": 92, "subsampling": 0}
            img = img.convert("RGB")
        # Guardar SIN exif/xmp/icc → re-codificado limpio.
        img.save(buf, format=fmt, **params)
        return buf.getvalue()
    except Exception:
        # Sin Pillow o formato no soportado: devolvemos el original (fail-safe).
        return data


def strip_and_verify(src: Path, dst: Path, mime: str = "") -> list[str]:
    """Limpia src → dst y re-escanea. Devuelve la lista de marcas que sobrevivieron ([] = limpio)."""
    data = src.read_bytes()
    cleaned = strip(data, mime)
    dst.write_bytes(cleaned)
    again = detect(cleaned)
    return [m["label"] for m in again["marks"] if m["kind"] in ("procedencia", "generador")]
