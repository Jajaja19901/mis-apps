#!/usr/bin/env bash
# ============================================================================
# VIGÍA CEREBRO — instalador asistido (Linux: mini PC, Raspberry Pi 4/5).
# Pensado para NO-técnicos: hace preguntas sencillas y explica cada paso.
# Se puede volver a ejecutar sin miedo: no rompe lo que ya está instalado.
# ============================================================================
set -euo pipefail

# --- Colores sobrios -------------------------------------------------------
VERDE='\033[0;32m'
AMBAR='\033[0;33m'
ROJO='\033[0;31m'
AZUL='\033[0;34m'
NEGRITA='\033[1m'
RESET='\033[0m'

log_info() { echo -e "${AZUL}➜${RESET} $*"; }
log_ok()   { echo -e "${VERDE}✔${RESET} $*"; }
log_warn() { echo -e "${AMBAR}⚠${RESET} $*"; }
log_err()  { echo -e "${ROJO}✘${RESET} $*" >&2; }

manejar_error() {
  local linea="$1"
  echo ""
  log_err "Algo falló en la línea ${linea}. La instalación NO se ha completado."
  log_err "No pasa nada: puedes corregir el problema y volver a ejecutar ./instalar.sh,"
  log_err "es seguro repetirlo (no rompe lo que ya está hecho)."
  exit 1
}
trap 'manejar_error "${LINENO}"' ERR

# --- Sitúa el script en la raíz del proyecto --------------------------------
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${RAIZ}"

VENV="./venv"
BIN="./bin"
DATOS="./datos"
PUERTO_API=8420
PY=""            # se define tras crear el entorno virtual
ARQ=""
PID_PRUEBA=""
PID_TUNEL=""

TMP_CAMARAS="$(mktemp)"
limpiar_temporales() { rm -f "${TMP_CAMARAS}"; }
trap limpiar_temporales EXIT

echo -e "${NEGRITA}"
echo "============================================================"
echo "   VIGÍA CEREBRO — instalador"
echo "   Videovigilancia 24/7 que corre en TU aparato."
echo "============================================================"
echo -e "${RESET}"

# ----------------------------------------------------------------------------
# 1) Detección de plataforma (Linux amd64/arm64/armv7; Termux se delega)
# ----------------------------------------------------------------------------
detectar_plataforma() {
  if [ -z "${VIGIA_FORZAR_LINUX:-}" ] && { [ -n "${TERMUX_VERSION:-}" ] || [[ "${PREFIX:-}" == *com.termux* ]]; }; then
    log_warn "Se ha detectado Termux (Android)."
    log_warn "Este instalador (instalar.sh) es para Linux (mini PC / Raspberry Pi)."
    log_warn "Delegando en termux/instalar-termux.sh, que sí está pensado para tu móvil…"
    echo ""
    exec bash "${RAIZ}/termux/instalar-termux.sh"
  fi

  local so
  so="$(uname -s)"
  if [ "${so}" != "Linux" ]; then
    log_err "Este instalador solo soporta Linux (mini PC / Raspberry Pi). Sistema detectado: ${so}"
    log_err "Para Android usa termux/instalar-termux.sh dentro de Termux."
    exit 1
  fi

  case "$(uname -m)" in
    x86_64|amd64) ARQ="amd64" ;;
    aarch64|arm64) ARQ="arm64" ;;
    armv7l|armv6l|arm) ARQ="arm" ;;
    *) log_err "Arquitectura de procesador no reconocida: $(uname -m)"; exit 1 ;;
  esac
  log_ok "Plataforma detectada: Linux ${ARQ}"
}

# ----------------------------------------------------------------------------
# 2) python3.11+ y ffmpeg (ofrece instalar con apt, con permiso explícito)
# ----------------------------------------------------------------------------
_hay_python_valido() {
  command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null
}

