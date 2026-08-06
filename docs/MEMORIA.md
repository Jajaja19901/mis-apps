# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-06 (6) — AFTERS/Vigía/Control: parpadeo CERO + transición visible en el visor
- El usuario seguía viendo parpadeo y NO veía la transición. Diagnóstico real (reproducido conduciendo el visor de la incubadora con Puppeteer): (1) la cascada de reveal se completaba DURANTE la carga/spinner, así que cuando el visor mostraba la web, la transición ya había pasado → "no la veo"; (2) quedaban animaciones en bucle (incluidas en pseudo-elementos ::before/::after, que `*` no cubre) → parpadeo.
- Arreglo: `*,*::before,*::after{animation:none !important}` dentro de `@media (prefers-reduced-motion: no-preference)` → 0 animaciones en bucle (confirmado document.getAnimations()==0 en el visor). Reveal reescrito para arrancar en `window.load`+rAF (así se ve DESPUÉS del spinner) con cascada escalonada 140+i*130ms y salvavidas a 4s. Medido en el visor: reveals suben 1→13 gradualmente = transición visible.
- Nota: la única animación que sigue = el vídeo reproduciéndose (intencional). Todo lo demás, estático + entrada en cascada.
- El vídeo/las webs no cambian de aspecto, solo dejan de tener movimiento de fondo. Re-embebido, sin errores de consola.

## 2026-08-06 (5) — Revisión "que funcione perfecto": apps autocontenidas + demo AFTERS
- Revisión funcional de los 37 HTML (apps/ + webs-basicas/). Todo carga y funciona. Hallazgo: varias apps NO eran autocontenidas (pedían cosas de internet), rompiendo la regla de oro.
- Arreglos autocontención (commit 8d0511e): quitadas las etiquetas Google Fonts de 6 apps (afters, incuba-tu-negocio, inmobiliaria-ejemplo, logopedia-infantil, logopedia-playstore-ninos, pio) — las font-family ya tenían respaldo del sistema. Neutralizado enlace externo real que quedaba en inmobiliaria-ejemplo (hipotecajovencanaria.com, sin anonimizar).
- Vigía IA: su código es autocontenido (sin CDNs); las llamadas fetch son a la cámara/dispositivo del propio dueño (su función, no rastreo) y las URLs son placeholders (trycloudflare/localhost/192.168). Se deja como está.
- AFTERS app: `afters.html` es la APP REAL completa (15k líneas) con Firebase + Leaflet + crypto-js desde CDNs → NO puede ser offline sin reescribirla. Decisión del usuario: crear demo simulada. Hecho: `apps/afters-ejemplo.html` (mapa SVG con pines de amigos —Lucía/Marco/Sara/Dani— convergiendo al "Bar Luna", lista de grupo, chat con localStorage, SOS, marcar punto), autocontenida, 4/4 tests de aceptación ✅ APTO.
- Integración: en `regenerar-completa.mjs`, la clave "afters.html" ahora se embebe desde `apps/afters-ejemplo.html` (fuenteDe). El archivo real `apps/afters.html` se queda INTACTO. Incubadora 5,42 MB, ✅ APTO.
- Pendiente: nombre definitivo de AFTERS.

## 2026-08-06 (4) — AFTERS/Vigía/Control: quitados parpadeos + transición "award" fiable
- Queja del usuario: las 3 con vídeo "se cortan, muchos parpadeos". Causa: los subagentes metieron demasiadas animaciones infinitas (AFTERS 10, Vigía 7, Control 5) + texturas full-screen que tililan (scanlines en Vigía con mix-blend-mode:overlay; rejilla de calles fija en AFTERS), y el `reveal` al scroll NO se disparaba dentro del visor (iframe) → secciones ocultas = "se corta".
- Arreglo (capa de calma, en los esqueletos, re-inflado): quitadas scanlines full-screen (Vigía), atenuada la rejilla de AFTERS (opacity .28), parpadeos duros `steps(1)` → suaves ease, `*{animation-duration}` ralentizado dentro de `@media (prefers-reduced-motion: no-preference)` (¡importante: NO pisar reduce-motion!), fuera pulso de alarma de fondo.
- Transición "award" FIABLE (reemplaza el reveal frágil): detecta si está en iframe → hace CASCADA de entrada escalonada (no depende del scroll, que es lo que fallaba en el visor); standalone → cascada de lo visible + IntersectionObserver para el resto; salvavidas `setTimeout(showAll,2200)` para que NADA quede oculto; curva premium cubic-bezier(.16,1,.3,1) y el marco del vídeo entra con leve zoom (scale .968→1). Respeta reduce-motion.
- Probado con navegador: 0 elementos ocultos tanto standalone como DENTRO DE IFRAME, sin errores de consola. Re-embebido, incubadora ✅ APTO.
- Nota: el reveal reescrito vive en los 3 archivos; si se tocan, mantener la rama `inIframe` (cascada) o volverá a cortarse en el visor.
- Pendiente: nombre definitivo de AFTERS.

