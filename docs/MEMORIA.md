# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-15 (2) — Skill `cumplimiento-legal` + acta de formación IA
- Qué se hizo: creado el blindaje legal operativo a partir del informe de normativa: (1) skill `.claude/skills/cumplimiento-legal/SKILL.md` con los bloques HTML exactos (consentimiento + rgpd-mini, privacidad/aviso legal mínimos, nota de IA en el pie, reglas de cookies y de chatbot/imágenes IA) y checklist de entrega; (2) punto 11 legal con VETO en el agente `10-qa-verificador`; (3) `docs/FORMACION-IA.md` como registro del art. 4 del AI Act (inventario de herramientas, política interna de uso de IA, tabla de formación); (4) CLAUDE.md y skill `captacion-leads` enlazan la nueva skill.
- Archivos tocados: `.claude/skills/cumplimiento-legal/SKILL.md` (nuevo), `docs/FORMACION-IA.md` (nuevo), `.claude/agents/10-qa-verificador.md`, `CLAUDE.md`, `.claude/skills/captacion-leads/SKILL.md`, `docs/MEMORIA.md`.
- Pendiente / siguiente paso: (1) el usuario debe hacer un curso básico de IA (2–4 h; AESIA/INCIBE/FUNDAE) y apuntarlo en `docs/FORMACION-IA.md` con su NIF y datos reales; (2) en la próxima app que se toque, aplicar el Bloque 1 y 3 de la skill también a `apps/peluqueria-aurora.html` y demás apps ya entregadas.
- Datos a confirmar: NIF/razón social del titular para FORMACION-IA.md y para los avisos legales.

## 2026-08-15 — Informe de normativa europea/española de IA para las apps
- Qué se hizo: investigado el AI Act (Reglamento UE 2024/1689), el proyecto español de Ley Orgánica de gobernanza de IA, RGPD/LSSI, Ley 11/2023 (accesibilidad) y NIS2, todo aplicado a las apps que fabricamos aquí (embudos + formulario de leads + panel de admin). Redactado `docs/NORMATIVA-IA-Y-WEB.md`: resumen ejecutivo, calendario, art. 4 (alfabetización IA obligatoria) y art. 50 (transparencia), sanciones (hasta 35 M€ / 7 %), checklist para el QA y cambios concretos a meter en las plantillas.
- Archivos tocados: `docs/NORMATIVA-IA-Y-WEB.md` (nuevo), `docs/MEMORIA.md`.
- Pendiente / siguiente paso: (1) meter en la plantilla del formulario de leads el bloque RGPD completo (responsable/finalidad/derechos) junto a la casilla, (2) añadir aviso discreto en el pie "Contenidos asistidos por IA con revisión humana", (3) actualizar el agente `qa-verificador` con el checklist legal del informe, (4) preparar `docs/FORMACION-IA.md` con acta de alfabetización IA cuando el usuario haga un curso básico.
- Datos a confirmar: si en el futuro añadimos chatbot o imágenes generadas por IA "tipo foto" a las apps, revisar el bloque 5.2 del informe (aplica etiquetado obligatorio).

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