comprobar_dependencias_sistema() {
  local falta_python=false
  local falta_ffmpeg=false

  if _hay_python_valido; then
    log_ok "python3 $(python3 -c 'import sys;print(".".join(map(str, sys.version_info[:3])))') detectado."
  else
    falta_python=true
    log_warn "Se necesita python3.11 o superior y no se ha encontrado."
  fi

  if command -v ffmpeg >/dev/null 2>&1; then
    log_ok "ffmpeg detectado."
  else
    falta_ffmpeg=true
    log_warn "No se ha encontrado ffmpeg."
  fi

  if [ "${falta_python}" = true ] || [ "${falta_ffmpeg}" = true ]; then
    if command -v apt-get >/dev/null 2>&1; then
      local paquetes=""
      [ "${falta_python}" = true ] && paquetes="python3 python3-venv python3-pip"
      [ "${falta_ffmpeg}" = true ] && paquetes="${paquetes} ffmpeg"
      echo ""
      log_warn "Se instalarían estos paquetes con apt: ${paquetes}"
      local resp=""
      read -rp "¿Instalar ahora con 'sudo apt install'? [s/N] " resp || true
      if [[ "${resp}" =~ ^[sS]$ ]]; then
        sudo apt-get update
        # shellcheck disable=SC2086
        sudo apt-get install -y ${paquetes}
      else
        log_err "No se puede continuar sin python3.11+ y ffmpeg. Instálalos y vuelve a ejecutar."
        exit 1
      fi
    else
      log_err "No se ha detectado 'apt' en este sistema."
      log_err "Instala manualmente python3.11+ y ffmpeg según tu distribución y vuelve a ejecutar."
      exit 1
    fi
  fi

  if ! _hay_python_valido; then
    log_err "Sigue sin detectarse python3.11+. Revisa la instalación e inténtalo de nuevo."
    exit 1
  fi
  if ! command -v ffmpeg >/dev/null 2>&1; then
    log_err "Sigue sin detectarse ffmpeg. Revisa la instalación e inténtalo de nuevo."
    exit 1
  fi
}

# ----------------------------------------------------------------------------
# 3) Entorno virtual + dependencias Python (torch CPU primero)
# ----------------------------------------------------------------------------
preparar_entorno_python() {
  if [ ! -d "${VENV}" ]; then
    log_info "Creando entorno virtual en ${VENV}…"
    python3 -m venv "${VENV}"
  else
    log_info "Ya existe el entorno virtual (${VENV}), se reutiliza."
  fi
  PY="${VENV}/bin/python3"

  log_info "Actualizando pip…"
  "${PY}" -m pip install --upgrade pip --quiet

  log_info "Instalando PyTorch versión CPU (más ligera, sin necesitar GPU)…"
  "${PY}" -m pip install torch --extra-index-url https://download.pytorch.org/whl/cpu --quiet

  log_info "Instalando el resto de dependencias (requirements.txt)…"
  "${PY}" -m pip install -r requirements.txt --quiet

  log_info "Instalando soporte de gestos (MediaPipe, opcional)…"
  if "${PY}" -m pip install mediapipe==0.10.35 --quiet; then
    log_ok "Gestos de ocultación disponibles en este equipo."
  else
    log_warn "gestos no disponibles en este equipo (normal en ARM)"
  fi

  log_ok "Entorno Python listo."
}

# ----------------------------------------------------------------------------
# 4) Binarios go2rtc y cloudflared en ./bin
# ----------------------------------------------------------------------------
descargar_binario() {
  local nombre="$1" url="$2" destino="$3"
  if [ -f "${destino}" ]; then
    local resp=""
    read -rp "  ${nombre} ya está descargado. ¿Actualizar a la última versión? [s/N] " resp || true
    if ! [[ "${resp}" =~ ^[sS]$ ]]; then
      log_info "Se mantiene el ${nombre} ya instalado."
      return 0
    fi
  fi
  log_info "Descargando ${nombre} (linux/${ARQ})…"
  if curl -fL --progress-bar -o "${destino}.tmp" "${url}"; then
    mv "${destino}.tmp" "${destino}"
    chmod +x "${destino}"
    log_ok "${nombre} listo en ${destino}."
  else
    rm -f "${destino}.tmp"
    log_err "No se pudo descargar ${nombre} desde ${url}"
    log_err "Comprueba tu conexión a internet e inténtalo de nuevo."
    exit 1
  fi
}

descargar_binarios() {
  mkdir -p "${BIN}"
  descargar_binario "go2rtc" \
    "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_${ARQ}" \
    "${BIN}/go2rtc"
  descargar_binario "cloudflared" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARQ}" \
    "${BIN}/cloudflared"
}

