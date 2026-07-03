# Dónde subirlo para que todos los móviles estén conectados

## Lo primero, para que lo entiendas
La app tiene **dos piezas**:

1. **La app** (lo que se ve y se instala en el móvil). Son archivos.
2. **El servidor** (`mh-collective-servidor.mjs`): es un **programa que corre sin
   parar** y es el que **conecta los móviles** y **guarda todo** para que cada
   cambio (dar acceso, cobrar, vender…) le llegue a todos los teléfonos al instante.

## ⚠️ Netlify NO vale
Netlify solo aloja archivos estáticos: **no ejecuta el servidor**. Si subes solo a
Netlify, la app se instala pero **cada móvil va por su cuenta, sin conectarse**.
Para lo que quieres (todos conectados, todo sincronizado) **hay que usar un sitio
que ejecute el servidor**.

## ✅ Usa Render (gratis, con HTTPS). Sirve la app Y el servidor a la vez
Con Render **no hace falta Netlify ni nada más**: en un solo sitio queda todo.

### Los archivos (ya están todos en tu repositorio de GitHub, carpeta `apps/`)
1. `mh-collective-fiesta.html` — la app
2. `mh-collective-servidor.mjs` — el servidor (lo que conecta los móviles)
3. `manifest.json` — datos de la app instalable
4. `sw.js` — para instalar y que funcione sin datos
5. `icon-192.png` y `icon-512.png` — **tus dos iconos** (los añades tú a `apps/`)
6. `render.yaml` (en la raíz del repo) — la configuración de Render

### Pasos (una sola vez, ~5 minutos)
1. Sube tus dos iconos `icon-192.png` y `icon-512.png` a la carpeta `apps/` del repo.
2. Entra en **https://render.com** y crea cuenta (puedes con tu GitHub).
3. **New +** → **Blueprint** → conecta tu repositorio **jajaja19901/mis-apps**.
4. Render lee el `render.yaml`. Te pide **MH_TOKEN**: pon una contraseña tuya
   (ej. `mifiesta2026`) y apúntatela.
5. **Deploy**. Cuando ponga **Live**, Render te da una dirección:
   `https://algo.onrender.com`

### El enlace que repartes por WhatsApp al equipo
```
https://algo.onrender.com/#t=mifiesta2026
```
(esa `mifiesta2026` es la MH_TOKEN que pusiste)

- Cada uno abre ESE enlace en su móvil.
- Arriba elige su rol: **Vigilante 1/2** o **Camarero 1/2** (cada uno con su
  contraseña, que pones en el panel → Ajustes → Personal). El **Dueño** entra con
  **PIN 1234**.
- A partir de ahí, **todo lo que hace cada uno se guarda en el servidor y aparece
  en los demás móviles al momento**. Arriba verás **"Sincronizado"** (verde).
- Para instalarla: menú del navegador → **Instalar app** / "Añadir a pantalla de
  inicio" (con tu icono).

## Resumen de una línea
**Netlify = no** (no conecta los móviles). **Render = sí** (ejecuta el servidor y
sirve la app; con eso solo, los 3, 4 o 5 móviles quedan conectados y todo se
sincroniza).

## Nota del plan gratis
En el plan gratis de Render el servidor se "duerme" tras 15 min sin uso; el primer
acceso tras dormir tarda ~30 s en despertar. Para que no duerma, hay un plan de
pago (~7 $/mes). La app funciona igual; solo es esa espera del primer acceso.
