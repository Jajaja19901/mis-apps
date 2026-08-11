# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-07-08 — MH Collective: V16→V25 (manos libres, arreglos de auditoría, más pedidos, cartel)
- Qué se hizo (rama `claude/party-access-finance-app-pybmqt`, app `apps/mh-collective-fiesta.html`):
  - V16: manos libres (escucha continua con auto-reinicio, banner ✋ Parar, "para de escuchar") y "si mandas HACER algo no habla" (`_hecho` = pitido + toast; solo contesta en voz a PREGUNTAS; toggle `hablarAlHacer` off por defecto).
  - V17-V18: blindaje de cantidades ("digo 10 y creaba 500"): "N entradas" con cualquier verbo → crear_lote local; `_blindaCantEntradas` impone el número dicho sobre el que devuelva la IA; números compuestos ("doscientas cincuenta"=250).
  - V19-V20: "fase uno/una/primera" reconocida (`_faseNumDe`); entradas sin fase se cuentan en la fase ACTIVA (panel ya no decía 0/300); memoria de conversación guarda TODOS los turnos (antes solo los de la IA → "¿y esas cuánto valen?" perdía el hilo).
  - V21: 10 fallos de auditoría (2 agentes): preguntar "¿está activada la tarjeta?" ya no la enciende; camareros/vigilantes por voz persisten (mutate); nombres de 3+ palabras crean persona (no nota); veintitrés-veintinueve; beneficio neto DESCUENTA comisiones RRPP (KPI+cierre+CSV+voz); aforo cuenta acompañantes VIP (`aforoDentro`); importar invitados = gratis.
  - V22: "ponme las claves" genera código 4 cifras único para cada camarero/vigilante (`_generarClavesTrabajadores`, acción IA `generar_claves`, botón 🎲 en Ajustes→Personal). Nunca toca el nº de trabajadores.
  - V23: auditoría sync (2 agentes): re-chequeo del límite DENTRO del mutate en canjearBotella/Refresco/BonoCopa/Consumicion y admitirAcompanante (dos móviles ya no sirven de más); restaurar copia e "intento de reentrada" van por mutate (antes se perdían al sincronizar).
  - V24: barra con fila automática "⚡ Más pedidos" (`productosMasPedidos(4)`: ≥2 uds, suma variantes, ignora _copa_incl, botones grandes, oculta al inicio). Pedido expreso del usuario: sin marcar nada.
  - V25: el cartel/logo ya no desaparece al sincronizar (adoptarRemoto los conserva si el remoto no los trae; cartelListo compara src).
  - Verificado: 70 acciones de la IA una a una (todas ✓; borrar_admin pide confirmación a propósito), 49/49 aceptación, 55/55 paridad, 91/91+79/80 baterías en cada versión.
- Pendiente / siguiente paso: (1) usuario debe cambiar PIN por defecto 1234; (2) auto-subida Netlify↔GitHub a medias (el usuario sube ZIP a mano desde `web/`); (3) GitSync del móvil a medias; (4) opcionales ofrecidos: semáforo de aforo gigante en puerta, sonido al añadir en barra, aviso "no ha pagado" al dar acceso, botellas VIP extra.
- Datos a confirmar: seguridad sin backend es "de confianza" (un trabajador con devtools podría leer el PIN — avisado al usuario); tarjeta = cobro simulado (real por Bizum/efectivo/datáfono); iPhone corta el manos libres a veces. Baterías de pruebas reutilizables en scratchpad de la sesión (`paridad.mjs`, `bateria*.mjs`, `nuevas8.mjs`).
- Nota de rama: este archivo existe también en `main` (con las 2 entradas de abajo); esta copia las incluye para que la fusión sea limpia.

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
