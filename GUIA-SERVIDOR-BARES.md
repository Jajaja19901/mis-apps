# ☁️ Guía: montar el servidor de comandas para los bares (modo nube)

Con esto, la comanda que un cliente envía desde **su móvil** aparece **sola** en la
**pantalla de barra** del bar (`#/barra`), en tiempo real y con aviso sonoro.
Sin WhatsApp de por medio. Es lo que justifica la cuota mensual.

La app (`restaurante-qr-ejemplo.html`) ya trae el modo nube integrado: solo hay
que **crear la base de datos (gratis) y rellenar 3 datos** en el archivo.

---

## Paso 1 — Crear la base de datos (una sola vez, vale para TODOS tus bares)

1. Entra en **supabase.com** → crea cuenta gratis → **New project** (elige región EU).
2. Cuando cargue, ve a **SQL Editor** → pega esto → **Run**:

```sql
create table comandas (
  id bigint generated always as identity primary key,
  bar_id text not null,
  mesa text, camarero text, dia text, hora text,
  items jsonb, total numeric,
  estado text default 'pendiente',
  created_at timestamptz default now()
);
alter table comandas enable row level security;
create policy "acceso comandas" on comandas for all using (true) with check (true);
create index comandas_bar on comandas (bar_id, estado);

create table cartas (
  bar_id text primary key,
  platos jsonb,
  updated_at timestamptz default now()
);
alter table cartas enable row level security;
create policy "acceso cartas" on cartas for all using (true) with check (true);

create table mensajes (
  id bigint generated always as identity primary key,
  bar_id text not null,
  autor text, texto text, dia text, hora text,
  created_at timestamptz default now()
);
alter table mensajes enable row level security;
create policy "acceso mensajes" on mensajes for all using (true) with check (true);
create index mensajes_bar on mensajes (bar_id, id);

create table valoraciones (
  id bigint generated always as identity primary key,
  bar_id text, n int, dia text,
  created_at timestamptz default now()
);
alter table valoraciones enable row level security;
create policy "insertar valoracion" on valoraciones for insert with check (true);
create policy "leer valoracion" on valoraciones for select using (true);
```

3. Ve a **Project Settings → API** y copia dos cosas:
   - **Project URL** (ej. `https://abcd1234.supabase.co`)
   - **anon public key** (una clave larga)

---

## Paso 2 — Configurar la app de cada bar

Abre el HTML del bar y rellena en la caja `CONFIG` (arriba del todo):

```js
CLOUD_URL:"https://abcd1234.supabase.co",  // tu Project URL
CLOUD_KEY:"eyJhbGciOi...",                  // tu anon key
BAR_ID:"tasca-centro-1"                     // ÚNICO por bar (cambia en cada cliente)
```

> ⚠️ **`BAR_ID` distinto para cada bar.** Es lo que separa las comandas de un bar
> de las de otro usando la misma base de datos. Ejemplos: `bar-pepe-lugo`,
> `tasca-maria-2`.

Si los 3 campos están vacíos, la app funciona como siempre (WhatsApp). No rompe nada.

> 🍽️ **La carta también viaja por la nube:** cuando el dueño guarda un plato, cambia
> un precio o marca un "agotado" en su panel, se sube a la base de datos y **los móviles
> de los clientes la bajan solos** (al abrir la app y al entrar en la carta). Sin nube,
> la carta solo vive en cada aparato.

> 💬 **Tablón del personal:** camareros y barra tienen un chat interno (botón
> "💬 Tablón" en sus pantallas) para avisarse entre ellos sin gritar. Con nube
> llega a todos al instante; sin nube, solo se ve en ese aparato.

---

## Paso 3 — Subir la app del bar a internet

1. **app.netlify.com/drop** → arrastra el HTML del bar → te da una URL `https://...`.
2. En el panel del bar → pestaña **Mesas/QR** → pon cuántas mesas tiene el bar
   y **la app genera los QR de todas las mesas automáticamente**. Pulsa
   "Imprimir cartelitos": salen con su QR puesto, listos para recortar y pegar.
3. En la barra del local: abre `https://.../#/barra` en una **tablet o portátil**,
   mete la contraseña y déjala encendida. Las comandas entran solas y **suenan**. 🔔

---

## Cómo queda el flujo

```
Cliente escanea QR de su mesa → pide desde SU móvil → comanda a la base de datos
→ la PANTALLA DE BARRA la muestra al instante (con sonido) → "✔ Servida"
```

## Qué cobrar (modelo recomendado)
- **150 € de alta** (montaje: su carta, sus QR, su pantalla, su subdominio).
- **50 €/mes** (hosting, base de datos, soporte y cambios de carta).
- Coste para ti: Supabase gratis hasta mucho volumen; Netlify gratis. **Margen ≈ todo.**

## 🧾 Cómo convive con el TPV del bar (argumento de venta)

**La app toma comandas. El TPV del bar cobra.** No se pisan ni hace falta integrarlos:

```
Mesa con QR ──┐
              ├──→ Pantalla de barra (la app) ──→ se sirve
Camarero ─────┘                                      │
                                                     ▼
                                El bar COBRA con SU TPV de siempre
```

- El cobro, el ticket y la factura los hace **su sistema de siempre**. La app solo
  enseña el total de cada mesa para cuadrar.
- **VeriFactu / Ley Antifraude:** el software que emite tickets debe estar
  certificado en España. Como esta app **no cobra ni factura**, no le aplica.
  Frase para vender: *"no sustituye tu TPV, lo alimenta"*.
- **¿Y quien no use la app?** El camarero toma nota con el **modo camarero**
  (#/camarero, su PIN) y la comanda entra igual en barra; o esa mesa funciona a la
  vieja usanza y solo existe en el TPV. El cartelito QR debe decir:
  *"Escanea y pide — o llama al camarero, como prefieras"*.
- **Integración real con TPVs** (Glop, Ágora, Revo…): la mayoría son cerrados; los
  que tienen API exigen servidor intermedio. No compensa hasta tener decenas de
  bares. En el día a día, el camarero teclea la comanda en su TPV al cobrar (10 s)
  o cobra solo el total.

## Notas honestas
- La política de la base de datos es abierta con la anon key (suficiente para
  empezar: una comanda no lleva datos sensibles). Cuando tengas decenas de bares,
  se endurece con claves por bar (te lo monto cuando llegue el momento).
- El plan gratis de Supabase aguanta de sobra los primeros bares; si crece,
  el plan de pago son ~25 $/mes (lo cubres con UN bar).
