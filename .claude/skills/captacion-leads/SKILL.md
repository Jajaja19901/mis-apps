---
name: captacion-leads
description: Añade o mejora la captación de leads (clientes potenciales) en las apps de la fábrica. Úsala cuando el usuario pida "captar clientes", "conseguir leads", "que me dejen el teléfono", "embudo de captación" o similar, o al crear cualquier app cuyo objetivo sea conseguir contactos de clientes.
---

# Captación de leads en las apps de la fábrica

Objetivo: que cada app convierta visitantes en CONTACTOS REALES (nombre + teléfono/WhatsApp)
que el dueño ve en su panel de admin. Sin backend: todo en localStorage + WhatsApp.

## Piezas obligatorias del embudo de captación

1. **Gancho con oferta** (lead magnet): descuento de bienvenida, diagnóstico gratis,
   presupuesto sin compromiso… lo que encaje con el negocio del briefing.
2. **Formulario mínimo**: nombre + teléfono (email opcional). Cada campo extra reduce
   conversión ~10%. Nunca más de 4 campos.
3. **Casilla RGPD obligatoria** ("Acepto la política de privacidad") + página de
   Política de Privacidad enlazada en el pie. Sin esto NO se entrega (ley española).
4. **Doble salida tras enviar**:
   - Guardar el lead en localStorage (colección `leads`, con fecha y origen).
   - Botón "Continuar por WhatsApp" con mensaje prerrellenado (wa.me/<TELEFONO>?text=...).
5. **Panel de admin** (`#/admin`): lista de leads con fecha, origen y estado
   (nuevo / contactado / cliente / descartado) + **exportar CSV** + borrar.
6. **CTA visible siempre**: botón flotante de WhatsApp en toda la app y CTA principal
   repetido al final de cada sección.

## Multiplicadores de conversión (añadir cuando encaje)

- Urgencia honesta: "Solo X huecos esta semana" únicamente si el briefing lo respalda.
- Prueba social: reseñas del briefing; si no hay, sección "opiniones" que el dueño
  rellena desde el admin (nunca inventar reseñas).
- Respuesta inmediata: tras enviar, mensaje "Te contestamos en menos de 1 hora en horario
  de apertura" (ajustado al horario del CONFIG).
- Recordatorio de salida (exit intent en móvil: al hacer scroll-up rápido) con la oferta.

## Medición sin cookies

Contador anónimo en localStorage: visitas por sección y clics en CTA (sin datos
personales, sin cookies → sin banner). El panel de admin muestra: visitas → formularios
enviados → % conversión, para que el dueño sepa si el embudo funciona.

## Reglas

- El teléfono/WhatsApp de destino sale SIEMPRE del CONFIG, nunca inventado.
- Los textos del gancho los escribe el copywriter en el tono del briefing.
- El QA verifica el flujo completo: rellenar formulario → aparece en admin → export CSV.
