"""Tests de la API (usan TestClient; no requieren red ni GPU).

Prueban de verdad: subir, analizar (detecta procedencia), y limpiar (la borra y el
resultado re-analizado ya no tiene procedencia). Funciona con el motor real o el nativo.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from tools.make_sample import make_sample_bytes  # noqa: E402

client = TestClient(app)
KEY = settings.API_KEYS[0]
H = {"Authorization": f"Bearer {KEY}"}


def _upload(data: bytes | None = None, name: str = "ejemplo.png"):
    data = data if data is not None else make_sample_bytes()
    r = client.post("/v1/assets", headers=H, files={"file": (name, data, "image/png")})
    assert r.status_code == 200, r.text
    return r.json()


def _wait(job_id: str) -> dict:
    for _ in range(80):
        j = client.get(f"/v1/jobs/{job_id}", headers=H).json()
        if j["status"] in ("done", "incomplete", "failed"):
            return j
        time.sleep(0.1)
    raise AssertionError("timeout esperando el job")


def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_auth_required():
    r = client.post("/v1/assets", files={"file": ("x.png", b"x", "image/png")})
    assert r.status_code == 401


def test_analyze_detecta_procedencia():
    a = _upload()
    assert a["has_provenance"] is True
    r = client.post("/v1/analyze", headers=H, json={"asset_id": a["asset_id"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_provenance"] is True
    blob = " ".join((m["label"] + " " + m["detail"]) for m in body["marks"]).lower()
    assert any(t in blob for t in ("diffusion", "c2pa", "provenance", "content", "parámetros", "parameters"))


def test_rights_ack_obligatorio():
    a = _upload()
    r = client.post("/v1/process", headers=H, json={"asset_id": a["asset_id"], "method": "metadata", "rights_ack": False})
    assert r.status_code == 403


def test_metadata_borra_procedencia():
    a = _upload()
    r = client.post("/v1/process", headers=H, json={"asset_id": a["asset_id"], "method": "metadata", "rights_ack": True})
    assert r.status_code == 200, r.text
    job = _wait(r.json()["job_id"])
    assert job["status"] == "done", job
    assert job["surviving"] == []
    res = client.get(f"/v1/results/{r.json()['job_id']}", headers=H)
    assert res.status_code == 200
    # El resultado, re-analizado, ya no debe tener procedencia embebida.
    a2 = _upload(res.content, name="limpio.png")
    body2 = client.post("/v1/analyze", headers=H, json={"asset_id": a2["asset_id"]}).json()
    assert body2["has_provenance"] is False, body2


def test_capabilities():
    r = client.get("/v1/capabilities", headers=H)
    assert r.status_code == 200
    assert r.json()["metadata"] is True
