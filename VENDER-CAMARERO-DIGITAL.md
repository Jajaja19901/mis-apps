# 💼 Manual para vender el "Camarero Digital"

Guía sencilla para vender la app de pedidos por QR a bares y restaurantes, y darlos
de alta tú mismo en 15 minutos. (La parte técnica del servidor está en
`GUIA-SERVIDOR-BARES.md`.)

---

## 1. Qué vendes (en una frase)

> Una app donde el cliente del bar **escanea un QR en su mesa, pide desde su móvil
> y la comanda llega directa a la barra**, sin esperar al camarero. El bar la lleva
> todo desde el móvil o una tablet.

No es una web cualquiera: es una herramienta que le **ahorra camareros, evita errores
y hace que la gente pida más** (y repita, con los sellos).

---

## 2. A quién se lo vendes

Bares de tapas, cafeterías, cervecerías, pizzerías, terrazas, restaurantes de menú.
Cuanto **más lleno y con más mesas**, más le interesa (menos viajes del camarero).

---

## 3. Cuánto cobras

- **150 € de alta** (una vez): montaje, su carta, sus QR, su pantalla, su dirección.
- **50 €/mes**: hosting, base de datos, soporte y cambios de carta.

Tu coste real es casi cero (Supabase y Netlify gratis al principio). **El margen es
prácticamente todo.** Con 10 bares = 500 €/mes recurrentes. Con 40 bares = 2.000 €/mes.

> Si un bar no quiere cuota, puedes venderle la versión **sin nube** (solo alta):
> funciona por WhatsApp en vez de tiempo real. Gana menos tú, pero entra el cliente.

---

## 4. Qué le dices al dueño que hace (sus ventajas)

- 🔔 **Menos camareros y menos viajes:** el cliente pide solo desde su mesa.
- ⚡ **Cero errores de oído:** la comanda llega escrita y con extras ("sin cebolla",
  "poco hecho").
- 💸 **Se vende más:** la carta con fotos y los "más pedidos" animan a pedir.
- 🔁 **Repiten:** programa de sellos ("a la 10ª, algo gratis").
- 🌐 **Para turistas:** carta en español e inglés con un botón.
- 📊 **Controla su negocio:** panel de caja (ventas del día, platos top, por camarero).
- 👥 **Controla a sus camareros:** cada uno entra con su PIN; ve quién vende cuánto.
- 💬 **Su personal se comunica** por un tablón interno.
- 🧾 **No le cambia la forma de cobrar:** sigue con su TPV de siempre (importante,
  ver objeciones).

---

## 5. Cómo dar de alta un bar (paso a paso, ~15 min)

1. **Pídele los datos** (ver punto 6).
2. Abre **`tools/generador-bares.html`**, rellena la ficha y su carta, y pulsa
   **"Generar y descargar"**. Te baja el archivo del bar.
3. (Si lleva cuota) Crea su base de datos siguiendo `GUIA-SERVIDOR-BARES.md`
   (una sola vez vale para todos tus bares) y pon sus 3 datos de nube en la ficha.
4. Sube el archivo a **app.netlify.com/drop** (arrastrar y soltar) → te da una
   dirección `https://...`.
5. Pásale al bar esa dirección. En su panel (`/admin`, con su contraseña) → pestaña
   **Mesas/QR**: pone cuántas mesas tiene y **la app le genera todos los QR**.
   "Imprimir cartelitos" → salen listos para recortar y pegar en las mesas.
6. La pantalla de barra (`/barra`) la abre en una **tablet** con el PIN de un
   camarero, y la deja encendida. Las comandas entran solas y suenan. 🔔

---

## 6. Qué pedirle al bar antes de empezar

- Nombre del local y ciudad.
- WhatsApp de contacto.
- Cuántas mesas tiene.
- Horario de cocina (ej. 13:00-16:00 y 20:00-23:30).
- Su carta: platos con precio (y fotos si quiere; si no, las sube él luego).
- Una contraseña para su panel.

Con eso ya generas su app. Lo demás (fotos, agotados, precios) lo cambia él cuando
quiera desde su panel.

---

## 7. Objeciones típicas y qué responder

**"Yo ya tengo mi caja registradora / TPV."**
> Perfecto, no se la tocamos. Esto NO cobra: solo toma las comandas y se las lleva
> a la barra. Tú sigues cobrando con tu TPV de siempre. Es más, así no te metes en
> líos de facturación certificada (VeriFactu): la app no factura.

**"Mis clientes son mayores y no usan el móvil."**
> No pasa nada: el que no quiera, llama al camarero, que toma la nota con la misma
> app desde su móvil. La app es una ayuda, no una obligación.

**"No sé de tecnología."**
> No tienes que saber. Yo te lo dejo montado y funcionando. Tú solo enciendes la
> tablet por la mañana. Y cualquier cambio de carta me lo dices o lo tocas en tu
> panel, que es como rellenar una ficha.

**"¿Y si se va internet?"**
> Las comandas siguen pudiendo tomarse y el bar funciona; cuando vuelve, todo sigue.

**"Es caro."**
> Con que te ahorre medio camarero un fin de semana, ya lo has pagado. Y vende más
> porque la gente pide sin esperar.

---

## 8. Tu demo para enseñar

Abre **`apps/restaurante-qr-ejemplo.html`** en el móvil delante del dueño: enséñale
cómo el cliente elige mesa, pide, personaliza un plato y ve su pedido en vivo; y
luego el panel del dueño (contraseña `tasca2024`) con la caja y los QR. Vale más
que mil explicaciones.

---

## Resumen

Producto probado ✅ · Generador de altas ✅ · Guía técnica ✅ · Manual de venta ✅.
Lo tienes listo para empezar a vender. Cada bar nuevo = 15 minutos de alta y
50 €/mes que entran solos.
