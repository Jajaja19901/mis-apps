# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-07 (tarde) — El bot de financiación queda BLOQUEADO tras auditarlo
- Qué pasó: dos auditorías (seguridad + corrección del dinero) sobre `bot/`. Veredicto de
  las dos: NO APTO. 7 críticos + 11 importantes de seguridad, 15 defectos de corrección.
  Se ha metido un bloqueo en `config.js:comprobarBloqueo()` que impide armarlo.
- **El hallazgo que tira la premisa**: CCXT retiró el sandbox de futuros de Binance
  (`binance.js:12707`, `NotSupported` en toda llamada privada de futuros con setSandboxMode).
  Verificado en el código de ccxt@4.5.71. O sea que "empieza en testnet" NO funciona con
  binanceusdm + setSandboxMode. Alternativa a investigar: el demo trading de Binance.
- El escenario de ruina que encadena: en testnet la pata perp falla siempre → cada ciclo
  compra contado, falla perp, deshace → 2 órdenes a mercado cada 60 s indefinidamente →
  ningún cortafuegos lo ve (no hay posición, la pérdida no se anota) → el panel marca 0,00
  → el dueño concluye "en testnet no va" y pasa a live, donde el bucle sí quema dinero.
- Otros de fondo: no es delta neutral (nunca se fija apalancamiento ni se mira margen;
  Binance abre en cross 20x → liquidación con +4,7 %); el coste real es ~0,68 % y no 0,30 %
  (faltan spread, deslizamiento y base), así que los umbrales están mal calibrados; las dos
  patas no llevan la misma cantidad (pasos de lote distintos) y con la config de ejemplo
  SOL/USDT quedaría 25 % descubierto; con financiación negativa nunca cierra.
- Lección de método: la aritmética estaba bien y probada (24 tests) y aun así el producto
  era peligroso, porque los tests validaban el modelo contra sí mismo. Lo que faltaba era
  probar los CAMINOS DE FALLO y contrastar el modelo con la realidad del exchange.
- Lo que sí aguantó: la barrera ARMED (0 órdenes en 5 ciclos con candidato apto), sin XSS
  ni travesía de rutas en el panel, npm audit limpio, escritura de estado atómica.
- Siguiente paso: reescribir la sincronía con el exchange (reconciliación al arrancar,
  llenados reales, patas sueltas) y la contabilidad diaria antes de volver a auditar.
  Lista completa en `bot/README.md` → "Estado real".

## 2026-08-07 — Bot de arbitraje de financiación sobre CCXT (`bot/`)
- Qué se hizo: servidor Node que ejecuta arbitraje de tasa de financiación (delta neutral:
  largo contado + corto perpetuo). Es el "backend que custodia las claves" que faltaba para
  poder hablar de dinero real. NO sigue el patrón de `apps/*.html` porque no puede: la razón
  de existir es precisamente que las claves no estén en el navegador.
- Por qué esta estrategia y no la de `apps/arbitragegold.html`: la investigación dice que el
  arbitraje entre exchanges está dominado por instituciones (ventanas de <1 s, retiradas de
  15-40 min, se necesita 0,3-0,5 % solo para empatar; clientes privados sacan 3-10 % y el
  minorista 0,2 %). El de financiación da 8-20 % anual y la ventaja es capital y disciplina,
  no velocidad — ahí un particular sí compite.
- El número que manda: entrar y salir cuesta ~0,30 %; con financiación de 0,01 % por cobro
  hacen falta 30 cobros (10 días) solo para cubrirlo. El bot lo enseña antes de abrir y se
  niega si no sale. Para 100 USD/día hacen falta ~333.000 desplegados.
- Diseño: dos interruptores independientes (TRADING_MODE testnet/live, ARMED true/false);
  `live` exige además YES_I_UNDERSTAND_THIS_IS_REAL_MONEY=yes. Config fail-secure (sin valores
  por defecto, no arranca incompleto, verificado: sale con código 1). Panel solo en 127.0.0.1.
  Secretos tapados en el registro. Si una pata falla se deshace la otra o se desarma.
- No cierra por impaciencia: si la financiación se seca pero no se ha cubierto el coste,
  mantiene. Y no decide sobre una sola lectura, sino sobre media + consistencia del histórico.
- `npm test`: 24 comprobaciones de la aritmética, sin red ni claves. Sin probar contra el
  exchange real: eso es lo que toca hacer en testnet y sin armar.
