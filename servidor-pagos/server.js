/* ============================================================================
   SERVIDOR DE PAGOS (Fase 2) — preparado para lanzar cuando quieras
   ----------------------------------------------------------------------------
   Esto es el "puente" que la landing necesita para cobros REALES con servidor:
     1) Señal / pago único (tarjeta vía Stripe Checkout)
     2) Suscripción mensual (el mantenimiento)
     3) Alta de un cliente como cuenta conectada (Stripe Connect)
     4) Cobro al cliente final CON TU COMISIÓN automática  ← "gano si ganas"

   ⚠️ IMPORTANTE antes de usarlo con dinero real:
     - Pon tus claves en variables de entorno (ver .env.example).
     - PRUÉBALO PRIMERO en modo TEST de Stripe (claves sk_test_...).
     - Es un punto de partida sólido; al manejar dinero, conviene revisarlo
       (y revisar el tema fiscal/legal del % con un gestor) antes de ir en serio.
   ============================================================================ */
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
try { require('dotenv').config(); } catch (e) { /* en producción las env vars las pone el host */ }

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');
const app = express();
app.use(cors()); // permite que la landing (otro dominio) llame a este servidor

const SUCCESS = process.env.SUCCESS_URL || 'https://tu-landing.example/#/gracias';
const CANCEL  = process.env.CANCEL_URL  || 'https://tu-landing.example/#form';
const FEE_PCT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '5'); // tu % de comisión

/* --- Webhook de Stripe: necesita el body CRUDO, va ANTES del parser JSON --- */
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  switch (event.type) {
    case 'checkout.session.completed':
      // Aquí marcarías el pedido/lead como PAGADO (avisar por email, etc.)
      console.log('✅ Pago completado:', event.data.object.id);
      break;
    case 'account.updated':
      // La cuenta Connect del cliente cambió de estado (ya puede cobrar, etc.)
      console.log('ℹ️ Cuenta Connect actualizada:', event.data.object.id);
      break;
  }
  res.json({ received: true });
});

app.use(express.json());

/* --- 1) SEÑAL o pago único ------------------------------------------------- */
app.post('/api/checkout-senal', async (req, res) => {
  try {
    const { importe = 10000, concepto = 'Señal de reserva' } = req.body; // importe en CÉNTIMOS (10000 = 100€)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price_data: { currency: 'eur', product_data: { name: concepto }, unit_amount: importe }, quantity: 1 }],
      success_url: SUCCESS, cancel_url: CANCEL,
    });
    res.json({ url: session.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* --- 2) SUSCRIPCIÓN mensual (mantenimiento) -------------------------------- */
/* Crea antes el precio recurrente en Stripe y pasa su priceId (price_...) */
app.post('/api/checkout-suscripcion', async (req, res) => {
  try {
    const { priceId } = req.body;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: SUCCESS, cancel_url: CANCEL,
    });
    res.json({ url: session.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* --- 3) ALTA de un cliente como cuenta conectada (Stripe Connect) ---------- */
app.post('/api/connect/onboard', async (req, res) => {
  try {
    const account = await stripe.accounts.create({ type: 'express', country: 'ES' });
    const link = await stripe.accountLinks.create({
      account: account.id, refresh_url: CANCEL, return_url: SUCCESS, type: 'account_onboarding',
    });
    // Guarda account.id asociado a ese cliente para luego cobrarle con comisión.
    res.json({ accountId: account.id, url: link.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* --- 4) COBRO al cliente final CON TU COMISIÓN ("gano si ganas") ----------- */
app.post('/api/checkout-con-comision', async (req, res) => {
  try {
    const { importe, connectedAccountId, concepto = 'Servicio' } = req.body; // importe en CÉNTIMOS
    const comision = Math.round(importe * (FEE_PCT / 100));
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price_data: { currency: 'eur', product_data: { name: concepto }, unit_amount: importe }, quantity: 1 }],
      payment_intent_data: {
        application_fee_amount: comision,            // TU parte
        transfer_data: { destination: connectedAccountId }, // el resto va al cliente
      },
      success_url: SUCCESS, cancel_url: CANCEL,
    });
    res.json({ url: session.url, comision });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (_, res) => res.send('Servidor de pagos — OK (configura tus claves de Stripe para activarlo).'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('💳 Servidor de pagos escuchando en el puerto ' + PORT));
