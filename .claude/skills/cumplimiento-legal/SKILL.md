---
name: cumplimiento-legal
description: Blindaje legal de las apps de la fábrica (AI Act, RGPD, LSSI, accesibilidad). Úsala SIEMPRE al crear o retocar cualquier app con formulario, y cuando el usuario mencione "ley", "legal", "RGPD", "multas", "normativa", "IA y ley" o pida revisar si una app cumple. Contiene los bloques HTML exactos que hay que incrustar.
---

# Cumplimiento legal de las apps (España + UE)

Fuente completa: `docs/NORMATIVA-IA-Y-WEB.md` (informe de agosto 2026). Esta skill es la
versión ejecutable: qué bloques meter en cada app y cómo verificarlos. **Ninguna app se
entrega sin pasar el checklist del final.**

## Normas que nos aplican (resumen)
- **AI Act (Reglamento UE 2024/1689)**: transparencia (art. 50, en vigor desde 2/8/2026) y
  alfabetización IA (art. 4). Sanciona AESIA: hasta 15 M€ o 3 % por transparencia.
- **RGPD + LOPDGDD**: consentimiento y deber de información en formularios. Sanciona AEPD.
- **LSSI (Ley 34/2002)**: aviso legal con datos del titular (art. 10) y cookies (art. 22.2).
- **Ley 11/2023 (accesibilidad)**: WCAG 2.1 AA — ya lo cubre el `ingeniero-accesibilidad`.

## Qué somos nosotros según el AI Act
Las apps entregadas NO son sistemas de IA (HTML estático + localStorage). Usamos IA para
**producirlas** con revisión humana → los textos caen en la **excepción de revisión
editorial** y no exigen etiquetado. Los SVG dibujados por código no son "contenido
generado por IA" del art. 50. PERO: chatbots e imágenes IA "tipo foto" SÍ obligan (abajo).

## 📦 BLOQUE 1 — Formulario de leads/reservas/pedidos (OBLIGATORIO)
Todo formulario que recoja nombre, teléfono o email lleva, junto al botón de enviar:

```html
<label class="consent">
  <input type="checkbox" id="consent" required>
  He leído y acepto la <a href="#/privacidad">Política de Privacidad</a>
  y el <a href="#/aviso-legal">Aviso Legal</a>.
</label>
<p class="rgpd-mini">
  Responsable: <strong data-cfg="OWNER_NAME">{{TITULAR}}</strong> ·
  Finalidad: atender tu solicitud y contactarte ·
  Legitimación: tu consentimiento · No se ceden datos a terceros ·
  Derechos: acceso, rectificación y supresión en
  <a data-cfg-mail="CONTACT_EMAIL" href="mailto:{{EMAIL}}">{{EMAIL}}</a>.
</p>
```

Reglas duras:
- Casilla **SIN marcar por defecto**. El envío se bloquea si no está marcada (validado en JS,
  no solo con `required`).
- El bloque `rgpd-mini` va **pegado al formulario**, visible sin scroll extra. Letra pequeña
  vale (≥12px, contraste AA); esconderlo en un acordeón NO vale.
- `{{TITULAR}}` y `{{EMAIL}}` salen de `CONFIG` (OWNER_NAME/BUSINESS_NAME, CONTACT_EMAIL).
  Si el briefing no los da → placeholder y se anota en "datos a confirmar".

## 📦 BLOQUE 2 — Política de Privacidad + Aviso Legal (OBLIGATORIO)
Dos rutas propias (`#/privacidad` y `#/aviso-legal`) enlazadas en el pie. Mínimos:

**Aviso Legal (LSSI art. 10):** titular, NIF, domicilio, email, teléfono y, si es sociedad,
datos registrales. Placeholders desde `CONFIG` si faltan.

**Política de Privacidad:** responsable, qué datos se recogen (solo los del formulario),
finalidad, legitimación (consentimiento), conservación ("hasta que solicites la supresión"),
que los datos se guardan **en el dispositivo del titular (localStorage), sin servidores**,
que no hay cesiones ni transferencias internacionales, derechos ARSOPL y cómo ejercerlos
(email del titular), y derecho a reclamar ante la AEPD (www.aepd.es).

## 📦 BLOQUE 3 — Aviso de IA en el pie (recomendado, no obligatorio)
Junto a la firma del estudio, discreto:

```html
<p class="ai-note">Contenidos elaborados con asistencia de IA y revisión humana.</p>
```

No lo exige el art. 50 (hay revisión editorial), pero deja rastro de buena fe ante AESIA.

## 📦 BLOQUE 4 — Cookies (solo si aplica)
Nuestras apps NO usan cookies ni analítica → **no meter banner de cookies** (meterlo sin
usarlas confunde y es mala praxis). En la Política de Privacidad basta una línea:
"Esta web no utiliza cookies". SI algún día se añade analítica/píxeles: banner con
**Aceptar y Rechazar al mismo nivel** (mismo tamaño/color, guía AEPD) y nada se carga
antes de la elección.

## 🚨 Casos que disparan obligaciones extra (art. 50 AI Act)
- **Chatbot/asistente conversacional con IA**: aviso "Soy un asistente virtual (IA)" ANTES
  de la primera interacción del usuario, en la propia burbuja/banner — nunca solo en el
  aviso legal. Ofrecer salida a humano (WhatsApp del dueño).
- **Imágenes/vídeo/audio generados por IA que parezcan reales** (fotos de local, personas,
  platos…): etiqueta visible sobre el contenido ("Imagen generada con IA") + conservar
  metadatos del proveedor (C2PA). Si reproduce a una persona real → etiquetado SIEMPRE,
  sin excepción posible.
- **Texto informativo de interés público publicado sin revisión humana**: etiquetar. (En
  nuestra fábrica nunca pasa: todo se revisa.)
- Reconocimiento de emociones o biometría: **prohibido meterlo** sin análisis legal previo.

## ✅ Checklist de entrega (el QA la ejecuta pulsando)
1. Formulario: casilla sin marcar por defecto; enviar sin marcarla → bloquea con mensaje.
2. Bloque `rgpd-mini` visible junto al formulario con responsable/finalidad/derechos.
3. `#/privacidad` y `#/aviso-legal` existen, enlazadas en el pie, con los mínimos de arriba.
4. Datos del titular reales del briefing o placeholders marcados en "datos a confirmar".
5. Aviso de IA del Bloque 3 presente en el pie.
6. Sin banner de cookies si no hay cookies; con banner AEPD-compliant si las hay.
7. Si hay chatbot IA → aviso previo a la primera interacción. Si hay imágenes IA realistas
   → etiqueta visible sobre la imagen.
8. Nada de reconocimiento de emociones, biometría ni scoring de personas.

## Mantenimiento
- Cambios normativos → actualizar primero `docs/NORMATIVA-IA-Y-WEB.md`, luego esta skill.
- La formación interna en IA (art. 4) se registra en `docs/FORMACION-IA.md`.