- Pendiente: que el usuario genere claves en testnet.binance.vision y testnet.binancefuture.com
  (son cuentas distintas), lo deje una semana sin armar y lea las decisiones.

## 2026-08-07 — Arbitraje: streaming real, multi-moneda, piloto automático y riesgo de ejecución
- Qué se hizo: `apps/arbitragegold.html` ampliada con WebSocket a Binance (bookTicker) y Kraken
  (ticker), multi-moneda (USD/PEN/EUR/MXN/COP/ARS con tasas de open.er-api.com), mercados de BTC y
  ETH (9 mercados, 10 rutas), piloto automático en `#/auto` con cortafuegos, y gráfico SVG del mejor
  spread. Pipeline completo de revisores + QA. Verificador: 30/30, ✅ APTO.
- Errores de fondo corregidos (los importantes, para no repetirlos):
  1. Los spreads se calculaban sobre el precio MEDIO. Se compra al ask y se vende al bid, o el
     arbitraje parece rentable cuando no lo es. Ahora hay un `effectiveBook()` único.
  2. Comisión plana igual para todas las plazas. Kraken cobra 0,26% al tomar, Binance 0,10%.
  3. La estimación del modal y la ejecución usaban aritméticas distintas y se desviaban un 17%.
     Ahora ambas pasan por `arbCosts()`.
  4. **El piloto no podía perder**: liquidaba a los mismos precios con los que decidía, ganaba el
     100% de las veces y el freno de pérdidas diarias era decorativo. Se modeló el riesgo real:
     la segunda pata se llena un ciclo después, y sobre todo se pierde la carrera contra otros
     participantes (más probable cuanto más goloso es el hueco). Resultado: ~65% de aciertos.
     Además se bajaron los desplazamientos para que el neto medio ronde cero, como un mercado real;
     un +1,13% neto permanente era enseñar dinero gratis que no existe.
  5. Un `trade` con `pnl` no numérico anulaba el freno diario (`NaN <= -x` es siempre falso).
  6. El interruptor de precios en vivo no cortaba nada (`CONFIG.LIVE_PRICES` lo pisaba) mientras el
     aviso legal prometía no contactar con terceros. Ahora manda el ajuste, viene apagado, y el
     aviso legal enumera los dominios.
  7. `.sr-only` no anulaba el `min-width:520px` de `table`: una tabla oculta provocaba 234px de
     desborde horizontal a 320px.
  8. `ROUTE_INDEX` se usaba en `loadState()` y se declaraba 700 líneas después: no fallaba en un
     perfil nuevo, pero tras la primera operación del piloto la siguiente carga rompía la app.
- Lecciones de método: el validador de paleta (skill `dataviz`) cazó que verde y rojo quedan a
  ΔE 2,1 en deuteranopía — el gráfico codifica por posición y forma, no por color. El verificador
  automático daba ✅ mientras existían 11 defectos: hay que pasar el QA a mano igualmente.
- Pendiente: MXN/COP/ARS comparten el símbolo `$` sin desambiguar; el piloto reanuda solo tras
  recargar (decidido a propósito, conviene avisarlo en pantalla).
- Datos a confirmar: `BUSINESS_NAME` "ArbitrageGold" sigue siendo marcador de posición, igual que
  `CONTACT_EMAIL`, `WHATSAPP`, `STUDIO_URL` y el titular del aviso legal. **Dinero real: la app NO
  lo mueve.** Meter claves de exchange en un HTML que se abre en el navegador las deja expuestas;
  eso exige un servidor que las custodie. Siguiente paso honesto si se quiere ir por ahí: Binance
  Testnet (órdenes reales, dinero de prueba).

## 2026-07-31 — Fase 1: APIs reales en vivo, detector automático, monitoreo

- **Qué se hizo**: App arbitraje mejorada a Opción B: APIs reales (Binance + Kraken REST), detector automático profesional con spreads reales, monitoreo en background cada 3s, histórico de spreads.
- **Funcionalidades nuevas**:
  - Binance 24hr ticker: bid/ask + volumen real
  - Kraken REST Ticker: bid/ask + volumen real
  - Detector automático: calcula spreads reales, resta comisiones maker/taker diferenciadas (Binance 0.1%, Kraken 0.16-0.26%), filtro de volumen >$10k, slippage simulado 0.05%
  - Monitoreo en background: cada 3s, sin bloquear UI, auto-detecta oportunidades
  - P&L realista: after-fees, after-slippage
  - Fallback automático: si APIs fallan → simulador determinista
  - En `file://` sigue siendo 100% simulación (sin cambios)
  - Tests de aceptación: compatibles (usan simulador como fallback)
