# 📣 Máquina de prospección — cómo conseguir clientes

Tres pasos para pasar de cero a tener decenas de demos listas para enviar.
**Sin llamadas robóticas** (eso es ilegal en España): llegas con su app ya hecha.

## 1 · Buscar negocios  —  `tools/prospeccion.html`
Ábrelo en el navegador. Necesitas una **clave de Google Places API**
(Google Cloud → habilitar "Places API (New)" → crear clave).
- Pones tu clave, el tipo ("cafeterías y bares") y la zona ("Las Palmas").
- Te lista los negocios con nombre, dirección, teléfono, web y valoración.
- Marcas a quién quieres, eliges plan, y **"Exportar"** → te baja `lista-negocios.json`.

> La clave se queda en tu navegador. NO subas ese archivo a internet con la clave dentro.

## 2 · Fabricar las demos  —  `tools/generar-lote.mjs`
```bash
STUDIO_WA=34TUWHATSAPP node tools/generar-lote.mjs lista-negocios.json
```
(`STUDIO_WA` = tu WhatsApp, para que el botón "Me interesa" te escriba a ti.)
Te genera, por cada negocio:
- **`<id>-venta.html`** → la **landing de venta** (LO QUE ENVÍAS): saluda al
  negocio por su nombre, muestra su valoración de Google y abre su demo.
- **`<id>.html`** → la **app real** (para entregar cuando cierre).
- **`_contacto.md`** con la **secuencia de 3 toques** de WhatsApp por negocio
  (inicial, recordatorio a 3 días, último a 7 días).

## 3 · Contactar
1. Sube cada `.html` a **app.netlify.com/drop** → te da un enlace.
2. Pega el enlace en el mensaje de WhatsApp del kit de contacto.
3. Envía: *"Os he montado vuestra app, miradla aquí 👇"*. Llegar con su app
   ya hecha cierra mucho más que una llamada.

## ⚖️ Importante (legal)
- Localizar negocios y sus datos públicos: **legal** (son datos de empresa).
- **Llamadas comerciales automatizadas no consentidas: PROHIBIDAS en España**
  (Ley General de Telecomunicaciones, 2023). No montes un robot que llame en masa.
- El primer contacto por WhatsApp/email B2B con tu demo es el camino correcto.
