"""Recorrido de demostración contra un servidor en marcha (HTTP real).

Uso: arranca `uvicorn app.main:app` y luego `python -m tools.demo [BASE_URL]`.
Sube una imagen de ejemplo con metadatos de IA, la analiza, borra las marcas ocultas,
descarga el resultado y lo re-analiza para probar que quedó limpio.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.make_sample import make_sample_bytes  # noqa: E402

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8077"
KEY = "dev-key-cambia-esto"
c = httpx.Client(base_url=BASE, headers={"Authorization": f"Bearer {KEY}"}, timeout=60)


def main() -> None:
    cap = c.get("/healthz").json()["capabilities"]
    print(f"1) SALUD           motor={cap['engine']}  visible={cap['visible']}  invisible={cap['invisible']}")

    data = make_sample_bytes()
    a = c.post("/v1/assets", files={"file": ("ejemplo.png", data, "image/png")}).json()
    print(f"2) SUBIR           asset={a['asset_id']}  {a['width']}x{a['height']}  {a['bytes']}B  procedencia={a['has_provenance']}")

    an = c.post("/v1/analyze", json={"asset_id": a["asset_id"]}).json()
    print(f"3) ANALIZAR        engine={an['engine']}  is_ai={an['is_ai_generated']}  procedencia={an['has_provenance']}")
    for m in an["marks"][:7]:
        print(f"     · [{m['kind']}] {m['label']} — {m['detail'][:64]}")

    g = c.post("/v1/process", json={"asset_id": a["asset_id"], "method": "metadata", "rights_ack": False})
    print(f"4) SIN DERECHOS    process(rights_ack=false) -> HTTP {g.status_code} (bloqueado, correcto)")

    job = c.post("/v1/process", json={"asset_id": a["asset_id"], "method": "metadata", "rights_ack": True}).json()
    jid = job["job_id"]
    for _ in range(80):
        j = c.get(f"/v1/jobs/{jid}").json()
        if j["status"] in ("done", "incomplete", "failed"):
            break
        time.sleep(0.1)
    print(f"5) LIMPIAR         job={jid}  estado={j['status']}  sobreviven={j['surviving']}")

    res = c.get(f"/v1/results/{jid}")
    Path("/tmp/wm-clean.png").write_bytes(res.content)
    print(f"6) DESCARGAR       {len(res.content)}B  {res.headers.get('content-type')}")

    a2 = c.post("/v1/assets", files={"file": ("clean.png", res.content, "image/png")}).json()
    an2 = c.post("/v1/analyze", json={"asset_id": a2["asset_id"]}).json()
    print(f"7) RE-ANALIZAR     procedencia={an2['has_provenance']}  marcas={len(an2['marks'])}  -> {'LIMPIO ✓' if not an2['has_provenance'] else 'AÚN CON MARCAS ✗'}")


if __name__ == "__main__":
    main()