# ----------------------------------------------------------------------------
# 5) Asistente de cámaras
# ----------------------------------------------------------------------------
probar_camara() {
  local rtsp="$1"
  if ! command -v ffprobe >/dev/null 2>&1; then
    log_warn "ffprobe no está disponible; no se puede comprobar la conexión ahora mismo."
    return 0
  fi
  log_info "Probando la conexión con la cámara (hasta 10 s)…"
  if timeout 10 ffprobe -v error -rtsp_transport tcp -i "${rtsp}" \
      -show_entries stream=codec_type -of csv=p=0 >/dev/null 2>&1; then
    log_ok "La cámara responde correctamente."
    return 0
  fi
  log_warn "No se ha podido conectar con esta cámara ahora mismo."
  log_warn "Revisa IP, usuario, contraseña y que esté en la misma red. Puedes seguir:"
  log_warn "se guardará igual y podrás corregirla luego editando config.yaml."
  return 1
}

elegir_url_por_marca() {
  # Usa USUARIO_ENC / CLAVE_ENC / IP (globales) y deja el resultado en RTSP_URL.
  local marca="$1"
  case "${marca}" in
    1) # TP-Link Tapo
      echo "    1) /stream1 (calidad alta)"
      echo "    2) /stream2 (ligero — recomendado si el equipo va justo)"
      local sub=""
      read -rp "    Elige [1/2]: " sub || true
      if [ "${sub}" = "2" ]; then
        RTSP_URL="rtsp://${USUARIO_ENC}:${CLAVE_ENC}@${IP}:554/stream2"
      else
        RTSP_URL="rtsp://${USUARIO_ENC}:${CLAVE_ENC}@${IP}:554/stream1"
      fi
      ;;
    2) # Ezviz
      RTSP_URL="rtsp://${USUARIO_ENC}:${CLAVE_ENC}@${IP}:554/h264/ch1/main/av_stream"
      ;;
    3) # Reolink
      echo "    1) /Preview_01_main"
      echo "    2) /h264Preview_01_main"
      local sub2=""
      read -rp "    Elige [1/2]: " sub2 || true
      if [ "${sub2}" = "2" ]; then
        RTSP_URL="rtsp://${USUARIO_ENC}:${CLAVE_ENC}@${IP}:554/h264Preview_01_main"
      else
        RTSP_URL="rtsp://${USUARIO_ENC}:${CLAVE_ENC}@${IP}:554/Preview_01_main"
      fi
      ;;
    4) # Imou
      RTSP_URL="rtsp://${USUARIO_ENC}:${CLAVE_ENC}@${IP}:554/cam/realmonitor?channel=1&subtype=0"
      ;;
    5) # Hikvision
      RTSP_URL="rtsp://${USUARIO_ENC}:${CLAVE_ENC}@${IP}:554/Streaming/Channels/101"
      ;;
    6) # Otra: URL completa
      read -rp "    Pega la URL RTSP completa (rtsp://usuario:clave@ip:puerto/...): " RTSP_URL || true
      ;;
    *)
      log_warn "Opción no reconocida, se usa la plantilla genérica /stream1."
      RTSP_URL="rtsp://${USUARIO_ENC}:${CLAVE_ENC}@${IP}:554/stream1"
      ;;
  esac
}

