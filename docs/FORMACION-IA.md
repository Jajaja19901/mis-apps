# 🎓 Registro de alfabetización en IA (art. 4 del AI Act)

> El art. 4 del Reglamento (UE) 2024/1689 obliga desde el 2/2/2025 a que toda empresa o
> autónomo que USE IA garantice que su gente tiene un nivel adecuado de conocimiento sobre
> ella. No exige certificado oficial: exige **poder demostrarlo**. Este archivo es esa
> prueba. AESIA puede pedirla desde el 2/8/2026.

## Datos del obligado
- Titular: **[NOMBRE / RAZÓN SOCIAL — rellenar]** (placeholder, confirmar)
- NIF: [rellenar]
- Actividad: diseño y desarrollo de webs/apps para negocios ("Incuba tu Negocio")
- Personas que usan IA: **Jaime M. M.** (dirección + supervisión editorial)
  [añadir colaboradores si los hay]

## Sistemas de IA que se usan (inventario)
| Sistema | Proveedor | Uso | Riesgo AI Act |
|---|---|---|---|
| Claude (Code / claude.ai) | Anthropic | Generación asistida de webs, textos y código, con revisión humana antes de entregar | Mínimo (uso profesional de un GPAI de terceros) |
| Higgsfield (imagen/vídeo/audio) | Higgsfield | Creación puntual de material audiovisual de marketing | Limitado si el resultado parece real → etiquetar (art. 50) |

> Mantener esta tabla al día: cada herramienta nueva de IA se apunta aquí antes de usarla.

## Formación realizada
| Fecha | Persona | Formación | Duración | Evidencia |
|---|---|---|---|---|
| [pendiente] | Jaime M. M. | [curso básico de fundamentos y riesgos de IA — p. ej. los gratuitos de AESIA/INCIBE/Google Actívate, o uno bonificado por FUNDAE] | [horas] | [certificado/captura] |

**Siguiente paso:** hacer un curso introductorio (2–4 h basta para nuestro nivel de riesgo),
guardar el certificado en `docs/certificados/` y apuntar la fila. Repetir/refrescar
aproximadamente una vez al año o cuando cambien las herramientas.

## Política interna de uso de IA (en vigor)
1. **Revisión humana siempre**: ningún texto, imagen o app generado con IA se entrega a un
   cliente sin que una persona lo revise y asuma la responsabilidad editorial. (Esto activa
   la excepción de etiquetado del art. 50 para los textos.)
2. **Nada de datos personales en los prompts**: no se pegan datos de clientes finales
   (nombres+teléfonos de leads, etc.) en herramientas de IA. Los briefings solo llevan los
   datos de contacto que el negocio quiere publicar.
3. **Contenido realista generado por IA se etiqueta** sobre el propio contenido
   ("Generado con IA"). Deepfakes de personas reales: prohibidos.
4. **Prohibido** usar IA para: scoring de personas, reconocimiento de emociones, biometría,
   decisiones automatizadas con efectos legales sobre alguien.
5. **Cada app entregada** pasa el checklist de la skill `cumplimiento-legal` y el
   verificador automático antes del commit (queda rastro en git como evidencia de revisión).

## Registro de revisiones humanas por entrega
El propio historial de git de este repositorio (commits de cada app + verificación
`✅ APTO` + QA del agente 10) constituye el registro de que cada pieza generada con IA
pasó supervisión humana antes de publicarse.

---
*Última actualización: 15/08/2026. Revisar tras cada cambio normativo (ver
`docs/NORMATIVA-IA-Y-WEB.md`).*
