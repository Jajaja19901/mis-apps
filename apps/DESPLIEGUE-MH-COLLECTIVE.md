# Subir MH Collective a internet (para conectar todos los móviles)

Como cada uno va con sus datos (no hay WiFi común), la app tiene que estar **en
internet con HTTPS**, en un servidor que ejecute Node. Aquí van los pasos con
**Render** (gratis para empezar, HTTPS automático). Con esto, el móvil del
administrador, los de los vigilantes y los de los camareros ven **lo mismo en
tiempo real**.

## Qué archivos hacen falta (en la carpeta `apps/`)
- `mh-collective-fiesta.html` — la app.
- `mh-collective-servidor.mjs` — el servidor que conecta los móviles.
- `manifest.json` — datos de la app instalable (ya hecho).
- `sw.js` — el service worker, para instalar y funcionar sin datos (ya hecho).
- `icon-192.png` y `icon-512.png` — **tus dos iconos**. ← ESTOS LOS PONES TÚ.
- `render.yaml` (en la raíz) — la configuración del hosting (ya preparada).

**Lo único que tienes que añadir tú:** tus dos iconos como
`apps/icon-192.png` y `apps/icon-512.png` (los que hiciste, 192×192 y 512×512).
Súbelos a esa carpeta del repositorio (o al hosting) y ya está. El servidor no
tiene dependencias, no hay que instalar nada más.

## Pasos (Render) — unos 5 minutos
1. Entra en **https://render.com** y crea una cuenta (puedes usar el login de GitHub).
2. Arriba: **New +** → **Blueprint**.
3. Conecta tu repositorio de GitHub **jajaja19901/mis-apps** y elige la rama
   `claude/party-access-finance-app-pybmqt` (o la rama donde esté ya fusionado).
4. Render detecta el `render.yaml`. Te pedirá el valor de **MH_TOKEN**:
   pon una contraseña de servidor que tú elijas (ej. `mifiesta2026`). Apúntatela.
5. Pulsa **Apply / Deploy** y espera a que ponga **Live** (1-2 min).
6. Render te da una dirección tipo **`https://mh-collective.onrender.com`**.

## El enlace que compartes con el personal
El enlace lleva la contraseña del servidor en el `#t=`:

```
https://mh-collective.onrender.com/#t=mifiesta2026
```

Manda **ese enlace** por WhatsApp a tu equipo. Al abrirlo:
- La app guarda la contraseña sola y la borra de la barra de direcciones (no queda a la vista).
- Quien abra la dirección **sin** el `#t=...` **no** entra a los datos (solo ve una demo suya).

## Cómo entra cada uno
Todos abren el **mismo enlace** y eligen su rol arriba:
- **Vigilante 1 / Vigilante 2…** → cada uno con **su contraseña** (la pones tú en
  Ajustes → Personal). Va a la pantalla de puerta.
- **Camarero 1 / Camarero 2…** → cada uno con **su contraseña**. Va a la barra.
- **Dueño** → **PIN 1234** (cámbialo en el código, constante `ADMIN_PASSWORD`).

Todo lo que hace cada uno (dar acceso, cobrar, vender, repartir entradas…) se
sube al servidor y aparece al instante en los demás móviles. Arriba a la derecha
verás **"Sincronizado"** (verde). Si pone **"Sin conexión · N sin subir"**, es que
ese móvil no llega al servidor (o abrió sin el enlace-token); no se pierde nada,
se sube en cuanto vuelve la conexión.

## Instalar como app en el móvil
Con la app abierta desde la dirección `https://…`:
- **Android (Chrome):** menú ⋮ → **Instalar aplicación** / "Añadir a pantalla de inicio".
- **iPhone (Safari):** botón compartir → **Añadir a pantalla de inicio**.

## El icono / logo
Pon tus dos iconos como **`apps/icon-192.png`** y **`apps/icon-512.png`** (los que
hiciste). La app y el manifest ya apuntan a ellos, así que al instalar saldrá tu
logo. (Alternativa, si no quieres tocar archivos: entra al panel (Dueño, PIN 1234)
→ **Ajustes → Subir logo** y elige tu imagen; también pasa a ser el icono.)

## Notas
- **Plan gratis de Render:** el servidor se "duerme" tras 15 min sin uso; el
  primer acceso tras dormir tarda ~30 s en despertar. Para que no se duerma,
  Render tiene un plan de pago (~7 $/mes). La app funciona igual; solo es esa
  espera del primer acceso.
- **Otro hosting:** sirve cualquiera que ejecute Node (Railway, Fly.io…). El
  comando de arranque es siempre `node apps/mh-collective-servidor.mjs` y hay que
  poner `MH_HOST=0.0.0.0` y `MH_TOKEN=tu-contraseña`.