asistente_camaras() {
  local n=""
  while true; do
    read -rp "¿Cuántas cámaras vas a conectar? " n || true
    if [[ "${n}" =~ ^[0-9]+$ ]] && [ "${n}" -ge 1 ] && [ "${n}" -le 20 ]; then
      break
    fi
    log_warn "Escribe un número entre 1 y 20."
  done

  local i nombre_cam ip usuario clave marca modo_op modo prioridad ignorar id_cam
  for i in $(seq 1 "${n}"); do
    echo ""
    echo -e "${NEGRITA}— Cámara ${i} de ${n} —${RESET}"
    read -rp "  Nombre (ej. Entrada, Almacén): " nombre_cam || true
    nombre_cam="${nombre_cam:-Cámara ${i}}"
    read -rp "  IP de la cámara (ej. 192.168.1.60): " ip || true
    IP="${ip}"
    read -rp "  Usuario: " usuario || true
    read -rsp "  Contraseña: " clave || true
    echo ""

    USUARIO_ENC="$("${PY}" -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe=""))' "${usuario}")"
    CLAVE_ENC="$("${PY}" -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe=""))' "${clave}")"

    echo "  Marca de la cámara:"
    echo "    1) TP-Link Tapo"
    echo "    2) Ezviz"
    echo "    3) Reolink"
    echo "    4) Imou"
    echo "    5) Hikvision"
    echo "    6) Otra (pegar URL completa)"
    read -rp "  Elige [1-6]: " marca || true
    elegir_url_por_marca "${marca}"

    echo "  Modo de la cámara:"
    echo "    1) comercio   2) casa   3) parking"
    read -rp "  Elige [1-3]: " modo_op || true
    case "${modo_op}" in
      2) modo="casa" ;;
      3) modo="parking" ;;
      *) modo="comercio" ;;
    esac

    read -rp "  Prioridad 1-3 (3 = más ciclos de análisis y detecta gestos de ocultación): " prioridad || true
    [[ "${prioridad}" =~ ^[1-3]$ ]] || prioridad=2

    read -rp "  ¿Ignorar mascotas (perro/gato) para no generar avisos? [s/N] " ignorar || true
    if [[ "${ignorar}" =~ ^[sS]$ ]]; then ignorar="true"; else ignorar="false"; fi

    probar_camara "${RTSP_URL}" || true

    id_cam="cam${i}"
    "${PY}" - "${id_cam}" "${nombre_cam}" "${RTSP_URL}" "${modo}" "${prioridad}" "${ignorar}" <<'PY' >> "${TMP_CAMARAS}"
import json
import sys

id_, nombre, rtsp, modo, prioridad, ignorar = sys.argv[1:7]
print(json.dumps({
    "id": id_,
    "nombre": nombre,
    "rtsp": rtsp,
    "modo": modo,
    "prioridad": int(prioridad),
    "armada": True,
    "ignorar_mascotas": ignorar == "true",
    "fps_objetivo": 5,
}))
PY
    log_ok "Cámara '${nombre_cam}' guardada como '${id_cam}'."
  done
}

# ----------------------------------------------------------------------------
# 6) Token + config.yaml (+ Telegram opcional)
# ----------------------------------------------------------------------------
configurar_cerebro() {
  local reconfigurar=true
  if [ -f "config.yaml" ]; then
    echo ""
    log_warn "Ya existe un config.yaml en esta carpeta."
    local resp=""
    read -rp "¿Reconfigurar cámaras, token y Telegram desde cero? Esto SOBREESCRIBE tu config actual. [s/N] " resp || true
    if [[ "${resp}" =~ ^[sS]$ ]]; then reconfigurar=true; else reconfigurar=false; fi
  fi

  if [ "${reconfigurar}" = true ]; then
    : > "${TMP_CAMARAS}"
    echo ""
    echo -e "${NEGRITA}Configuración de cámaras${RESET}"
    asistente_camaras

    echo ""
    echo -e "${NEGRITA}Telegram (opcional) — avisos con foto y vídeo en tu móvil${RESET}"
    echo "  1) En Telegram, habla con @BotFather → envía /newbot → sigue los pasos → te da un TOKEN."
    echo "  2) Habla con @userinfobot → te da tu CHAT ID."
    echo "  3) Pégalos aquí (déjalo en blanco para omitir Telegram por ahora)."
    local tg_token="" tg_chat=""
    read -rp "  Token del bot (opcional): " tg_token || true
    read -rp "  Chat ID (opcional): " tg_chat || true

    VIGIA_TOKEN="$("${PY}" -c 'import secrets;print(secrets.token_hex(16))')"

    VIGIA_TOKEN="${VIGIA_TOKEN}" VIGIA_TG_TOKEN="${tg_token}" VIGIA_TG_CHAT="${tg_chat}" \
      "${PY}" - "${TMP_CAMARAS}" <<'PY'
import json
import os
import sys

import yaml

ruta_camaras = sys.argv[1]
camaras = []
with open(ruta_camaras, encoding="utf-8") as f:
    for linea in f:
        linea = linea.strip()
        if linea:
            camaras.append(json.loads(linea))

datos = {
    "token": os.environ["VIGIA_TOKEN"],
    "puerto_api": 8420,
    "go2rtc": {"binario": "./bin/go2rtc", "puerto_api": 1984, "puerto_rtsp": 8554},
    "evidencia": {"carpeta": "./datos/clips", "limite_gb": 5, "pre_seg": 10, "post_seg": 20},
    "telegram": {
        "token": os.environ.get("VIGIA_TG_TOKEN", ""),
        "chat_id": os.environ.get("VIGIA_TG_CHAT", ""),
    },
    "armado": {"global": True, "horario": {"activo": False, "inicio": "22:00", "fin": "08:00"}},
    "deteccion": {"imgsz": 416, "confianza": 0.35, "dispositivo": "cpu"},
    "camaras": camaras,
}
with open("config.yaml", "w", encoding="utf-8") as f:
    yaml.safe_dump(datos, f, allow_unicode=True, sort_keys=False)
os.chmod("config.yaml", 0o600)
PY
    PUERTO_API=8420
    log_ok "config.yaml creado (permisos 600: solo tú puedes leerlo)."
  else
    VIGIA_TOKEN="$("${PY}" -c "import yaml;print(yaml.safe_load(open('config.yaml'))['token'])")"
    PUERTO_API="$("${PY}" -c "import yaml;print(yaml.safe_load(open('config.yaml')).get('puerto_api', 8420))")"
    log_info "Se mantiene el config.yaml existente."
  fi
}

