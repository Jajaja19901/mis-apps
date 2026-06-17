# Plantillas legales (RGPD + LSSI, España) — con placeholders

> ⚠️ **Plantilla orientativa, NO asesoría jurídica.** Rellena los `PLACEHOLDER` con los datos del
> **titular del negocio** (nunca el estudio, nunca inventados) y recomiéndale revisarla con un
> profesional. El **responsable** del tratamiento es el titular.

---

## 1) Datos del titular en `CONFIG`
```js
const CONFIG = {
  // ...resto de config...
  TITULAR:        "NOMBRE O RAZÓN SOCIAL",
  NIF_CIF:        "00000000X",
  DOMICILIO:      "CALLE Y NÚMERO, CP, CIUDAD",
  EMAIL_CONTACTO: "correo@negocio.com",
  TELEFONO:       "+34 600 000 000",
  ACTIVIDAD:      "Breve descripción de la actividad (p. ej. peluquería)",
  HOSTING:        "Proveedor de hosting (solo si se publica en un dominio)"
};
```
Sin un dato → deja el placeholder visible y anótalo en "datos a confirmar".

## 2) Casilla de consentimiento (obligatoria para enviar)
HTML (usa la clase `.consent` de las recetas de `diseno-web-pro`):
```html
<label class="consent">
  <input type="checkbox" id="consent" required>
  <span>He leído y acepto la <a href="#/privacidad">Política de Privacidad</a>.
  <em>(obligatorio)</em></span>
</label>
```
Puerta de envío (no envía si no se marca):
```js
if (!form.consent.checked) {
  showError(form.consent, "Debes aceptar la Política de Privacidad para continuar.");
  return; // no envía
}
```

## 3) Andamiaje de la sección legal (`#/legal`)
```html
<section id="legal" class="legal wrap">
  <h1>Información legal</h1>
  <nav aria-label="Apartados legales">
    <a href="#/privacidad">Política de Privacidad</a> ·
    <a href="#/aviso-legal">Aviso Legal</a> ·
    <a href="#/cookies">Cookies y almacenamiento</a>
  </nav>
  <article id="privacidad">…(texto §4)…</article>
  <article id="aviso-legal">…(texto §5)…</article>
  <article id="cookies">…(texto §6)…</article>
</section>
```
En el **pie**, junto a la firma del estudio:
```html
<a href="#/privacidad">Privacidad</a> · <a href="#/aviso-legal">Aviso legal</a>
```

---

## 4) Política de Privacidad (plantilla)
```
POLÍTICA DE PRIVACIDAD

Responsable del tratamiento
Titular: {{TITULAR}} · NIF/CIF: {{NIF_CIF}}
Domicilio: {{DOMICILIO}} · Email: {{EMAIL_CONTACTO}} · Teléfono: {{TELEFONO}}

¿Qué datos recogemos y con qué finalidad?
Solo tratamos los datos que nos facilitas voluntariamente a través de los formularios de este
sitio (por ejemplo: nombre, teléfono y/o email y el mensaje que escribas), con la finalidad de
atender tu solicitud, contactarte y, en su caso, gestionar tu cita o pedido. No recogemos datos
sin tu acción ni elaboramos perfiles.

Dónde se guardan tus datos
Este sitio funciona sin servidor propio. Los datos que envías se almacenan en el dispositivo desde
el que se gestiona el negocio (en el navegador, mediante almacenamiento local) y/o se remiten al
titular a través de WhatsApp o correo electrónico cuando pulsas enviar. El titular es responsable
de su custodia.

Base legal
El consentimiento que prestas al marcar la casilla y enviar el formulario (art. 6.1.a RGPD).

Conservación
Conservamos tus datos el tiempo necesario para atender tu solicitud y, después, durante los plazos
legales aplicables. Puedes pedir su supresión en cualquier momento.

Destinatarios
No cedemos tus datos a terceros, salvo obligación legal. {{HOSTING_OPCIONAL: Si el sitio se aloja en
un proveedor de hosting, este actúa como encargado del tratamiento.}}

Tus derechos
Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y
portabilidad escribiendo a {{EMAIL_CONTACTO}}, indicando tu solicitud y acreditando tu identidad.
Si consideras que no se han atendido correctamente, puedes reclamar ante la Agencia Española de
Protección de Datos (www.aepd.es).

Última actualización: {{FECHA}}.
```

## 5) Aviso Legal (LSSI) (plantilla)
```
AVISO LEGAL

En cumplimiento de la Ley 34/2002 (LSSI-CE), se informa:
Titular: {{TITULAR}} · NIF/CIF: {{NIF_CIF}}
Domicilio: {{DOMICILIO}} · Email: {{EMAIL_CONTACTO}} · Teléfono: {{TELEFONO}}
Actividad: {{ACTIVIDAD}}

Propiedad intelectual e industrial
Los contenidos de este sitio (textos, imágenes, logotipos y diseño) pertenecen a su titular o se
usan con autorización, y no pueden reproducirse sin permiso.

Responsabilidad
El titular no se responsabiliza del mal uso de los contenidos ni de los daños derivados de
interrupciones del servicio ajenas a su control. La información tiene carácter orientativo y puede
actualizarse sin previo aviso.

Legislación aplicable
Este aviso se rige por la legislación española.
```

## 6) Nota de cookies y almacenamiento (plantilla)
```
COOKIES Y ALMACENAMIENTO

Este sitio NO utiliza cookies de seguimiento ni herramientas de analítica de terceros, por lo que no
es necesario un banner de cookies. Únicamente emplea el almacenamiento local del navegador
(localStorage) para que la aplicación funcione: recordar el contenido del carrito o pedido, guardar
las solicitudes que envías y permitir al titular gestionar el negocio desde su panel. Esta
información permanece en el dispositivo y puedes borrarla limpiando los datos del navegador.
```

---

### Recordatorios
- **Responsable = el titular** (placeholder si falta). El estudio solo firma el diseño en el pie.
- Si **no** hay formulario de datos → basta el Aviso Legal; quita la Política y la casilla.
- Di la **verdad** sobre el sin-backend: datos en el dispositivo y/o por WhatsApp/email.
- Sustituye `{{FECHA}}` por la fecha de entrega. Avisa al cliente: "revísala con un profesional".
