# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

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