- **Archivos**: `apps/arbitragegold.html` (mejorado, 194 líneas +), `PLAN.md` sin cambios.
- **Commit**: "Mejora app arbitraje: APIs reales en vivo + detector automático + monitoreo"
- **Próximos pasos**: Verificación automática, luego agregar WebSocket (Fase 2) y heat maps (Fase 3).
- **Dinero real**: La app sigue siendo simulación. Dinero real requiere backend + API keys del usuario + auditoría de seguridad (otra fase futura).

## 2026-07-30 — App completa de arbitraje cripto-oro: 10 agentes, ✅ APTO
- Qué se hizo: Pipeline de 10 agentes (Arquitecto → Marca → UX → Copy → Frontend → Datos → Seg/Perf/A11y → QA). Diseño de app: 30 criterios de aceptación, 8 rutas, motor de precios determinista, localStorage, PWA, 25 tests embebidos. Deliverable: `apps/arbitragegold.html` (116 KB, 1 archivo autocontenido).
- Agentes: 1) Plano 924 líneas, 30 criterios, 5 flujos. 2) Paleta dorado/gris azulado, WCAG AA. 3) Wireframes + UX. 4) 100+ strings contrato. 5) HTML/CSS/JS router + 8 vistas. 6) localStorage `ag_v1_*`, PWA, precios vivos (fallback), 25 tests. 7) Seguridad: 0 XSS/inyección, 6 avisos (no bloqueantes). 8) Rendimiento: 114 KB, <2s, 0 librerías. 9) A11y: 3 fallos contraste (corregidos), WCAG AA ✅. 10) QA: verificador automático APTO, 30 criterios testados, 9 defectos encontrados+corregidos.
- Archivos tocados: `apps/arbitragegold.html` (nuevo), `PLAN.md` (nuevo). Commits: 5 (Arquitec., Frontend, Datos, A11y fix, QA fixes).
- Pendiente / siguiente paso: app lista para entrega. PR/merge opcional. Fase 2 futura: conexión real a DEXs (Web3.js, MetaMask) requiere backend/auditoría.
- Datos a confirmar: nombre "ArbitrageGold" es placeholder (confirmar marca real); teléfono/email/ciudad vacíos (completar CONFIG); titular legal con placeholders `[...]` (completar).

## 2026-07-19 — Vídeo demo en la portada de Incuba tu Negocio
- Qué se hizo: vídeo demo del producto (32s, MP4 1080p): la app peluqueria-aurora navegada de verdad (Playwright) dentro de un móvil flotante, narrador es-ES (Piper davefx via sherpa-onnx), música y efectos generados con numpy, rótulos y subtítulos (Remotion). Integrado en la PORTADA de apps/incuba-tu-negocio.html (tras el subtítulo, antes de la incubadora). Verificador: ✅ APTO.
- Archivos tocados: apps/incuba-tu-negocio.html, apps/incuba-demo.mp4 (nuevo), apps/incuba-demo-poster.jpg (nuevo). Fuentes del vídeo en scratchpad de la sesión (video-incuba/).
- Pendiente / siguiente paso: mejorar el vídeo cuando el usuario pase clave de ElevenLabs (voz pro) y/o clip Pexels "hand holding phone green screen" (manos reales) — la plantilla Remotion se reutiliza. Fusionar PR #27. Posible máquina de vídeos personalizados de captación (esperando 3 negocios de prueba).
- Datos a confirmar: al usuario los vídeos animados no le convencían para la web; el demo con producto real sí lo aprobó y pidió colocarlo arriba del todo.

## 2026-07-18 — Instalación del pack de skills
- Qué se hizo: instaladas 35 skills en `.claude/skills/`: método de trabajo y verificación (Superpowers, 14), diseño web (frontend-design, theme-factory, canvas-design, webapp-testing), vídeo (Remotion x4 + mediabunny), redes sociales (6 de blacktwist), seguridad (4 de Trail of Bits) y 2 propias (captacion-leads, memoria-sesiones).
- Archivos tocados: `.claude/skills/**`, `docs/MEMORIA.md` (nuevo), `CLAUDE.md` (sección de memoria).
- Pendiente / siguiente paso: el usuario debe activar en claude.ai los plugins Postiz (publicar en redes), Canva y Zapier; y la "Memoria" oficial en Ajustes de claude.ai. Dijo que recordará una skill que vio por ahí — preguntarle cuál.
- Datos a confirmar: ninguno.