## 2026-08-06 (3) — Rediseñadas AFTERS, Vigía y Control (las 3 con vídeo), distintas entre sí
- Problema (queja del usuario): las 3 webs con vídeo compartían el MISMO molde "award" (cinta → héroe con titular degradado → vídeo en marco con brillo + reveals → rejilla features 2x2 → pasos → CTA). Se veían iguales pese a ser apps de conceptos distintos.
- Solución: 3 diseñadores `ingeniero-frontend` en paralelo, cada uno con el concepto real de su app:
  - AFTERS = mapa social nocturno (retícula de calles, minimapa con pines convergiendo, vídeo enmarcado como MÓVIL con overlay de mapa "EN VIVO", features como chinchetas, pasos sobre una ruta).
  - Vigía = sala de control / HUD de vigilancia IA (monospace, scanlines, radar SVG, vídeo como FEED DE CÁMARA "REC · CAM 01" con retícula, módulos "MOD-0N ● ONLINE/ALERTA", log de eventos).
  - Control = acceso VIP/QR (negro + oro champán, vídeo como TÓTEM lector de QR "ESCANEANDO→AUTORIZADO", entradas tipo ticket troquelado con precios, pasos-checkpoint, sello circular de aforo).
- Truco anti-corrupción del vídeo: extraje vídeo+póster a sidecars con marcadores `@@ASSET0@@`/`@@ASSET1@@` (esqueletos ~11KB), el agente rediseñó sin tocar el MB de base64, y re-inflé con script (scratchpad/inflate-vid.mjs). El inflado valida que cada marcador aparezca exactamente 1 vez.
- Conservado: contenido real, cinta, los 3 scripts (reveal/sonido/aviso demo) y sus enganches de clase (.screen/.sound/.btn/.reveal), firma del pie. Sin errores de consola. Re-embebidas en la incubadora (5,61 MB), ✅ APTO.
- Pendiente: nombre definitivo de AFTERS.

## 2026-08-06 (2) — Rediseñadas las 11 webs básicas, cada una con identidad propia
- Problema (queja del usuario): todas las webs `-web.html` eran la MISMA plantilla recoloreada (cinta → héroe centrado serif → botón verde WhatsApp → lista de servicios con emoji → CTA → pie). "Se ven todas iguales". Se instalaron skills de diseño para esto y no se aprovechaban.
- Solución: rediseñada CADA web con un mundo visual distinto, delegando en subagentes `ingeniero-frontend` en paralelo (2 tandas: 4 + 7), cada uno con brief de estilo específico. Conservado SIEMPRE: contenido real (textos/precios/horarios), la cinta superior exacta, los botones `.btn` sin href + el `<script>` de aviso demo (verbatim), y la firma del pie.
  - peluquería → editorial de revista (serif display, índice numerado 01-05, terracota) · fontanero → utilitario de urgencias (navy + amarillo señal, sellos) · restaurante → gastro oscuro (carbón + brasa/oro, carta por categorías) · floristería → botánico pastel (blobs orgánicos) · bar → neón nocturno (glow magenta/cian) · cafetería → retro/diner (vichy, tickets dentados) · veterinario → amable redondeado (teal/menta, patitas, squircles) · reformas → industrial (grafito + naranja obra, sellos presupuesto) · arte → galería minimal (serif gigante, índice de obras) · huerta → ecológico terroso (kraft, cajas de madera) · inmobiliaria → corporativo (navy + dorado champán, franja de confianza).
