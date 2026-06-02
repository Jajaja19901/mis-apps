# 💳 Servidor de pagos (Fase 2) — listo para lanzar más adelante

Este servidor es el "puente" que activa los cobros que **no caben en un HTML suelto**:
cobros con servidor y, sobre todo, **quedarte un % de cada venta de tus clientes**
(Stripe Connect) — tu modelo "gano si tú ganas".

> Está **programado y preparado**, pero **inactivo** hasta que pongas tus claves de Stripe
> y lo despliegues. No maneja dinero hasta entonces.

## Qué hace
| Ruta | Para qué |
|------|----------|
| `POST /api/checkout-senal` | Cobrar la **señal** o un pago único (tarjeta). |
| `POST /api/checkout-suscripcion` | Cobrar el **mantenimiento mensual** (suscripción). |
| `POST /api/connect/onboard` | Dar de **alta a un cliente** como cuenta conectada. |
| `POST /api/checkout-con-comision` | Cobrar al cliente final y **quedarte tu %** automático. |
| `POST /webhook` | Recibir confirmaciones de Stripe (pago hecho, etc.). |

## Cómo lanzarlo (cuando quieras)
1. Crea una cuenta en **stripe.com** (gratis).
2. Copia `.env.example` a `.env` y pega tus claves **de TEST** (`sk_test_...`).
3. Instala y arranca en tu ordenador para probar:
   ```
   cd servidor-pagos
   npm install
   npm start
   ```
4. Despliégalo gratis/barato en **Render**, **Railway** o **Vercel** (te guío cuando llegue el momento).
5. En la landing, conecta los botones de pago a las rutas de este servidor.
6. Cuando todo funcione en TEST, cambia a claves reales (`sk_live_...`).

## ⚠️ Avisos honestos
- **Pruébalo SIEMPRE en modo TEST** de Stripe antes de cobrar de verdad.
- Al manejar dinero, conviene una **revisión** del código antes de ir en producción.
- Quedarte un % del dinero de otros = eres **plataforma** → revisa **IVA/legal** con un gestor.
- La señal y la suscripción funcionan con cualquier cuenta Stripe. El **%** necesita activar
  **Stripe Connect** en tu panel de Stripe.

Cuando quieras lanzarlo, dímelo y lo desplegamos paso a paso.
