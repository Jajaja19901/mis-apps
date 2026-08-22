# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-22 — Blockchain nueva propia (no un token, no Solana)
- Qué se hizo: el usuario quería "una blockchain nueva conectada a la red con moneda propia para competir con Bitcoin". Tras aclarar expectativas (el código sí se puede; competir con BTC = confianza/adopción, no código), se construyó en `blockchain/` una blockchain funcional en **Python puro, SIN dependencias**: `ecc.py` (secp256k1 a mano: claves/firma/verificación), `wallet.py` (direcciones base58+checksum), `blockchain.py` (bloques, tx firmadas, minado PoW, saldos modelo cuenta, validación y consenso cadena-más-larga), `node.py` (nodo P2P vía http.server+urllib, API HTTP, difusión de tx/bloques, /resolve, explorador web embebido), `cli.py` (monedero CLI). Moneda placeholder "Tu Moneda/TMC", suministro 100.000.000 con halvings, comisión casi cero (MIN_FEE=0,00001), dificultad PoW=4.
- Verificado a mano: crear/firmar/verificar OK; fraude (firmar por otro, gastar sin saldo) rechazado; 2 nodos se descubren y sincronizan (bloque y tx se propagan, saldos cuadran en ambos); nodo nuevo se pone al día por consenso (altura 3). Todo verde.
- Archivos: `blockchain/{ecc,wallet,config,blockchain,node,cli}.py`, `blockchain/README.md`, `blockchain/.gitignore`. Se BORRÓ apps/tu-moneda-solana.html (primero se malinterpretó como token en Solana; el usuario lo rechazó).
- Pendiente / siguiente paso: pidió nombre/símbolo reales (ahora placeholder). Mejoras posibles: ajuste dinámico de dificultad, persistencia en disco, auditoría cripto. Si va en serio con captar dinero: avisar de MiCA/legal. NO es apto para dinero real de terceros (ataque 51%, sin auditar).
- Datos a confirmar: nombre y símbolo de la moneda; PoW elegido por el director (usuario dijo "decide tú"); si querrá web oficial además del código.

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
