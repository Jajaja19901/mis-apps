---
name: copys-que-venden
description: >-
  Úsala al ESCRIBIR O MEJORAR LOS TEXTOS de una app/web/embudo para que vendan:
  titular del hero, subtítulos, bloque de beneficios, llamadas a la acción (CTA),
  manejo de objeciones, FAQ, microcopy de formularios (labels, errores, éxito,
  casilla de consentimiento) y mensajes de WhatsApp prerrellenados. Dispárala cuando
  el encargo mencione "textos", "copy", "que venda/convierta", "titular", "claim",
  "CTA", "mensaje de WhatsApp", "argumentos de venta", "FAQ", o cuando una pantalla
  no empuje a la acción. Complementa al agente copywriter. Siempre en el idioma del
  briefing (por defecto español), contenido REAL (cero lorem ipsum), sin inventar
  datos, marca, cifras ni testimonios.
---

# Copys que venden — el playbook de palabras de la fábrica

Esta skill es el **cerebro de copy** que comparten el Director y el agente `copywriter`.
No reemplaza al `copywriter`: le da el **CÓMO** para que cada pantalla empuje a la acción
y los textos suenen a este negocio (no a plantilla). Todo encaja con la filosofía de la
casa: un solo HTML, embudo de venta, mobile-first, contacto que cierra por WhatsApp/Bizum.

## ⛔ La regla nº1: una persona, una acción, un beneficio
Cada pantalla tiene **UNA** acción principal (pedir cita, escribir por WhatsApp, comprar).
Todo el texto de esa pantalla empuja hacia ella. Si un párrafo no acerca a la acción, sobra.

- Escribe para **una sola persona** (el cliente del negocio), de tú, como si hablaras con ella.
- **Beneficio antes que característica**: no "corte con tijera japonesa", sino "sales con un look
  que te dura semanas". Traduce cada feature en lo que el cliente *gana*.
- **Claridad > ingenio**. Si hay que elegir entre gracioso y claro, claro. Sin jerga.
- Frases cortas. Verbos. Cero relleno ("en el mundo actual…", "somos líderes…").

## 🚫 Lo que NUNCA inventas (manda `CLAUDE.md` y la ley)
Publicidad engañosa = problema legal y de confianza. Si el dato no está en el briefing, **no
lo pongas** (o usa placeholder y avísalo). Prohibido inventar:

- **Testimonios o reseñas**, nombres de clientes, "valorado 5★ por 200 personas".
- **Cifras** ("+10.000 clientes", "25 años de experiencia") que no dé el briefing.
- **Premios, certificaciones, "visto en…"**, sellos o medios.
- **Escasez/urgencia falsa** ("solo quedan 2 plazas") si no es verdad.
- **Promesas** que el negocio no puede cumplir (resultados garantizados, "el mejor de la ciudad").

Si el cliente quiere prueba social y no la dio → deja un **bloque vacío con placeholder** y anótalo
en "datos a confirmar".

## Las piezas del embudo (con fórmulas)
El swipe file completo —fórmulas con huecos, banco de CTAs, objeciones, microcopy y guiones de
WhatsApp por sector— está en:

→ **`referencias/formulas-y-ejemplos.md`**. Resumen de cada pieza:

**1. Titular (hero).** Promesa concreta para quién. Fórmulas: *[Resultado deseable] para [quién]
en [ciudad/tiempo]* · *Deja de [dolor], empieza a [beneficio]* · pregunta que toca el dolor.
Que se entienda en 3 segundos qué es y para quién.

**2. Subtítulo.** 1–2 líneas: qué es + para quién + por qué tú. Baja la promesa a tierra.

**3. CTA.** Verbo + beneficio + baja fricción: "Pide tu cita en 1 minuto", "Escríbenos por WhatsApp
ahora", "Reserva tu mesa". Primario = la acción; fantasma = alternativa ("Ver servicios"). Repite
el CTA principal al final de cada pantalla larga.

**4. Beneficios (3 bloques).** Título corto + 1 frase. Beneficio, no feature. Iconos SVG, no emojis sueltos.

**5. Confianza.** SOLO datos reales del briefing (años, garantía real, "atendido por su dueña").
Sin briefing → placeholder, nunca inventes.

**6. Objeciones / FAQ.** Responde lo que frena la compra: precio, tiempo, "¿y si no me gusta?",
ubicación, formas de pago. Cada respuesta reduce un miedo y reconduce a la acción.

**7. Microcopy de formulario.** Labels claros; placeholders de ayuda; errores **amables y
específicos** ("Pon un teléfono de 9 dígitos", no "Error"); pantalla de **éxito** que confirma el
siguiente paso ("¡Recibido! Te escribimos hoy mismo por WhatsApp"); **casilla de consentimiento**
obligatoria (texto y enlace los da la skill `textos-legales-rgpd`).

**8. Mensaje de WhatsApp prerrellenado.** El `?text=` que arranca la conversación sin que el cliente
piense: *"Hola, vengo de la web y quiero información sobre ___"*. Personalízalo por pantalla.

## Tono desde el briefing
La **voz** la marca el briefing (cercano/profesional/divertido/lujo). Mantén el mismo registro en
toda la app. Si el briefing no define tono, usa **cercano y claro** (lo que mejor convierte en
negocio local) y anótalo.

## Antes / después (el patrón mental)
- ❌ "Bienvenidos a nuestra peluquería, ofrecemos servicios de calidad para toda la familia."
- ✅ "Sal con un look que te encante hoy mismo. Cortes, color y peinado en el centro de [Ciudad].
  Pide tu cita por WhatsApp en 1 minuto."

## Checklist de copy (puerta antes de seguir)
- [ ] Cada pantalla tiene UNA acción principal y el texto empuja a ella.
- [ ] El titular se entiende en 3 segundos (qué + para quién).
- [ ] Beneficios, no características. Cero relleno corporativo.
- [ ] CERO datos inventados (testimonios, cifras, premios, escasez falsa).
- [ ] CTAs con verbo + beneficio, repetidos donde toca.
- [ ] FAQ que mata las objeciones reales del sector.
- [ ] Microcopy de formulario completo: labels, ayudas, **errores**, **éxito**, consentimiento.
- [ ] Mensaje de WhatsApp prerrellenado y útil.
- [ ] Mismo tono (el del briefing) en toda la app. Contenido REAL, cero lorem ipsum.

## Cómo encaja en el pipeline
- El agente **`copywriter`** saca de aquí las fórmulas y el banco de objeciones, y devuelve los
  textos reales en el tono del cliente.
- **`ingeniero-frontend`** pega esos textos en la maqueta (no inventa los suyos).
- **`textos-legales-rgpd`** aporta el texto exacto de la casilla de consentimiento.
- El **QA** verifica que no hay lorem ipsum, ni datos inventados, y que cada pantalla convierte.

## 🔒 Reglas de oro (manda `CLAUDE.md`)
- **No inventes marca, nombre, cifras ni testimonios.** Sin dato → placeholder y avísalo.
- **Cada app es una isla**: no reutilices textos, claims ni argumentos de otra app.
- Solo te inspiras en una referencia externa si el **prompt lo pide expresamente** (un enlace concreto).
