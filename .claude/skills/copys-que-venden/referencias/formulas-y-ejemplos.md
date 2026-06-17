# Swipe file — fórmulas, bancos y guiones

Rellena los `[huecos]` con datos del **briefing**. **Nunca** inventes cifras, testimonios ni premios.
Estos ejemplos son **genéricos con placeholder**: no son de ningún cliente, no los copies tal cual a
una app sin adaptarlos.

---

## 1) Banco de titulares (hero)
Elige una fórmula y rellénala. Que se entienda en 3 segundos.

- **Resultado + para quién:** "[Resultado deseable] para [quién] en [ciudad]."
  → "Una sonrisa sana para toda la familia en [Ciudad]."
- **Deja de / empieza a:** "Deja de [dolor], empieza a [beneficio]."
  → "Deja de pelear con tu pelo. Empieza a salir de casa encantada."
- **Pregunta que toca el dolor:** "¿[Dolor cotidiano]? [Solución en 1 frase]."
  → "¿Sin tiempo para cocinar sano? Comida casera lista en 10 minutos."
- **Promesa + tiempo/facilidad:** "[Servicio] en [Ciudad], reserva en 1 minuto."
- **Para quién, claro:** "El [servicio] de confianza para [público] de [barrio/ciudad]."

## 2) Banco de subtítulos
1–2 líneas: qué es + para quién + por qué tú.
- "[Qué haces] para [público]. [Diferencial real]. Pide cita por WhatsApp y te respondemos hoy."
- "Más de [dato REAL del briefing] · [garantía real] · [ubicación]." *(solo datos reales)*

## 3) Banco de CTAs (por intención)
- **Contacto/cita:** "Pide tu cita" · "Reserva en 1 minuto" · "Escríbenos por WhatsApp" · "Llama ahora"
- **Compra:** "Añadir al carrito" · "Pedir por WhatsApp" · "Comprar ahora"
- **Info:** "Ver servicios" · "Ver la carta" · "Cómo funciona"
- **Cierre de página:** repite el primario: "¿Listo? Pide tu cita por WhatsApp."
> Verbo + beneficio + baja fricción. El primario es la acción; el fantasma, la alternativa.

## 4) Característica → Beneficio (traduce siempre)
| Característica (lo que es) | Beneficio (lo que gana el cliente) |
|---|---|
| "Tijera japonesa / producto premium" | "Un acabado que te dura semanas" |
| "20 años de experiencia" *(si es real)* | "Manos expertas: aciertas a la primera" |
| "Cita por WhatsApp" | "Reservas en 1 minuto, sin llamadas ni esperas" |
| "Productos sin parabenos" | "Cuidas tu piel sin preocuparte de la letra pequeña" |
| "Aparcamiento propio" | "Llegas, aparcas y entras: sin dar vueltas" |

## 5) Banco de objeciones / FAQ (locales típicas)
Adapta la respuesta al negocio; cada una reduce un miedo y reconduce a la acción.
- **Precio:** "¿Cuánto cuesta?" → rango u "desde [precio]", qué incluye, y "te lo confirmamos por WhatsApp sin compromiso".
- **Tiempo:** "¿Cuánto tardáis / cuándo tenéis hueco?" → disponibilidad y "reserva y te confirmamos el hueco más cercano".
- **Confianza:** "¿Y si no me convence?" → garantía/retoque reales o "lo hablamos antes de empezar; tú decides".
- **Ubicación/parking:** dónde estáis, cómo llegar, aparcamiento.
- **Pago:** "¿Cómo se paga?" → efectivo/tarjeta/Bizum; si hay carrito, recuerda que el cobro se cierra por WhatsApp/Bizum.

## 6) Microcopy de formulario
- **Labels:** "Tu nombre", "Teléfono (WhatsApp)", "¿Qué necesitas?".
- **Placeholders de ayuda:** "Ej.: corte y color", "Para confirmarte por WhatsApp".
- **Errores (amables y específicos):**
  - Vacío: "Necesitamos tu nombre para responderte."
  - Teléfono: "Pon un teléfono de 9 dígitos, por favor."
  - Email: "Revisa el email: parece que falta algo."
- **Éxito (confirma el siguiente paso):** "¡Recibido! Te escribimos hoy mismo por WhatsApp. 📲"
- **Casilla de consentimiento (obligatoria):** *"He leído y acepto la [Política de Privacidad]."*
  → el texto y el enlace exactos los da la skill `textos-legales-rgpd`.

## 7) Guiones de WhatsApp prerrellenados
Mensaje que arranca la conversación sin que el cliente piense. Codifica con `encodeURIComponent`:
```js
const tel = CONFIG.WHATSAPP;                 // ej. "34600000000"
const msg = "Hola, vengo de la web y quiero información sobre ";
const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
```
Variantes por pantalla:
- Cita: "Hola, quiero pedir cita para [servicio]. ¿Qué huecos tenéis?"
- Pedido: "Hola, quiero hacer un pedido: [resumen del carrito]."
- Duda: "Hola, tengo una duda sobre [tema]."

## 8) Mini-ejemplos por sector (placeholder — adáptalos, no los copies)
> Marcador de nombre = `[Negocio]`. Son ilustraciones de tono, no contenido final.

- **Peluquería:** H1 "Sal con un look que te encante hoy mismo." · Sub "Cortes, color y peinado en [Ciudad]. Pide tu cita por WhatsApp en 1 minuto." · CTA "Pedir cita".
- **Restaurante:** H1 "Cocina de siempre, en el corazón de [Ciudad]." · Sub "Reserva tu mesa o pide para llevar." · CTA "Reservar mesa".
- **Dentista:** H1 "Una sonrisa sana, sin miedo al dentista." · Sub "Revisión, limpieza y ortodoncia en [Ciudad]. Primera visita sin compromiso." · CTA "Pedir cita".
- **Gimnasio:** H1 "Empieza hoy, nota el cambio en semanas." · Sub "Clases y sala en [Ciudad], con plan a tu medida." · CTA "Probar una clase".

---

### Recordatorio
- Beneficio antes que característica. Una acción por pantalla. Tono del briefing.
- CERO datos inventados (testimonios, cifras, premios, escasez falsa). Sin dato → placeholder + aviso.
