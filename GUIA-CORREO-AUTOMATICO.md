# 📬 Correo automático con IA + avisos a tu WhatsApp

Cómo montar que tu correo (incubatunegociowebapps@gmail.com) trabaje solo:
**enviar correos personalizados, leer las respuestas y avisarte al WhatsApp.**

Se monta con **Make.com** (automatizador, plan gratis con 1.000 operaciones/mes)
conectado a tu Gmail. Tú lo conectas UNA vez con tu cuenta (botón "Sign in with
Google") y queda funcionando 24h en sus servidores. Nadie más toca tu contraseña.

---

## Pieza 1 — Avisos al WhatsApp cuando te responden (15 min, gratis)

**Primero, activa CallMeBot** (servicio gratis que manda WhatsApps A TI MISMO):
1. Guarda en tus contactos el número de CallMeBot: **+34 644 51 95 23**.
2. Mándale por WhatsApp este mensaje literal: `I allow callmebot to send me messages`
3. Te responde con tu **apikey** (un número). Guárdalo.

**Luego, en Make.com:**
1. Crea cuenta gratis en **make.com** → "Create a new scenario".
2. **Módulo 1:** busca "Gmail" → elige **"Watch Emails"** → conecta tu cuenta
   (botón de Google, autorizas y ya) → carpeta: INBOX → criterio: "Only unread".
3. **Módulo 2:** busca "HTTP" → **"Make a request"** → URL:
   ```
   https://api.callmebot.com/whatsapp.php?phone=TU_NUMERO&apikey=TU_APIKEY&text=📬 Respuesta de {{1.from.address}}: {{1.subject}}
   ```
   (TU_NUMERO con 34 delante; las llaves {{...}} las arrastras del módulo 1.)
4. Guarda y actívalo (interruptor ON, revisa cada 15 min).

**Resultado:** cada correo nuevo que entre → te llega un WhatsApp al momento.
Si quieres solo los de bares, añade un filtro entre los dos módulos
(p. ej. asunto contiene "app" o remitente no es spam).

---

## Pieza 2 — Que la IA conteste sola (borrador) los correos que llegan

En el MISMO escenario (o en otro):
1. **Gmail "Watch Emails"** (igual que antes).
2. **Módulo IA:** busca "Anthropic Claude" (o "OpenAI") → **"Create a Message"** →
   pega tu clave de IA → modelo: claude-haiku → prompt del sistema:
   ```
   Eres el asistente comercial de Incuba tu Negocio (apps de pedidos por QR para
   bares: el cliente escanea en la mesa, pide desde el móvil y la comanda llega a
   la barra; el bar cobra como siempre). Lee el correo recibido y escribe una
   respuesta breve, cercana y en español de España. Si muestran interés, propón
   enseñarles la demo y de cerrar por WhatsApp o llamada. Si piden precios:
   alta + cuota mensual según plan (Básica/Media/Digital). Si piden la baja,
   discúlpate y confirma que no se les escribirá más. Devuelve SOLO el texto.
   ```
   Y en el mensaje de usuario: `Correo recibido de {{1.from.address}}: {{1.text}}`
3. **Gmail "Create a Draft"** (borrador, NO enviar): destinatario {{1.from.address}},
   asunto "Re: {{1.subject}}", cuerpo = la respuesta de la IA.

**Resultado:** cada respuesta de un bar genera **un borrador ya escrito** en tu
Gmail. Tú lo lees (30 segundos), retocas si quieres, y le das a enviar.
> ¿Por qué borrador y no envío automático? Porque estás vendiendo: un error de la
> IA con un cliente caliente cuesta dinero. Cuando lleves semanas y confíes,
> cambias "Create a Draft" por "Send an Email" y queda 100% automático.

---

## Pieza 3 — Envíos salientes uno a uno (a bares con email)

Los bares de OpenStreetMap rara vez traen email (traen teléfono). Para los que
SÍ tengan (lo ves en su web):
- **Manual-asistido (ya lo tienes):** en el Centro de Captación, botón ✉️ de cada
  bar → te pide su email una vez, lo guarda, y te abre tu Gmail con el correo
  personalizado YA escrito (con IA si tienes clave). Tú: enviar.
- **Automático (cuando tengas volumen):** exporta el CSV del Centro → impórtalo a
  un Google Sheet → en Make: "Google Sheets: Watch Rows" → módulo IA (escribe el
  correo con los datos de la fila) → "Gmail: Send an Email". Pon un sleep de
  15 min entre envíos (Gmail corta si mandas ráfagas) y máximo ~30/día.

## ⚖️ Las 3 reglas del correo comercial (para no quemarte la cuenta)
1. **Identifícate** siempre (quién eres y tu correo de empresa).
2. **Ofrece la baja** en cada correo ("responde BAJA y no te escribimos más") y
   respétala a la primera. (El botón ✉️ del Centro ya la incluye solo.)
3. **Poco volumen y personal**: 20-30/día máximo desde Gmail. Más = a spam y
   cuenta bloqueada. La calidad (su nombre, su gancho) vale más que la cantidad.

## Costes reales
- Make.com: gratis hasta 1.000 operaciones/mes (de sobra para empezar).
- CallMeBot: gratis.
- IA (Claude/OpenAI): céntimos por correo.
- Gmail: gratis.
