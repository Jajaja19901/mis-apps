# 🚀 Cómo usar tu fábrica de apps (guía fácil)

No necesitas saber nada técnico. Esto ya está montado y listo.

## Para crear una app nueva (lo normal)
1. Abre una conversación de Claude sobre este repositorio (`mis-apps`).
2. Escribe algo tan simple como:

   > *"Créame una app para una peluquería en Madrid. Que la gente pida cita.
   >  Mi WhatsApp es 600111222."*

3. Claude lanza solo a los 10 agentes y te entrega la app terminada.
4. Te la deja guardada en la carpeta `apps/` y subida a GitHub.

**Cuanta más info des, mejor sale.** Si no sabes qué decir, responde a estas 4 cosas:
- ¿De qué es el negocio?
- ¿Qué quieres que consiga la web? (que llamen, reserven, compren, dejen sus datos…)
- ¿Tu WhatsApp / email?
- ¿Nombre del negocio y ciudad?

## ¿Qué hay en este repositorio?
- **`.claude/agents/`** → tus 10 agentes especialistas (el equipo que construye).
- **`briefing.html`** → un cuestionario bonito para recoger los datos del cliente.
  Ábrelo en el móvil, respóndelo, y al final te da un texto listo para pegarle a Claude.
- **`apps/`** → aquí se guardan las apps creadas. Ya hay una de ejemplo
  (`peluqueria-aurora.html`): ábrela y verás cómo funciona.
- **`CLAUDE.md`** → las instrucciones internas para que Claude trabaje automático.

## Cómo se ve una app por dentro
- La parte pública es un **embudo de venta** (atrae y convierte).
- Tus clientes **no se registran** (sin usuario ni contraseña).
- Tú entras a tu **panel privado** añadiendo `#/admin` al final de la dirección, con tu
  contraseña, y ahí ves todo lo que te llega.

## Cada app es 100% tuya
- Sin recogida de datos personales → sin líos de RGPD.
- Un solo archivo: lo abres tocándolo, o lo subes a internet para tener un enlace.

¿Dudas? Solo pregúntale a Claude en lenguaje normal. Para eso está. 🙂
