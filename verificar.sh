#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
#  REVISAR LA FÁBRICA — comprueba que todo está montado y bien
#  Uso:   bash verificar.sh
# ────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1

echo "╔══════════════════════════════════════════════════════════╗"
echo "║      REVISIÓN DE LA FÁBRICA DE APPS                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "■ PIEZAS DE LA FÁBRICA"
chk() { [ -e "$1" ] && echo "   ✅ $2" || echo "   ❌ FALTA: $2"; }
chk ".claude/agents"                  "Los 10 trabajadores (agentes)"
chk "CLAUDE.md"                       "El cerebro (instrucciones automáticas)"
chk ".claude/commands/crear-app.md"   "El comando /crear-app (arranque con 1 línea)"
chk ".github/workflows/crear-app.yml" "El robot (construye desde una nota de GitHub)"
chk "briefing.html"                   "El cuestionario para clientes"
chk "automatizar/crear-todas.sh"      "El puente en lote (muchas apps de golpe)"
chk "apps"                            "Carpeta de apps creadas"
echo ""

echo "■ LOS 10 TRABAJADORES Y SU FUNCIÓN"
i=0
for f in $(ls .claude/agents/[0-9]*.md 2>/dev/null | sort -V); do
  i=$((i+1))
  name=$(grep -m1 '^name:' "$f" | cut -d' ' -f2-)
  model=$(grep -m1 '^model:' "$f" | cut -d' ' -f2-)
  desc=$(grep -m1 '^description:' "$f" | sed 's/^description: //')
  if [ -n "$name" ] && [ -n "$model" ] && [ -n "$desc" ]; then
    echo "   ✅ $i) $name  [$model]"
    echo "$desc" | fold -s -w 64 | sed 's/^/        /'
  else
    echo "   ❌ $(basename "$f") — le falta nombre, modelo o función"
  fi
done
echo ""
echo "   Trabajadores correctos: $i de 10"
echo ""

echo "■ ¿COINCIDE CON GITHUB?"
if git rev-parse --git-dir >/dev/null 2>&1; then
  git fetch -q origin 2>/dev/null
  if [ "$(git rev-parse HEAD 2>/dev/null)" = "$(git rev-parse origin/main 2>/dev/null)" ]; then
    echo "   ✅ Sí, todo lo de aquí está guardado en GitHub (rama main)."
  else
    echo "   ⚠️  Hay cambios sin subir. Ejecuta: git push"
  fi
fi
echo ""
echo "Listo. Si todo sale ✅, tu fábrica está completa y operativa."
