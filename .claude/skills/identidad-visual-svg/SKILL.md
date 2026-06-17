---
name: identidad-visual-svg
description: >-
  Úsala cuando el briefing NO trae logo y necesitas una marca visual limpia en SVG
  inline: logotipo (wordmark con el nombre), monograma de iniciales o emblema
  geométrico del sector, además de favicon e icono PWA. Dispárala con "logo",
  "logotipo", "emblema", "isotipo", "favicon", "icono", "marca visual", "no tiene
  logo", "hazle un logo". Genera SVG vectorial (sin librerías, sin imágenes raster),
  tematizable con var(--brand)/currentColor, legible a 16px y en grande. REGLA DE
  ORO: nunca inventes el NOMBRE ni la marca del negocio —solo representas el
  nombre/iniciales del briefing o un placeholder neutro— ni copies el logo de otra
  app. El dueño puede subir su logo real desde el panel y reemplazarlo. Complementa
  a disenador-marca y diseno-web-pro.
---

# Identidad visual en SVG — un logo honesto cuando no hay logo

Muchos clientes locales no tienen logo. Esta skill genera una **marca visual limpia en SVG inline**
(logo, favicon, icono PWA) sin romper la filosofía: un solo HTML, sin librerías, vectorial, tematizable.

## ⛔ La regla nº1 (de oro): representas, NO inventas
- Usa el **`BUSINESS_NAME` del briefing**. Sin nombre → placeholder neutro `"Tu Negocio"` y **avísalo**.
- **Nunca fabriques un nombre, lema o marca**, ni copies el logo/emblema de otra app. Cada app es una isla.
- Lo que haces es **dar forma** al nombre que ya existe, o poner una marca **neutra** mientras el dueño sube el suyo.

## Tres enfoques seguros (elige uno, o wordmark + emblema)
Recetas SVG listas para pegar en → **`referencias/recetas-svg.md`**.

**1. Wordmark (lo más honesto).** El **nombre** puesto en la fuente *display* de la marca, con UN
detalle propio (un punto de color, una línea, espaciado cuidado). Ideal cuando solo tienes el nombre.

**2. Monograma.** Las **iniciales** del nombre dentro de una forma simple (círculo, escudo, cuadrado
redondeado). Perfecto para favicon e icono PWA, donde el wordmark no se leería.

**3. Emblema de sector.** Una marca **geométrica o de línea** que evoca el sector (tijeras, taza,
diente, mancuerna, hoja, llave inglesa…) **sin pretender ser "el logo oficial"**. Acompaña al wordmark;
no afirma una identidad inventada.

## Reglas técnicas del SVG
- **`viewBox`** siempre; nada de tamaños fijos. Escalable de 16px a pantalla completa.
- **Una sola tinta** con `currentColor` o `var(--brand)` → hereda el color de la marca y del tema.
- **Trazo limpio**, sin degradados innecesarios; legible en pequeño (sin texto diminuto en el emblema).
- **Accesible**: `role="img"` + `<title>` descriptivo (lo lee el lector de pantalla; liga con el Agente 9).
- Coherente con la **dirección visual** elegida en `diseno-web-pro` (un emblema brutalista ≠ uno orgánico).

## Favicon + PWA (instalable)
El **logo = el favicon = el icono de la app** (liga con `diseno-web-pro` §15 y la filosofía PWA):
- **Favicon SVG inline** (`<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,…">`).
- **`apple-touch-icon`** (Apple no usa SVG → PNG; se puede generar con `<canvas>`, patrón en la referencia).
- **Icono del manifest** embebido. Monograma sobre fondo de marca funciona genial a tamaño icono.

## El dueño sube su logo (CLAUDE.md)
Deja preparado el **override**: input de archivo en el panel `#/admin` → guarda el dataURL en
`localStorage` → si existe, **sustituye** el SVG en header, favicon y manifest. Hook JS en la referencia.
Así no necesitas la foto del cliente para entregar: arrancas con el SVG y el dueño lo reemplaza en 1 clic.

## Checklist de identidad (puerta)
- [ ] El logo usa el **nombre real del briefing** (o placeholder neutro avisado). **Nada inventado ni copiado**.
- [ ] SVG con `viewBox`, una tinta (`currentColor`/`var(--brand)`), legible a 16px.
- [ ] `role="img"` + `<title>` para accesibilidad.
- [ ] Favicon SVG + `apple-touch-icon` + icono del manifest coherentes con el logo.
- [ ] Override del dueño cableado (sube su logo desde `#/admin` y reemplaza el SVG).
- [ ] Estética coherente con la dirección visual elegida en `diseno-web-pro`.

## Cómo encaja en el pipeline
- **`disenador-marca`** decide enfoque (wordmark/monograma/emblema) y color, según la dirección visual.
- **`ingeniero-frontend`** coloca el SVG en header, favicon y manifest.
- **`ingeniero-datos`** cablea el override del logo del dueño desde el panel.
- El **QA** verifica que el logo **no inventa marca** y que el override funciona.

## 🔒 Reglas de oro (manda `CLAUDE.md`)
- **Nunca inventes el nombre o la marca del negocio.** Sin nombre → placeholder neutro + aviso.
- **Cada app es una isla**: no reutilices el logo/emblema/iniciales de otra app.
- Solo te inspiras en una referencia externa si el **prompt lo pide expresamente** (un enlace concreto).
