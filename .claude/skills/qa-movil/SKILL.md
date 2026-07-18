---
name: qa-movil
description: QA visual de móvil para las apps de la fábrica. Ejecútala SIEMPRE tras cualquier cambio visual, de animación o de interacción en una app, y antes de entregar. Simula un teléfono Android real y caza los fallos que el verificador funcional no ve: parpadeos, saltos de maquetación, elementos que se re-encajan con la barra de direcciones, y botones que no responden al toque. Úsala cuando el usuario reporte "parpadea", "da saltos", "se corta", "se ve mal en mi móvil" o "un botón no funciona".
---

# QA visual de móvil

El verificador funcional (`tools/verificar-app.mjs`) comprueba que la app FUNCIONA.
Esta skill comprueba que SE VE Y SE TOCA BIEN en un móvil real. Historia: los fallos
más dolorosos de esta fábrica (parpadeos por blur animado, el canvas que se borraba
con la barra de Android, botones tapados por cajas invisibles) pasaban el verificador
funcional y solo se veían en el teléfono del usuario.

## Cómo ejecutarla

```bash
PUPPETEER_EXECUTABLE_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome \
  node tools/qa-movil.mjs apps/mi-app.html
```

Termina en `✅ QA-MOVIL APTO` (código 0) o `❌ QA-MOVIL NO APTO` (código 1).
Los `⚠` se revisan a mano con captura antes de entregar.

## Qué comprueba (y por qué existe cada prueba)

1. **CLS (saltos de maquetación)** recorriendo toda la página — umbral 0.1.
   *Origen: secciones con 100vh que saltaban cuando la barra de Android se escondía.*
2. **Parpadeo por fotogramas** — 2 capturas a 700ms en 5 puntos; diff medio > 15 = revisar.
   *Origen: blur recalculado por frame en los orbes y twinkle agresivo del enjambre.*
3. **Baile de la barra de direcciones** — cambia la altura 4 veces (844↔788) y exige que
   canvas e iframes NO se redimensionen ni re-encajen. *Origen: `cv.width=` borra el canvas;
   `coverFit` re-escalaba las apps embebidas en cada resize.*
4. **Toques táctiles reales** en todos los botones visibles — cada uno debe producir efecto
   (scroll, overlay, hash o cambio de DOM). *Origen: el botón Saltar tapado por la caja
   invisible del CTA (`pointer-events`).*
5. **Errores JS** acumulados durante todo el recorrido.

## Reglas aprendidas (aplícalas al construir, no solo al probar)

- Nada de `filter: blur()` recalculado por frame ni animaciones de `background` a pantalla completa en móvil.
- Todo listener de `resize` debe ignorar cambios de altura < 170px (la barra) y llevar rebote de 250ms.
- Alturas de secciones fijas en `svh`, nunca `vh` a secas.
- Contenedores de CTA a ancho completo: `pointer-events:none` + `auto` solo en el botón.
- Botones táctiles ≥ 44px de alto.
- `backdrop-filter` solo en escritorio; en móvil, cristal por alpha fija.

## Cuándo la ejecutan los agentes del pipeline

- **Ingeniero de Datos (6)**: antes de pasar a los revisores.
- **Ingeniero de Rendimiento (8)**: como parte de su informe.
- **QA (10)**: obligatoria junto al verificador funcional. No se entrega sin ambos ✅.
