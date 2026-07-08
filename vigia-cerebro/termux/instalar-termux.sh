#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
# VIGÍA CEREBRO — instalador para Android + Termux (EXPERIMENTAL).
#
# AVISO HONESTO antes de empezar: un móvil no es un mini PC. Esto funciona,
# pero con límites claros: como máximo 1-2 cámaras, SIN gestos de ocultación
# (mediapipe no instala en la mayoría de móviles) y con fps bajos. Si tienes
# un mini PC o una Raspberry Pi, usa esos: van mucho mejor y más estables.
#
# Cómo funciona: Termux no tiene systemd ni todos los paquetes que hacen
# falta, así que instalamos un Debian dentro de Termux (con proot-distro) y
# ahí dentro reutilizamos el instalador normal (instalar.sh). Al final se
# genera un script "arrancar-cerebro.sh" con un bucle de reinicio (no hay
# systemd) y se explica cómo arrancarlo solo al encender el móvil.
# ============================================================================
set -uo pipefail

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

echo -e "${NEGRITA}"
echo "============================================================"
echo "   VIGÍA CEREBRO — instalador para Android (Termux)"
echo "   EXPERIMENTAL: 1-2 cámaras, sin gestos, fps bajos."
echo "============================================================"
echo -e "${RESET}"

# --- Comprobar que estamos en Termux de verdad ------------------------------
if ! command -v pkg >/dev/null 2>&1 && [ -z "${TERMUX_VERSION:-}" ] && [[ "${PREFIX:-}" != *com.termux* ]]; then
  log_err "Esto no parece Termux. Si estás en un mini PC o Raspberry Pi con Linux,"
  log_err "usa el instalador normal: ./instalar.sh (desde la carpeta principal)."
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_DIR}" || exit 1

# --- Paso 1: paquetes de Termux necesarios ----------------------------------
log_info "Se van a instalar/actualizar estos paquetes de Termux: proot-distro, git, curl, termux-api"
resp=""
read -rp "¿Continuar? [S/n] " resp || true
if [[ "${resp}" =~ ^[nN]$ ]]; then
  log_err "Instalación cancelada por el usuario."
  exit 1
fi
pkg update -y
pkg install -y proot-distro git curl termux-api

# --- Paso 2: Debian dentro de Termux (proot-distro), idempotente -----------
if proot-distro login debian -- true >/dev/null 2>&1; then
  log_ok "Ya existe un Debian instalado con proot-distro, se reutiliza."
else
  log_info "Instalando Debian dentro de Termux (proot-distro)… puede tardar varios minutos."
  proot-distro install debian
fi

# --- Paso 3: dentro del Debian, reutilizar el instalador normal ------------
# Se enlaza (--bind) esta misma carpeta del repositorio dentro del contenedor,
# en la MISMA ruta, para que todas las rutas relativas (venv, bin, datos,
# config.yaml) coincidan dentro y fuera. Dentro del contenedor no hay
# systemd, así que instalar.sh detecta eso solo y NO lo ofrece (correcto:
# aquí no aplica; usamos el bucle de reinicio de más abajo).
log_info "Entrando en Debian para instalar dependencias, cámaras y arrancar el cerebro…"
log_warn "Se te pedirán los mismos datos que en el instalador normal (cámaras, token, Telegram)."
echo ""

if ! proot-distro login debian --bind "${REPO_DIR}:${REPO_DIR}" -- \
    env VIGIA_FORZAR_LINUX=1 bash -lc "
      set -e
      apt-get update -y
      apt-get install -y python3 python3-venv python3-pip ffmpeg curl ca-certificates sudo
      cd '${REPO_DIR}'
      chmod +x ./instalar.sh
      ./instalar.sh
    "; then
  log_err "La instalación dentro de Debian ha fallado. Revisa el error de arriba."
  log_err "Puedes volver a ejecutar este script: es seguro repetirlo."
  exit 1
fi

log_ok "Cerebro instalado y probado dentro de Debian."

# --- Paso 4: script de arranque con bucle de reinicio (sin systemd) --------
ARRANQUE="${REPO_DIR}/arrancar-cerebro.sh"
log_info "Generando ${ARRANQUE} (arranque manual con reinicio automático)…"
cat > "${ARRANQUE}" <<SCRIPT
#!/data/data/com.termux/files/usr/bin/bash
# VIGÍA CEREBRO — arranque para Termux (sin systemd).
# Reinicia el cerebro solo si se cae. Detener con Ctrl+C.
set -uo pipefail
REPO_DIR="\$(cd "\$(dirname "\$0")" && pwd)"

command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
echo "[vigia] activado termux-wake-lock (evita que Android duerma el proceso)."
echo "[vigia] iniciando bucle de vigilancia. Ctrl+C para parar."

while true; do
  echo "[vigia] \$(date '+%Y-%m-%d %H:%M:%S') arrancando cerebro…"
  proot-distro login debian --bind "\${REPO_DIR}:\${REPO_DIR}" -- bash -lc "
    cd '\${REPO_DIR}' &&
    (./bin/cloudflared tunnel --url http://localhost:8420 >> datos/tunel.log 2>&1 &) &&
    exec venv/bin/python -m vigia_cerebro.principal
  "
  echo "[vigia] el cerebro se ha parado. Reintentando en 5 segundos…"
  sleep 5
done
SCRIPT
chmod +x "${ARRANQUE}"
log_ok "Creado ${ARRANQUE}"

# --- Paso 5: instrucciones de Termux:Boot (arranque al encender el móvil) --
mkdir -p "${HOME}/.termux/boot"
BOOT_SCRIPT="${HOME}/.termux/boot/arrancar-vigia.sh"
cat > "${BOOT_SCRIPT}" <<BOOT
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd "${REPO_DIR}" && ./arrancar-cerebro.sh
BOOT
chmod +x "${BOOT_SCRIPT}"

echo ""
echo -e "${VERDE}════════════════════════════════════════════════════════════${RESET}"
echo -e "${NEGRITA}  VIGÍA CEREBRO — instalado en Termux${RESET}"
echo -e "${VERDE}════════════════════════════════════════════════════════════${RESET}"
echo "  Para arrancarlo a mano cuando quieras:"
echo "    cd ${REPO_DIR} && ./arrancar-cerebro.sh"
echo ""
echo "  Para que arranque SOLO al encender el móvil (recomendado):"
echo "    1) Instala la app 'Termux:Boot' (F-Droid, no está en Google Play)."
echo "    2) Ábrela una vez (para que Android le deje arrancar en segundo plano)."
echo "    3) Ya está: se ha creado ${BOOT_SCRIPT}"
echo "       que se ejecuta solo cada vez que reinicias el móvil."
echo ""
echo -e "${AMBAR}  LÍMITES HONESTOS de Android + Termux:${RESET}"
echo -e "${AMBAR}   · Máximo recomendado: 1-2 cámaras.${RESET}"
echo -e "${AMBAR}   · Gestos de ocultación: NO disponibles (mediapipe no instala aquí).${RESET}"
echo -e "${AMBAR}   · fps bajos (2-3 fps por cámara es lo normal en un móvil).${RESET}"
echo -e "${AMBAR}   · Es EXPERIMENTAL: Android puede matar el proceso si ahorra batería;${RESET}"
echo -e "${AMBAR}     revisa que 'sin restricciones de batería' esté activado para Termux.${RESET}"
echo -e "${VERDE}════════════════════════════════════════════════════════════${RESET}"