# ----------------------------------------------------------------------------
# 7) Arranque de prueba
# ----------------------------------------------------------------------------
arranque_de_prueba() {
  mkdir -p "${DATOS}"
  log_info "Arrancando el cerebro 15 segundos para comprobar que todo funciona…"
  nohup "${PY}" -m vigia_cerebro.principal > "${DATOS}/arranque_prueba.log" 2>&1 &
  PID_PRUEBA=$!
  disown

  local ok=false i
  for i in $(seq 1 15); do
    sleep 1
    if curl -fsS "http://localhost:${PUERTO_API}/salud" 2>/dev/null | grep -q '"ok":true'; then
      ok=true
      break
    fi
    if ! kill -0 "${PID_PRUEBA}" 2>/dev/null; then
      break
    fi
  done

  if [ "${ok}" = true ]; then
    log_ok "El cerebro ha arrancado correctamente (GET /salud → ok)."
  else
    log_err "El cerebro no respondió en /salud tras 15 segundos. Este es su registro:"
    tail -n 40 "${DATOS}/arranque_prueba.log" >&2 || true
    kill "${PID_PRUEBA}" 2>/dev/null || true
    log_err "Revisa el error de arriba (falta un módulo, una cámara mal puesta, un puerto ocupado…)"
    log_err "y vuelve a ejecutar ./instalar.sh cuando lo hayas corregido."
    exit 1
  fi
}

# ----------------------------------------------------------------------------
# 8) Túnel público + QR + resumen final
# ----------------------------------------------------------------------------
mostrar_resumen_final() {
  log_info "Abriendo túnel público con Cloudflare (puede tardar unos segundos)…"
  nohup "${BIN}/cloudflared" tunnel --url "http://localhost:${PUERTO_API}" > "${DATOS}/tunel.log" 2>&1 &
  PID_TUNEL=$!
  disown

  local url_publica="" i
  for i in $(seq 1 30); do
    sleep 1
    url_publica="$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "${DATOS}/tunel.log" 2>/dev/null | head -n1 || true)"
    [ -n "${url_publica}" ] && break
  done

  echo ""
  echo -e "${VERDE}════════════════════════════════════════════════════════════${RESET}"
  echo -e "${NEGRITA}  VIGÍA CEREBRO — instalación completada${RESET}"
  echo -e "${VERDE}════════════════════════════════════════════════════════════${RESET}"

  if [ -n "${url_publica}" ]; then
    echo -e "  URL pública : ${NEGRITA}${url_publica}${RESET}"
    echo -e "  Token       : ${NEGRITA}${VIGIA_TOKEN}${RESET}"
    echo ""
    echo -e "  Escanea este código QR desde la app VIGÍA (modo mando):"
    echo ""
    "${PY}" -c '
import sys
try:
    import qrcode
except ImportError:
    print("(no se pudo dibujar el QR: falta la librería qrcode)")
    sys.exit(0)
qr = qrcode.QRCode(border=1)
qr.add_data(sys.argv[1])
qr.make()
qr.print_ascii(invert=True)
' "vigia://${url_publica}#${VIGIA_TOKEN}" || log_warn "No se pudo dibujar el QR."
    echo ""
    echo "  Si no puedes escanear, pega en la app: URL + token de arriba."
  else
    log_warn "No se pudo obtener la URL pública del túnel en 30 s."
    log_warn "Revisa ${DATOS}/tunel.log. Mientras tanto puedes usar la app en tu red local:"
    echo -e "  URL local   : ${NEGRITA}http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PUERTO_API}${RESET}"
    echo -e "  Token       : ${NEGRITA}${VIGIA_TOKEN}${RESET}"
  fi

  echo ""
  echo -e "${AMBAR}  Aviso: la URL de trycloudflare.com CAMBIA cada vez que se reinicia el túnel.${RESET}"
  echo -e "${AMBAR}  Para una URL fija: cuenta gratuita de Cloudflare + túnel con nombre${RESET}"
  echo -e "${AMBAR}  (pasos resumidos en README.md, sección 'URL fija').${RESET}"
  echo -e "${VERDE}════════════════════════════════════════════════════════════${RESET}"
}

