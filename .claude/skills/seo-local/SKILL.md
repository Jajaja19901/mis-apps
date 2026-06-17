---
name: seo-local
description: >-
  Úsala para que el negocio APAREZCA EN GOOGLE en su ciudad: etiquetas <title> y
  meta description, Open Graph/Twitter para compartir, datos estructurados
  schema.org (LocalBusiness JSON-LD con NAP, horario, geo y valoraciones SOLO si son
  reales), HTML semántico (un solo h1, jerarquía, alt descriptivos), palabras clave
  locales (servicio + ciudad/barrio) y consistencia NAP. Incluye checklist de Google
  Business Profile. Dispárala con "SEO", "que aparezca/salga en Google", "posicionar",
  "buscar en [ciudad]", "metadatos", "schema", "rich results", "Open Graph",
  "compartir en redes/WhatsApp". Todo encaja en un solo HTML (head + JSON-LD) y NO
  añade cookies de tracking. Complementa al ingeniero-frontend y al de rendimiento.
---

# SEO local — que el negocio salga en Google (sin backend)

Esta skill hace que una app de la fábrica sea **encontrable** en su ciudad sin romper la filosofía:
un solo HTML, sin tracking, rápido. Todo el SEO técnico vive en el `<head>` + un bloque JSON-LD.

## Las 3 palancas del SEO local
1. **On-page** (lo que controlamos al 100% en el HTML): `<head>`, contenido semántico y **schema.org**.
2. **Consistencia NAP** (Name-Address-Phone idénticos en web, pie, schema y Google).
3. **Google Business Profile** (fuera del sitio, lo gestiona el dueño) — la palanca nº1 del local.

Esta skill clava la palanca 1, te prepara la 2 y te da el checklist de la 3.

## 1) El kit del `<head>`
Bloque completo (title, description, canonical, robots, theme-color, Open Graph y Twitter) listo
para pegar y rellenar con el briefing en:

→ **`referencias/kit-head-y-schema.md`**. Reglas clave:

- **`<title>`**: `Negocio · Servicio principal en Ciudad` (≤60 caracteres). El servicio + la ciudad
  son lo que la gente busca.
- **`meta description`**: 140–160 caracteres, real, con beneficio + CTA. No se posiciona con ella,
  pero decide el clic.
- **`<html lang="es">`**, `canonical`, `theme-color` (= tu `--brand`).
- **Open Graph + Twitter card**: para que al compartir por WhatsApp/redes salga título, texto e imagen.

## 2) Datos estructurados (schema.org) — el superpoder local
Un bloque **JSON-LD `LocalBusiness`** le dice a Google qué negocio es, dónde, cuándo abre y cómo
contactarlo → ficha rica y mejor posición local. En `referencias/kit-head-y-schema.md` hay plantillas
por sector. Reglas:

- **`@type` específico** cuando exista: `HairSalon`, `Restaurant`, `Dentist`, `HealthClub`, `Bakery`,
  `BeautySalon`, `Physiotherapy`… (si no, `LocalBusiness`). Tabla en la referencia.
- Campos: `name`, `image`, `url`, `telephone`, `address` (PostalAddress), `geo` (lat/lng),
  `openingHoursSpecification`, `priceRange`, `areaServed`, `description`, `sameAs` (redes reales).
- **`aggregateRating`/`review`: SOLO si son valoraciones REALES** del briefing. Inventar reseñas
  va contra la política de Google **y** la regla de oro (publicidad engañosa). Sin reseñas reales →
  fuera ese campo.
- Valida con el **Rich Results Test** de Google antes de dar por bueno.
- Si hay FAQ real en la página, añade `FAQPage` (plantilla en la referencia). Liga con `copys-que-venden`.

## 3) Contenido semántico
- **Un solo `<h1>`** con la propuesta de valor (puede incluir la ciudad). Luego `h2`/`h3` con jerarquía
  lógica, sin saltos.
- **`alt` descriptivos** en imágenes (qué se ve + contexto), nunca "imagen1.jpg". Ayuda a SEO y al Agente 9.
- **Texto de enlaces con sentido** ("Ver carta", no "haz clic aquí").
- Marca de tiempo/horario y dirección en texto real (no solo en una imagen).

## 4) Palabras clave locales (sin pasarte)
Teje de forma **natural** "servicio + ciudad/barrio" en el `h1`, algún `h2`, la entradilla, la FAQ y
los `alt`. Ejemplo: "peluquería en Triana", "dentista urgencias en Vallecas". **Nada de keyword
stuffing**: si suena raro al leerlo en voz alta, sobra.

## 5) Consistencia NAP
El **mismo** Nombre, Dirección y Teléfono, escritos **igual**, en: `<head>`/schema, el pie, la sección
de contacto y la ficha de Google Business. Una sola fuente de verdad → ponlos en `CONFIG` y reúsalos.

## 6) Rendimiento = SEO
Google premia la velocidad (Core Web Vitals). Liga con `ingeniero-rendimiento`: imágenes diferidas
(`loading="lazy"`), nada de librerías pesadas, carga <2s. Una web lenta no posiciona.

## 7) Google Business Profile (acción del DUEÑO, fuera del HTML)
Es lo que más mueve el ranking local; el dueño lo hace desde Google, no se programa aquí. Déjale el
checklist en la entrega:
- [ ] Reclamar/crear la ficha con el **NAP exacto** (igual que en la web).
- [ ] Categoría correcta, horario, zona de servicio.
- [ ] Fotos reales del local/trabajo. Publicaciones periódicas.
- [ ] Pedir reseñas a clientes y **responderlas** (también las malas, con educación).
- [ ] Enlazar la web (la URL donde se publique la app).

## 8) Si se publica en un dominio (opcional)
Para una sola URL, un `robots.txt` que permita todo y un `sitemap.xml` de una entrada bastan
(snippets en la referencia). En `file://` no aplica; en hosting, ayuda.

## Checklist SEO (puerta)
- [ ] `<title>` con servicio + ciudad (≤60). `meta description` real 140–160 con CTA.
- [ ] `lang`, `canonical`, `theme-color`, Open Graph y Twitter card completos.
- [ ] JSON-LD `LocalBusiness` (o `@type` específico) con NAP, horario, geo y `sameAs` reales.
- [ ] Sin `aggregateRating`/reseñas inventadas. Si las hay, son del briefing y validan en Rich Results.
- [ ] Un solo `h1`; jerarquía de encabezados correcta; `alt` descriptivos.
- [ ] Palabras clave locales naturales (sin stuffing). NAP idéntico en todos lados.
- [ ] FAQPage si hay FAQ real. Imágenes `lazy` y carga <2s.
- [ ] Checklist de Google Business entregado al dueño.

## Cómo encaja en el pipeline
- **`disenador-marca`** define el color del `theme-color`/OG; **`copywriter`** da title/description/FAQ.
- **`ingeniero-frontend`** pega el kit del `<head>` y el JSON-LD con los valores del briefing.
- **`ingeniero-rendimiento`** asegura la velocidad que el SEO exige.
- El **QA** valida el schema (Rich Results) y la consistencia NAP.

## 🔒 Reglas de oro (manda `CLAUDE.md`)
- **No inventes NAP, valoraciones ni datos.** Todo sale del briefing; sin dato → placeholder y avísalo.
- **Cada app es una isla**: no copies metadatos, schema ni keywords de otra app.
- **Sin cookies de tracking**: el SEO de aquí no añade analítica de terceros (respeta el "sin RGPD").
