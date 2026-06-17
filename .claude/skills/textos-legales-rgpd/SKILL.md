---
name: textos-legales-rgpd
description: >-
  Úsala SIEMPRE que la app recoja datos por formulario (nombre, teléfono, email,
  mensaje…): por ley (RGPD + LSSI en España) necesita casilla de consentimiento
  OBLIGATORIA, Política de Privacidad y Aviso Legal enlazados en el pie, y una nota
  de cookies/almacenamiento. Te da las plantillas en español con placeholders del
  titular, el microcopy exacto de la casilla y el andamiaje de la sección legal.
  Dispárala con "privacidad", "aviso legal", "RGPD", "GDPR", "LOPD", "cookies",
  "consentimiento", "datos personales", "formulario de contacto/leads", "política".
  Encaja en un solo HTML (sección o ruta #/legal enlazada en el pie). NO es asesoría
  jurídica: plantilla orientativa a revisar por el titular. Lo exige CLAUDE.md.
---

# Textos legales y RGPD — el cumplimiento de la fábrica

Esta skill cubre la obligación legal que `CLAUDE.md` impone a **toda app que recoja datos**:
casilla de consentimiento + Política de Privacidad + Aviso Legal + nota de almacenamiento.
Todo en el mismo HTML (una sección o ruta `#/legal`), enlazado en el pie.

> ⚠️ **No es asesoría jurídica.** Son plantillas orientativas (RGPD/LSSI, España) con placeholders.
> El **titular del negocio** debe revisarlas y adaptarlas. Déjalo dicho en la entrega.

## ¿Cuándo aplica? (árbol de decisión)
1. **¿La app recoge datos personales por formulario** (nombre, teléfono, email, mensaje, reserva)?
   → **SÍ**: casilla de consentimiento **obligatoria** + **Política de Privacidad** + **Aviso Legal**
   en el pie. (Es la regla de `CLAUDE.md`.)
2. **¿Usa cookies de tracking o analítica de terceros?** → La filosofía de la casa dice **NO**.
   Sin tracking, **no hace falta banner de cookies**. Pero sí una **nota** que explique el
   almacenamiento técnico (`localStorage`).
3. **¿Sin formularios y sin datos personales?** → Basta un **Aviso Legal** mínimo (recomendable) y
   nada de RGPD.

## La realidad sin backend (hay que decir la verdad)
Sin servidor, los datos del formulario **no viajan a una base de datos en la nube**: se guardan en el
**dispositivo** (`localStorage`, que ve el dueño en su panel) y/o se **envían por WhatsApp/email** al
pulsar enviar. La Política debe contarlo tal cual y dejar claro:

- **Responsable** = el **titular del negocio** (no el estudio). El estudio solo firma el diseño.
- Dónde acaban los datos (dispositivo del titular y/o el WhatsApp/email del negocio).
- Que el usuario decide enviarlos (base legal = **consentimiento**).

## La casilla de consentimiento (obligatoria para enviar)
- **Sin premarcar**, obligatoria para que el botón envíe.
- Texto exacto (en `referencias/plantillas-legales.md`), enlazando a la Política:
  *"He leído y acepto la [Política de Privacidad]. (obligatorio)"*
- Si no se marca → el formulario muestra error y **no** envía (liga con el microcopy de `copys-que-venden`).

## Datos que rellena el dueño (a CONFIG)
Recoge estos placeholders en `CONFIG` para que el titular los complete en 1 minuto:
`TITULAR` (nombre o razón social), `NIF_CIF`, `DOMICILIO`, `EMAIL_CONTACTO`, `TELEFONO`,
`ACTIVIDAD`, y `HOSTING` (si se publica en un dominio). Sin dato → placeholder visible + avísalo.

## Los tres textos (plantillas completas en la referencia)
→ **`referencias/plantillas-legales.md`** trae, listas para pegar:
1. **Política de Privacidad** — responsable, qué datos se recogen y para qué, base legal
   (consentimiento), conservación, destinatarios, **derechos** (acceso, rectificación, supresión,
   oposición, portabilidad, limitación) y cómo ejercerlos + reclamación ante la **AEPD**.
2. **Aviso Legal (LSSI)** — identificación del titular (nombre, NIF, domicilio, contacto), actividad,
   propiedad intelectual y limitación de responsabilidad.
3. **Nota de cookies/almacenamiento** — qué guarda `localStorage` y para qué; que **no** hay tracking
   ni cookies de terceros (por eso no hay banner).

## Dónde vive en la app
- Una **ruta `#/legal`** o sección con anclas (`#/privacidad`, `#/aviso-legal`), accesible: encabezados
  reales, buen contraste, texto legible.
- **Enlazada en el pie** junto a la firma del estudio.
- El enlace de la **casilla** apunta a la Política.

## Checklist legal (puerta — el QA la verifica si hay formulario)
- [ ] ¿Hay formulario que recoge datos? → Hay **consentimiento obligatorio** sin premarcar.
- [ ] **Política de Privacidad** y **Aviso Legal** existen y están **enlazados en el pie**.
- [ ] La casilla enlaza a la Política; sin marcar, el formulario **no** envía.
- [ ] **Responsable = el titular** (placeholder si falta), **nunca** el estudio ni un NIF inventado.
- [ ] La Política dice la verdad: datos en el dispositivo y/o enviados por WhatsApp/email.
- [ ] Nota de almacenamiento (`localStorage`) presente; sin cookies de tracking.
- [ ] Derechos RGPD + reclamación AEPD incluidos. Aviso "plantilla, revísala" en la entrega.

## Cómo encaja en el pipeline
- **`copywriter`** integra el texto de la casilla; **`ingeniero-frontend`** coloca la sección y los
  enlaces del pie.
- **`ingeniero-datos`** cablea la **puerta de consentimiento** (no envía si no se marca) y la ruta `#/legal`.
- El **QA** veta la entrega si hay formulario sin consentimiento o sin las páginas legales.

## 🔒 Reglas de oro (manda `CLAUDE.md`)
- **El responsable es el titular del briefing**, nunca el estudio. **No inventes** NIF, domicilio ni razón social.
- **Cada app es una isla**: no copies los datos del titular de otra app.
- Plantilla orientativa: recuérdale al cliente que la revise con un profesional.
