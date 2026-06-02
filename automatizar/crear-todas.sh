#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
#  PUENTE DE AUTOMATIZACIÓN — crea una app por cada prompt
# ────────────────────────────────────────────────────────────────
#  Cómo funciona:
#   1. Pones cada prompt (uno por app) como un archivo .txt dentro de
#      automatizar/prompts/   (ej: peluqueria.txt, restaurante.txt ...)
#   2. Ejecutas:   bash automatizar/crear-todas.sh
#   3. El programa recorre TODOS los prompts y, por cada uno, lanza la
#      fábrica de 10 agentes (comando /crear-app) que construye la app.
#   4. Las apps terminadas aparecen en  apps/  y se hace commit.
#
#  Requisitos (una sola vez):
#   - Tener Claude Code instalado:   npm install -g @anthropic-ai/claude-code
#   - Haber iniciado sesión:         claude   (sigue las instrucciones)
#     · o bien exportar una API key: export ANTHROPIC_API_KEY=sk-ant-...
# ────────────────────────────────────────────────────────────────
set -uo pipefail

# Ir a la raíz del repositorio (este script vive en automatizar/)
cd "$(dirname "$0")/.." || exit 1

PROMPTS_DIR="automatizar/prompts"
HECHOS_DIR="automatizar/hechos"     # aquí se mueven los prompts ya procesados
mkdir -p "$HECHOS_DIR"

shopt -s nullglob
prompts=("$PROMPTS_DIR"/*.txt)

if [ ${#prompts[@]} -eq 0 ]; then
  echo "⚠️  No hay prompts en $PROMPTS_DIR (pon archivos .txt ahí)."
  exit 0
fi

echo "🏭 Encontrados ${#prompts[@]} prompt(s). Empezando..."
echo ""

n=0
for f in "${prompts[@]}"; do
  n=$((n+1))
  name=$(basename "$f" .txt)
  prompt="$(cat "$f")"
  echo "────────────────────────────────────────"
  echo "▶ ($n/${#prompts[@]}) Creando app: $name"
  echo "────────────────────────────────────────"

  # Lanza la fábrica de 10 agentes con el comando /crear-app, sin pausas
  if claude -p "/crear-app $prompt" --permission-mode acceptEdits; then
    echo "✅ Lista: $name"
    mv "$f" "$HECHOS_DIR/" 2>/dev/null || true
    # Guarda el avance
    git add apps/ "$HECHOS_DIR/" "$PROMPTS_DIR/" 2>/dev/null || true
    git commit -q -m "App creada automaticamente: $name" 2>/dev/null || true
  else
    echo "❌ Falló: $name (lo dejo en prompts/ para reintentar)"
  fi
  echo ""
done

echo "🎉 Terminado. Revisa la carpeta apps/ — ahí están tus apps."
echo "Si quieres subirlas a GitHub:   git push"