- Arreglo tras revisar capturas: en reformas el `.hl` del titular (rotulador para fondo claro) dejaba "SIN SORPRESAS" ilegible sobre héroe oscuro → cambiado a chip naranja sólido con texto grafito (box-decoration-break:clone).
- Re-embebidas las 11 en la incubadora con `regenerar-completa.mjs` (5,57 → 5,60 MB). Todas sin errores de consola; incubadora verificada. Capturas revisadas una a una: quedan como de 11 estudios distintos.
- Pendiente: nombre definitivo de AFTERS.

## 2026-08-06 — Revisión + optimización de carga/fluidez de la incubadora
- Revisión a fondo de `apps/incuba-tu-negocio-COMPLETA.html` (verificador + chequeo de consistencia en navegador). Único bug real: **ID duplicado `ig`** (el logo `logoMark()` se pinta en cabecera y pie con el mismo `id` de degradado SVG) → arreglado dando id único (`ig1`, `ig2`…). Los avisos "Incubar/email" del verificador son falsos positivos (enlaces reales href/#hash/mailto).
- **Fluidez**: medido con navegador (móvil, CPU x4). El lastre NO era compilar APPS (lo comprobé vaciando los blobs: la tarea larga seguía). Era el **enjambre WebGL** (`frame`, la animación del huevo): arrancaba durante el parseo y **corría para siempre aunque el héroe no se viera**. Arreglado: arranca 250ms tras `load` (tapado por el velo "INCUBANDO") + `IntersectionObserver` sobre el canvas lo pausa fuera de vista y lo reanuda al volver. El huevo se ve idéntico (confirmado por captura).
- **Peso**: el 61% de la página eran los 3 vídeos (720p). Recomprimidos a **540p** (CRF30, audio 56k mono) con el ffmpeg de imageio: AFTERS 1,1M→776K, Vigía 836K→644K, Control 864K→672K. Re-embebidos con `regenerar-completa.mjs`. **Página 6,2 MB → 5,57 MB**. Fotograma 540p comprobado: nítido. Nota: los vídeos ya estaban muy comprimidos, por eso el ahorro fue ~0,6MB y no más.
- Además: `tools/verificar-app.mjs` ahora tiene timeout de navegación configurable (`VERIF_TIMEOUT`, 120s) con reintento tolerante, para la incubadora grande.
- OJO entorno: tras un reinicio de contenedor, el hook `modern-python` (instalado el 08-02) ya estaba activo y bloquea `python`/`pip` a secas (usar `uv run python` o binarios directos). El ffmpeg de imageio-ffmpeg sobrevive en dist-packages.
- Todo verificado ✅ APTO. Pendiente: nombre definitivo de AFTERS.

## 2026-08-02 — Instaladas las 81 skills de seguridad de Trail of Bits (revisadas)
- Qué se hizo: instalado el marketplace oficial `github.com/trailofbits/skills` (firma de seguridad real) en `.claude/skills/` en formato plano, tras auditar TODO el repo clonado sin ejecutarlo. Son **81 skills** (el post decía ~75), no solo las 4 que ya teníamos. Cubren: auditoría de contratos blockchain (Solana, Cairo, Cosmos, Substrate, TON, Algorand), fuzzing (libfuzzer, AFL++, atheris, cargo-fuzz…), análisis estático (CodeQL, Semgrep, YARA), criptografía (constant-time, ProVerif), revisión de C/C++/Rust/Python, cadena de suministro, etc. El usuario las quiere todas porque trabaja con cripto.
- Seguridad: revisados los 85 scripts y los 4 hooks. **Cero código malicioso** (ni exfiltración, ni robo de credenciales/tokens, ni comandos destructivos, ni inyección en los SKILL.md). Los `rm -rf` de los hooks solo borran clones temporales propios con `session_id` validado.
- Hooks (se ejecutan solos) → cableados en `.claude/settings.json` (nuevo), con scripts vendorizados en `.claude/hooks-trailofbits/`:
  - `gh-cli`: sugiere usar `gh` en vez de curl/WebFetch a GitHub. **Inerte aquí** (no hay `gh` instalado).
  - `skill-improver`: hook de bucle; inerte salvo que se use esa skill.
  - `fp-check`: comprobación de completitud en cada Stop (prompt); devuelve {ok:true} si la conversación no es de fp-check → inofensivo.
  - ⚠️ **`modern-python`**: como SÍ hay `uv` instalado, en **sesiones NUEVAS** bloquea `python`/`pip` a secas y obliga a `uv run python …`. Es a propósito (a petición del usuario, "con todo"). PARA DESACTIVARLO: borra el bloque `modern-python` de `.claude/settings.json`. Para el trabajo de vídeo con python usar `uv run --with imageio-ffmpeg,pillow python …`.
- Total skills: 39 → **116** (81 nuevas; se sobreescribieron 4 que ya estaban: semgrep, insecure-defaults, second-opinion, ask-questions-if-underspecified). Peso `.claude/skills` ≈ 18MB (texto/svg/scripts, nada pesado).
- Pendiente: nombre definitivo de AFTERS.

## 2026-08-01 (2) — Instaladas 4 skills de diseño (revisadas por seguridad)
- Qué se hizo: instaladas en `.claude/skills/` las 4 skills de diseño que faltaban de la lista del vídeo de harysvizcaino, tras revisar el código de cada repo (clonado, sin ejecutar): `web-design-guidelines` (vercel-labs, solo SKILL.md que hace WebFetch a la guía de Vercel), `emil-design-eng` (emilkowalski, SKILL.md de filosofía de diseño), `ui-ux-pro-max` (nextlevelbuilder, base de datos local BM25 en Python + CSVs, sin red, 1,9MB), `huashu-design` (alchaincyf, MIT; guía HTML de prototipos/PPT/animación — instalada SIN los ~30MB de música BGM ni showcases, ver NOTA-INSTALACION.md). Ninguna trae exfiltración/comandos peligrosos/inyección; los únicos hosts de huashu son opt-in (TTS ByteDance/Doubao, Wikimedia) y requieren claves propias. Total: 35 → 39 skills. Probado que el buscador de ui-ux-pro-max funciona offline.
- Pendiente: nombre definitivo de AFTERS.

## 2026-08-01 — Vídeo promo en la web de Control Acceso
- Qué se hizo: metido el vídeo "fiestapromo" (venta de entradas con QR) en `apps/webs-basicas/control-acceso-web.html`, igual que AFTERS/Vigía: comprimido con ffmpeg de 1080p/9,2MB a 720p/0,86MB, embebido base64 con póster, autoplay silencioso + loop + botón de sonido. Tema award: marco con brillo ámbar/verde (marca de Control Acceso) + transiciones de aparición al scroll. ✅ APTO; re-embebido en la incubadora (6,50MB). Ya son 3 webs con vídeo: AFTERS, Vigía y Control Acceso.
- Pendiente: nombre definitivo de AFTERS.

## 2026-07-30 (5) — Vídeos promo en las webs de AFTERS y Vigía + arreglos pendientes
- Qué se hizo: metidos los 2 vídeos promo que pasó el usuario (afterspromo→afters-web, vigiapromo→vigia-web, sin confundirlos). Comprimidos con ffmpeg (imageio-ffmpeg) de 1080p/~10MB a 720p/~1MB, embebidos como base64 con póster + autoplay silencioso + loop + botón de sonido. Tema "award": marco de pantalla con brillo animado (rosa/cian en AFTERS, cian/ámbar tipo monitor REC en Vigía) y transiciones de aparición al hacer scroll (IntersectionObserver, respeta reduce-motion). Probado en navegador real y dentro del visor de la incubadora. NOTA: el Chromium de pruebas no decodifica H.264 (por eso el vídeo sale 0x0 en las capturas), pero los navegadores reales sí; el póster JPEG es el respaldo donde no haya códec.
- Además (arreglos que quedaban de la revisión): política de privacidad/aviso legal en Control Acceso (recoge datos de invitados) con enlace en el pie y en la portada; comparador de niveles del bar reconectado (botón "📊 Comparar niveles" en el menú de la tarjeta del Camarero, solo ahí); Vigía optimizada (botones del visor cacheados, lienzo SIN SEÑAL repinta solo al cambiar el segundo) y ~90 líneas de código muerto del PIN eliminadas.
- Verificación: Control Acceso 49/49, Vigía 10/10, ambas webs ✅ APTO; incubadora 5,32MB (sube por los vídeos), re-embebida. Todo probado clic a clic.
- Pendiente: nombre definitivo de AFTERS.

## 2026-07-30 (4) — Revisión total (/code-review con 10 revisores + verificación funcional completa)
- Qué se hizo: 10 revisores IA (6+4 relanzados tras el límite de uso) + pasada funcional a mano. Arreglado: `tools/regenerar-completa.mjs` reescrito (escribía base64 plano sobre blobs gzip y corrompía SECTORES; ahora gzip, 29 claves, solo toca APPS); briefing.html del repo estaba viejo → sincronizado desde el embebido (traía Stripe) y tipografías restauradas; menús de demos a prueba de doble toque (antes se cerraban solos o elegían por ti); el visor ya no se reabre con callbacks tardíos (token reqGen); aviso de navegador viejo ya no salta solo (precalentamiento silencioso); Inmobiliaria: tocar el hueco entre píldoras dejaba la página en blanco → navegación blindada; XSS escapado en vistaGracias; SW cruzados fuera (control-acceso/afters con mensajes honestos); Google Fonts fuera de 3 demos (autocontenidas); filtro "Todas · 14" + chip "Otros"; miniaturas muertas y b64ToUtf8 eliminadas.
- Verificación: 28/28 archivos ✅ APTO (14 apps + 14 webs, 105 tests embebidos en verde); cuestionario recorrido entero (17/17 → enviar → COMPLETADO); doble toque, Volver, filtros y CTAs probados con clicks reales.
- Pendiente (apuntado, no urgente): política de privacidad en Control Acceso (recoge datos de invitados), embudo del elector de niveles del bar inalcanzable (~70KB embebidos sin UI que lo llame), micro-optimizaciones de Vigía (getElementById por frame, repintado SIN SEÑAL).

## 2026-07-30 (3) — Sin contraseñas, sin parpadeos, botones vivos
- Qué se hizo (petición del usuario): (1) CONTRASEÑAS FUERA: Vigía ya no pide PIN nunca y borra el que hubiera guardado (el usuario se quedó fuera del suyo); Control Acceso sin contraseña de portada (entra directo; PIN dueño 1234 se queda). (2) ANTI-PARPADEO: Vigía reescribía clases/estilos de 7 elementos del visor ~30 veces/segundo (vid_sinSenal/vid_componer) + contadores y monitor cada 250ms → ahora todo escribe SOLO si cambia: de 220 mutaciones/10s a 0. Brillo de portada CA ahora solo transform. Las otras 13 apps ya estaban a 0. (3) BOTONES: los CTA sin enlace de las 14 webs básicas ahora avisan "✅ Esto es una demo — en tu web real este botón abre tu WhatsApp/app"; los "Pedir" de las apps ya funcionaban (navegan al carrito/carta).
- Tests: Vigía 10/10 (test del PIN adaptado a "ajustes abren directo"), Control Acceso 49/49, webs ✅ APTO. Incubadora re-embebida (16 blobs), 2,76MB, 14/14 menús, 0 errores JS.
- Pendiente: nombre definitivo de AFTERS.

## 2026-07-30 (2) — Control Acceso + Vigía en la incubadora; menú web/app en TODO
- Qué se hizo: MH Collective renombrada a **Control Acceso** sin rastro de MH (emblema CA, códigos CA-, contraseña "controlacceso", tests 49/49 ✅; archivos → `control-acceso.html` y `control-acceso-web.html`). Webs básicas nuevas: `inmobiliaria-web.html` y `vigia-web.html`. Incubadora: 14 tarjetas (+" Control Acceso" y "Vigía IA"), TODAS con el menú "¿Web 250€ o App 650€?" (28 demos, 6,1MB). Huevo del enjambre ahora multicolor (verde→cian→violeta, la muestra aprobada); móvil sin tocar. Tarjetas de bares renombradas ("Bar · Pedidos por QR" vs "Restaurante · Reservas") — son productos distintos, no copias; no había blobs duplicados.
- Ojo: un reinicio del worker deshizo archivos locales a mitad de sesión; se recuperó del remoto (por eso conviene commit+push pronto).
- Carga agilizada: los 29 blobs embebidos ahora van en gzip+base64 y se descomprimen al abrir cada demo (DecompressionStream nativo) → la página pasa de 6,1MB a 2,75MB y pinta en ~0,8s. Apertura de demos asíncrona (appHtml con caché); galería y buildstage adaptados.
- Arreglado (aviso del usuario): la portada de Control Acceso cargaba `icon-512.png` "del servidor" y en apps/ ese archivo es el icono de VIGÍA → robaba el ojo. Eliminada esa carga (logo del dueño → emblema CA), blob y miniatura re-embebidos. Icono de la tarjeta cambiado a ticket (el anterior parecía cámara). Tests 49/49 ✅.
- Pendiente: nombre definitivo de AFTERS (se queda por ahora).

## 2026-07-30 — 3 apps nuevas anonimizadas como demos + 2 webs básicas
- Qué se hizo: subidas al repo como demos estándar las 3 apps que pasó el usuario: `apps/mh-collective.html` (fiestas: entradas QR + cashless; quitadas claves Firebase reales), `apps/afters.html` (GPS social de grupos; quitadas claves Firebase reales, emails y dirección → arranca en "MODO DEMO"), `apps/inmobiliaria-ejemplo.html` (ex Jennyfer/REMAX: quitados nombre, marca, foto, teléfono, email, dirección y zonas de Las Palmas → "Inmobiliaria Ejemplo"). Webs básicas nuevas: `apps/webs-basicas/mh-collective-web.html` y `afters-web.html` (la inmobiliaria NO lleva web, a petición del usuario). Mejoras ligeras: favicon/manifest embebidos, brillo animado en portada MH, título con degradado en AFTERS, pin genérico en inmobiliaria. Verificador ampliado (`tools/verificar-app.mjs`): pasos `copyText`/`showGate` + `fill` dispara `change` → MH pasa 49/49 tests. Todo ✅ APTO.
- Además: AFTERS (con su web y el menú "¿Web 250€ o App 650€?") e Inmobiliaria (app directa, sin web) integradas como tarjetas en `apps/incuba-tu-negocio-COMPLETA.html` → ahora 22 demos, 12 tarjetas, 3,79MB. MH Collective queda FUERA de la página principal a petición del usuario (solo archivo en el repo). Probado clic a clic (visor interno, menú, miniaturas); sin internet AFTERS tarda ~15s en el visor (espera de sus CDNs), con internet va normal.
- Pendiente: el usuario dirá los nombres definitivos de MH Collective y AFTERS (por ahora se quedan); logopedia-laura tiene 1 test en rojo de ANTES (navegación a la app de adultos, no es de este trabajo).
- Datos a confirmar: ninguno.

## 2026-07-22 — Rescate de apps al repositorio + incubadora con 20 demos
- Qué se hizo: extraídas del archivo grande y guardadas como archivos propios las 7 apps que faltaban (cafetería, camarero-digital "La Tasca", floristería, fontanero, huerta, restaurante, veterinario) + las 10 webs básicas nuevas (apps/webs-basicas/). La incubadora COMPLETA del repo sustituida por la versión nueva: sin las 3 copias del bar, menú "¿Web básica 250€ o App completa 650€?" en las 10 tarjetas, 20 demos, 2,68MB (antes 3,38).
- Archivos tocados: apps/*.html (7 nuevos), apps/webs-basicas/ (10 nuevos), apps/incuba-tu-negocio-COMPLETA.html (actualizada), docs/MEMORIA.md.
- Pendiente: WhatsApp real y datos legales (nombre/NIF/dirección) antes de publicar; elegir efecto táctil de partículas (demo de 4 enviado); el verificador no termina con esta base por la animación densa (verificado a mano en navegador real).
- Datos a confirmar: ninguno.

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
