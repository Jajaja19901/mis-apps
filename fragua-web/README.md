# Fragua Móvil

Versión **web** de Fragua para usar desde el **móvil**: abres un enlace, conectas una
IA gratis (modelos chinos como DeepSeek o Qwen a través de OpenRouter) y le pides
webs, apps o código. La IA responde con un **archivo HTML** que puedes **previsualizar,
descargar y compartir** desde el propio teléfono. Instalable como app (PWA).

No necesita instalar nada, ni un PC encendido. Todo (conversaciones, clave) se guarda
**solo en tu dispositivo**; al chatear, tus mensajes se envían al proveedor de IA que tú elijas.

## Qué puedes hacer

- Generar **landings y webs de negocio** en un solo archivo HTML (con vista previa).
- Pedir **trozos de código** (formularios, galerías, calculadoras…).
- **Explicar / arreglar** código que pegues.
- Guardar varias **conversaciones** y retomarlas.
- **Compartir** el HTML generado por WhatsApp/email con el botón nativo del móvil.

## Cómo publicarlo (una vez) para tener el enlace del móvil

Se sirve como página estática. La forma gratuita es **GitHub Pages**:

1. En GitHub, entra en el repositorio → **Settings** → **Pages**.
2. En *Build and deployment* → *Source*: **Deploy from a branch**.
3. Elige la rama (por ejemplo `main`) y la carpeta **/ (root)**; guarda.
   - Como esta app vive en `fragua-web/`, la dirección será
     `https://TU-USUARIO.github.io/mis-apps/fragua-web/`.
4. Espera 1-2 minutos y abre esa dirección **en el móvil**.

> Alternativa sin GitHub: cualquier hosting estático (Netlify Drop, Cloudflare Pages,
> Vercel) sirviendo la carpeta `fragua-web/`. Necesita HTTPS para instalarla como app.

## Cómo instalarla en el móvil (icono como app)

- **Android (Chrome):** menú ⋮ → *Añadir a pantalla de inicio* / *Instalar app*.
- **iPhone (Safari):** botón *Compartir* → *Añadir a pantalla de inicio*.

## Cómo conectar la IA gratis (una vez, dentro de la app)

1. Abre **Ajustes (⚙)**.
2. Crea una cuenta gratis en [openrouter.ai](https://openrouter.ai) → **Keys** →
   *Create Key*, y copia la clave (`sk-or-…`).
3. Pégala en *Clave API*, deja el modelo `deepseek/deepseek-chat-v3-0324:free`
   (o elige otro `:free`) y pulsa **Guardar**.
4. *Comprobar conexión* debe salir en verde. ¡A crear!

Modelos gratis disponibles hoy: <https://openrouter.ai/models?max_price=0>.
Si uno da error de límite (429/402), prueba otro `:free` o espera al reinicio diario.

## Otros proveedores

En *Ajustes → Opciones avanzadas* puedes cambiar la **URL base** a cualquier servidor
compatible con OpenAI: por ejemplo tu propio ordenador con Ollama
(`http://TU-IP:11434/v1`) para tener IA local y privada desde el móvil por tu red.

## Límites honestos

- La IA gratis tiene **cupo diario**; para uso intenso, mejor la Fragua de escritorio.
- Es una app de navegador: **no accede a las carpetas de tu ordenador ni tiene terminal**.
  Está pensada para **crear y previsualizar** sobre la marcha; el trabajo fino, en el PC.
- La clave API vive en el navegador del móvil (localStorage). No la compartas.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | La app (estructura + estilos) |
| `app.js` | Lógica: chat con streaming, markdown seguro, vista previa, descarga/compartir, ajustes |
| `sw.js` | Service worker (arranque instantáneo y shell offline) |
| `manifest.webmanifest` | Manifiesto PWA (instalable) |
| `icon.svg`, `icon-maskable.svg` | Iconos |

Parte de la familia **Fragua** · Incuba tu Negocio · Jaime M. M.
