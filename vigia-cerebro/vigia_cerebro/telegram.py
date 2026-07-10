"""Envío de alertas por Telegram con cola persistente de reintentos.

Si no hay `token`/`chat_id` configurados en `config.yaml`, la clase avisa UNA vez con un
log claro y a partir de ahí es no-op: la cola sigue aceptando entradas (para no romper a
quien llama) pero el hilo procesador las descarta enseguida con log de depuración, sin
intentar ninguna petición de red.

La cola vive en `datos/telegram_cola.json` (lista de pendientes) y se reescribe de forma
atómica (`.tmp` + `os.replace`) cada vez que cambia, para sobrevivir a un reinicio del
cerebro sin perder alertas pendientes.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from .configuracion import Config

_log = logging.getLogger("vigia.telegram")

_RUTA_COLA = Path("datos/telegram_cola.json")
_BACKOFF_SEG = (5.0, 15.0, 60.0, 300.0)
_MAX_INTENTOS = 8
_LIMITE_VIDEO_BYTES = 50 * 1024 * 1024
_TIMEOUT_SEG = 30.0
_INTERVALO_BUCLE_SEG = 2.0


class Telegram:
    """Cola persistente + hilo procesador que habla con la Bot API de Telegram."""

    def __init__(self, cfg: Config) -> None:
        self._token = (cfg.telegram.token or "").strip()
        self._chat_id = (cfg.telegram.chat_id or "").strip()
        self._configurado = bool(self._token and self._chat_id)
        self._base_url = f"https://api.telegram.org/bot{self._token}"

        self._lock = threading.Lock()
        self._cola: list[dict[str, Any]] = []
        self._aviso_dado = False

        self._cargar_cola()

        if not self._configurado:
            self._avisar_sin_configurar()

        self._parar_evt = threading.Event()
        self._hilo = threading.Thread(target=self._bucle, name="vigia-telegram", daemon=True)
        self._hilo.start()

    # ------------------------------------------------------------------ API
    def encolar_alerta(self, registro: dict) -> None:
        """Encola una foto (miniatura) con el texto de la alerta. Nunca lanza excepción."""
        try:
            evento_id = str(registro.get("id", ""))
            nivel = str(registro.get("nivel", "info"))
            camara_nombre = str(registro.get("camara_nombre", registro.get("camara_id", "")))
            texto = str(registro.get("texto", ""))
            ts = registro.get("ts")
            hora = self._formatear_hora(ts)
            caption = f"[{nivel.upper()}] {camara_nombre}\n{texto}\n{hora}"

            ruta = registro.get("miniatura_ruta")
            if ruta and Path(ruta).is_file():
                entrada = self._entrada("foto", evento_id, str(ruta), caption)
            else:
                entrada = self._entrada("texto", evento_id, None, caption)
            self._encolar(entrada)
        except Exception:
            _log.exception("fallo preparando alerta de Telegram")

    def encolar_clip(self, evento_id: str, ruta: str | None) -> None:
        """Encola el envío del clip mp4 de un evento ya grabado. Nunca lanza excepción."""
        try:
            if not ruta:
                _log.debug("clip sin ruta para %s: no se encola en Telegram", evento_id)
                return
            caption = f"Clip de vídeo del evento {evento_id}"
            entrada = self._entrada("clip", str(evento_id), str(ruta), caption)
            self._encolar(entrada)
        except Exception:
            _log.exception("fallo preparando clip de Telegram para %s", evento_id)

    def probar(self) -> tuple[bool, str]:
        """Diagnóstico manual: valida credenciales llamando a getMe. No usa la cola."""
        if not self._configurado:
            return False, "Telegram no está configurado (falta token o chat_id en config.yaml)"
        try:
            resp = httpx.get(f"{self._base_url}/getMe", timeout=_TIMEOUT_SEG)
            datos = resp.json()
            if resp.status_code == 200 and datos.get("ok"):
                nombre = datos.get("result", {}).get("username", "bot")
                return True, f"conectado correctamente como @{nombre}"
            return False, f"Telegram respondió con error: {datos.get('description', resp.text)}"
        except httpx.HTTPError as e:
            return False, f"no se pudo contactar con Telegram: {e}"

    def parar(self) -> None:
        """Detiene el hilo procesador de forma ordenada (opcional, para apagados limpios)."""
        self._parar_evt.set()
        self._hilo.join(timeout=5)

    # ------------------------------------------------------------ internos
    def _avisar_sin_configurar(self) -> None:
        if not self._aviso_dado:
            _log.warning("[telegram] sin configurar, las alertas no salen de casa")
            self._aviso_dado = True

    @staticmethod
    def _entrada(tipo: str, evento_id: str, ruta: str | None, caption: str) -> dict[str, Any]:
        return {
            "tipo": tipo,  # 'foto' | 'clip' | 'texto'
            "evento_id": evento_id,
            "ruta": ruta,
            "caption": caption,
            "intentos": 0,
            "proximo_intento": 0.0,  # time.monotonic(); 0 = ya mismo
        }

    def _encolar(self, entrada: dict[str, Any]) -> None:
        with self._lock:
            self._cola.append(entrada)
            self._guardar_cola()

    def _bucle(self) -> None:
        while not self._parar_evt.is_set():
            try:
                self._procesar_pendientes()
            except Exception:
                _log.exception("fallo en el bucle procesador de Telegram")
            self._parar_evt.wait(_INTERVALO_BUCLE_SEG)

    def _procesar_pendientes(self) -> None:
        ahora = time.monotonic()
        with self._lock:
            pendientes = [e for e in self._cola if e.get("proximo_intento", 0.0) <= ahora]
        for entrada in pendientes:
            if not self._configurado:
                self._avisar_sin_configurar()
                _log.debug(
                    "telegram sin configurar: descartando %s de evento %s",
                    entrada.get("tipo"), entrada.get("evento_id"),
                )
                self._quitar_de_cola(entrada)
                continue
            self._enviar_una(entrada)

    def _enviar_una(self, entrada: dict[str, Any]) -> None:
        tipo = entrada.get("tipo")
        try:
            if tipo == "foto":
                ok, error = self._enviar_foto(entrada)
            elif tipo == "clip":
                ok, error = self._enviar_clip(entrada)
            else:
                ok, error = self._enviar_texto(entrada)
        except httpx.HTTPError as e:
            ok, error = False, str(e)
        except OSError as e:
            ok, error = False, f"no se pudo leer el archivo: {e}"

        if ok:
            self._quitar_de_cola(entrada)
            return

        entrada["intentos"] = int(entrada.get("intentos", 0)) + 1
        if entrada["intentos"] >= _MAX_INTENTOS:
            _log.warning(
                "descartando envío de Telegram (%s, evento %s) tras %d intentos: %s",
                tipo, entrada.get("evento_id"), entrada["intentos"], error,
            )
            self._quitar_de_cola(entrada)
            return

        espera = _BACKOFF_SEG[min(entrada["intentos"] - 1, len(_BACKOFF_SEG) - 1)]
        entrada["proximo_intento"] = time.monotonic() + espera
        _log.warning(
            "fallo enviando a Telegram (%s, evento %s), intento %d/%d, reintento en %.0fs: %s",
            tipo, entrada.get("evento_id"), entrada["intentos"], _MAX_INTENTOS, espera, error,
        )
        with self._lock:
            self._guardar_cola()

    def _enviar_foto(self, entrada: dict[str, Any]) -> tuple[bool, str]:
        ruta = entrada.get("ruta")
        if not ruta or not Path(ruta).is_file():
            return self._enviar_texto(entrada)
        with open(ruta, "rb") as f:
            resp = httpx.post(
                f"{self._base_url}/sendPhoto",
                data={"chat_id": self._chat_id, "caption": entrada.get("caption", "")},
                files={"photo": (Path(ruta).name, f, "image/jpeg")},
                timeout=_TIMEOUT_SEG,
            )
        return self._interpretar(resp)

    def _enviar_clip(self, entrada: dict[str, Any]) -> tuple[bool, str]:
        ruta = entrada.get("ruta")
        if not ruta or not Path(ruta).is_file():
            return self._enviar_texto(entrada)
        tam = Path(ruta).stat().st_size
        if tam > _LIMITE_VIDEO_BYTES:
            aviso = (
                f"{entrada.get('caption', '')}\n"
                f"(el clip pesa {tam / (1024 * 1024):.0f} MB, supera el límite de 50 MB de "
                "Telegram; revísalo en el panel de administración)"
            )
            entrada = dict(entrada, caption=aviso)
            return self._enviar_texto(entrada)
        with open(ruta, "rb") as f:
            resp = httpx.post(
                f"{self._base_url}/sendVideo",
                data={"chat_id": self._chat_id, "caption": entrada.get("caption", "")},
                files={"video": (Path(ruta).name, f, "video/mp4")},
                timeout=_TIMEOUT_SEG,
            )
        return self._interpretar(resp)

    def _enviar_texto(self, entrada: dict[str, Any]) -> tuple[bool, str]:
        resp = httpx.post(
            f"{self._base_url}/sendMessage",
            data={"chat_id": self._chat_id, "text": entrada.get("caption", "")},
            timeout=_TIMEOUT_SEG,
        )
        return self._interpretar(resp)

    @staticmethod
    def _interpretar(resp: httpx.Response) -> tuple[bool, str]:
        if resp.status_code == 200:
            try:
                if resp.json().get("ok"):
                    return True, ""
            except ValueError:
                pass
        return False, f"http {resp.status_code}: {resp.text[:200]}"

    def _quitar_de_cola(self, entrada: dict[str, Any]) -> None:
        with self._lock:
            if entrada in self._cola:
                self._cola.remove(entrada)
            self._guardar_cola()

    # --------------------------------------------------------- persistencia
    def _cargar_cola(self) -> None:
        try:
            if _RUTA_COLA.exists():
                datos = json.loads(_RUTA_COLA.read_text(encoding="utf-8"))
                if isinstance(datos, list):
                    for e in datos:
                        e.setdefault("proximo_intento", 0.0)
                        e.setdefault("intentos", 0)
                    self._cola = datos
        except Exception:
            _log.exception("no se pudo leer %s, se empieza con cola vacía", _RUTA_COLA)
            self._cola = []

    def _guardar_cola(self) -> None:
        """Escritura atómica de la cola (se llama siempre con `self._lock` tomado)."""
        try:
            _RUTA_COLA.parent.mkdir(parents=True, exist_ok=True)
            tmp = _RUTA_COLA.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self._cola, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, _RUTA_COLA)
        except OSError:
            _log.exception("no se pudo persistir la cola de Telegram")

    @staticmethod
    def _formatear_hora(ts: Any) -> str:
        try:
            return datetime.fromtimestamp(float(ts) / 1000).strftime("%d/%m/%Y %H:%M:%S")
        except (TypeError, ValueError, OSError):
            return datetime.now().strftime("%d/%m/%Y %H:%M:%S")