# ----------------------------------------------------------------------------
# 9) systemd opcional (arranque automático)
# ----------------------------------------------------------------------------
instalar_servicios_systemd() {
  local usuario ruta_abs
  usuario="$(id -un)"
  ruta_abs="${RAIZ}"

  log_info "Deteniendo la instancia de prueba antes de instalar el servicio…"
  if [ -n "${PID_PRUEBA}" ]; then kill "${PID_PRUEBA}" 2>/dev/null || true; fi
  if [ -n "${PID_TUNEL}" ]; then kill "${PID_TUNEL}" 2>/dev/null || true; fi
  sleep 1

  log_info "Se necesitan permisos de administrador (sudo) para instalar el servicio."
  sed -e "s#__RUTA__#${ruta_abs}#g" -e "s#__USUARIO__#${usuario}#g" \
    "systemd/vigia-cerebro.service" | sudo tee /etc/systemd/system/vigia-cerebro.service >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable --now vigia-cerebro.service
  log_ok "Servicio vigia-cerebro instalado y arrancado (arranca solo al encender el equipo)."

  local resp_tunel=""
  read -rp "¿Instalar también el servicio del túnel público (vigia-tunel)? [s/N] " resp_tunel || true
  if [[ "${resp_tunel}" =~ ^[sS]$ ]]; then
    sed -e "s#__RUTA__#${ruta_abs}#g" -e "s#__USUARIO__#${usuario}#g" \
      "systemd/vigia-tunel.service" | sudo tee /etc/systemd/system/vigia-tunel.service >/dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable --now vigia-tunel.service
    log_ok "Servicio vigia-tunel instalado y arrancado."
    log_warn "Recuerda: la URL pública CAMBIA cada vez que se reinicia este servicio."
    log_warn "Consulta la URL actual con: sudo journalctl -u vigia-tunel -n 20 --no-pager"
  else
    log_info "No se instaló el túnel como servicio. Lánzalo a mano cuando lo necesites:"
    log_info "  ${BIN}/cloudflared tunnel --url http://localhost:${PUERTO_API}"
  fi
}

ofrecer_arranque_automatico() {
  if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    echo ""
    local resp=""
    read -rp "¿Instalar el servicio systemd para que el cerebro arranque solo al encender el equipo? [s/N] " resp || true
    if [[ "${resp}" =~ ^[sS]$ ]]; then
      instalar_servicios_systemd
    else
      log_info "No se instaló ningún servicio."
      log_info "El cerebro y el túnel de esta sesión siguen corriendo en segundo plano"
      log_info "(PID cerebro: ${PID_PRUEBA} · PID túnel: ${PID_TUNEL}). Para pararlos:"
      log_info "  kill ${PID_PRUEBA} ${PID_TUNEL}"
    fi
  else
    log_info "Este sistema no tiene systemd. El cerebro sigue corriendo en segundo plano de esta sesión"
    log_info "(PID cerebro: ${PID_PRUEBA} · PID túnel: ${PID_TUNEL})."
  fi
}

# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
main() {
  detectar_plataforma
  comprobar_dependencias_sistema
  preparar_entorno_python
  descargar_binarios
  configurar_cerebro
  arranque_de_prueba
  mostrar_resumen_final
  ofrecer_arranque_automatico

  echo ""
  log_ok "Todo listo. Gracias por instalar VIGÍA CEREBRO."
}

main "$@"
