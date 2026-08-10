# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-10 — Sistema de crecimiento de Incuba tu Negocio (estrategia completa)
- Qué se hizo: primer uso real de las skills de marketing sobre el propio negocio. Generado `.agents/product-marketing.md` (la base que leen todas las demás skills: producto, cliente ideal, competencia, objeciones, voz, pruebas) y `docs/estrategia/` con tres documentos: `01-oferta-y-precios.md`, `02-plan-de-crecimiento.md` y `03-kit-de-captacion.md`, más un README índice. Skills usadas: `product-marketing`, `offers`, `marketing-plan` (marco AARRR), con `prospecting` y `cold-email` para el kit.
- Diagnóstico principal: el producto está terminado pero la empresa no ha arrancado (0 clientes, 0 testimonios, 0 analítica). Según la ecuación de valor el freno NO es el precio sino la credibilidad (nota 3/10): un precio 8-16 veces por debajo del mercado sin ninguna prueba social genera sospecha. Recomendado: 5 plazas a 250€ a cambio de testimonio grabado → luego catálogo de 3 niveles (Nido 490 / Vuelo 890 / Bandada 1.490) + garantía "7 días o te devuelvo la señal" + Plan Nido 39€/mes contratado el día de la entrega.
- Jugada central propuesta: construir la web ANTES de venderla y enseñársela hecha al cliente (coste marginal casi cero = ventaja que ninguna agencia puede igualar), empezando por un solo gremio. Gremio recomendado: logopedas, porque en `apps/` ya hay 5 apps del sector.
- Archivos tocados: `.agents/product-marketing.md` (nuevo), `docs/estrategia/{README,01-oferta-y-precios,02-plan-de-crecimiento,03-kit-de-captacion}.md` (nuevos), `docs/MEMORIA.md`.
- Pendiente / siguiente paso: BLOQUEANTES antes de nada — poner WHATSAPP y EMAIL reales en `apps/incuba-tu-negocio.html` (hoy `PEGA_AQUI_TU_NUMERO`), hacer que los formularios salgan por WhatsApp (hoy los leads mueren en `localStorage` del visitante) y cambiar `ADMIN_PASSWORD` (`incuba-2026`, visible). Ofrecido al usuario hacerlo con el pipeline + verificador cuando dé su número.
- Datos a confirmar (los pidió el sistema y el usuario aún no ha contestado): teléfono/email reales, provincia para la lista, capacidad de entrega semanal, gremio elegido, si se cuenta o no que lo construye un pipeline de IA, y horas semanales disponibles. El objetivo "a millones" se tradujo a números: con este modelo el millón anual está a 3-5 años; el objetivo real de los primeros 90 días son 5 clientes con testimonio.

## 2026-08-09 — Instaladas las 49 skills de marketing y estrategia (marketingskills)
- Qué se hizo: el usuario trajo el repo `coreyhaines31/marketingskills` (MIT, v2.10.0, 49 skills de marketing/estrategia). Instalado COMO PLUGIN, sin copiar archivos al repo: `claude plugin marketplace add coreyhaines31/marketingskills` + `claude plugin install marketing-skills@marketingskills`. Para que no se pierda al reiniciar el contenedor, el marketplace y el plugin quedan declarados en `.claude/settings.json` del repo. Esto cierra el pendiente del 18/07 ("la skill que vio por ahí").
- Skills clave que aporta (las que faltaban): `product-marketing` (base: producto/ICP/posicionamiento, la leen todas), `marketing-plan` (plan AARRR de 13 secciones + auditoría), `pricing`, `offers`, `customer-research`, `competitors`, `competitor-profiling`, `marketing-ideas`, `marketing-psychology`, `marketing-council` (consejo asesor simulado). Más CRO, copywriting, lead-magnets, referrals, churn-prevention, ads, SEO, emails, launch…
- Archivos tocados: `.claude/settings.json` (nuevo), `docs/MEMORIA.md`.
- Resuelto el problema del idioma: `CLAUDE.md` lleva la sección "🌍 Skills de marketing en inglés → salida SIEMPRE en español", con la tabla de traducción de jerga (ICP→cliente ideal, MRR→ingresos al mes, churn→clientes que no vuelven…), qué descartar por no haber backend ni suscripciones, y los canales reales de aquí (WhatsApp Business, Google Business Profile, Instagram local).
- Pendiente / siguiente paso: valorar traducir/adaptar un subconjunto (estrategia + precios + ofertas) como skills propias enganchadas a `crear-app` y `captacion-leads`, si la traducción al vuelo se queda corta. Ojo: `content-strategy` del plugin solapa con la `content-strategy-sms` ya instalada.
- Datos a confirmar: coste de contexto del plugin ~13k tokens siempre activos en cada sesión; si molesta, desactivar skills sueltas o el plugin con `claude plugin disable marketing-skills`.

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
