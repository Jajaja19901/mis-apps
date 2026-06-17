---
name: diseno-web-pro
description: >-
  Úsala al diseñar o MEJORAR EL ASPECTO VISUAL de una app/web/embudo (paleta,
  tipografía, layout, componentes, profundidad, motion) para que NO parezca
  genérica ni de plantilla de IA. Te da una dirección visual fuerte a propósito,
  el sistema de tokens CSS de la casa listo para pegar, y una checklist de
  calidad visual. Dispárala cuando el encargo mencione "que se vea pro/premium",
  "más bonito", "que no parezca de plantilla", "diseño", "estilo", "marca",
  "look", o cuando vayas a maquetar/retocar la capa visual. Complementa a los
  agentes disenador-marca, disenador-ux e ingeniero-frontend. Siempre: un solo
  HTML autocontenido, sin librerías, mobile-first.
---

# Diseño Web Pro — el playbook visual de la fábrica

Esta skill es el **cerebro de diseño** que comparten el Director y los agentes de
diseño. No reemplaza a `disenador-marca` (paleta/tipografía) ni a `disenador-ux`
(flujos/estados): les da el **CÓMO** concreto para que el resultado tenga carácter,
sea coherente y **no parezca generado por defecto**. Todo encaja con la filosofía
de la casa: un solo HTML, CSS inline, sin librerías, mobile-first, embudo de venta.

## ⛔ La regla nº1: mata el "look genérico de IA"
El enemigo es la web que sale "por defecto". Si ves cualquiera de estas, **rehazla**:

- Tipografía **Inter/Roboto/Arial** en TODO sin una fuente con carácter en los titulares.
- **Degradado morado/azul** sobre blanco como recurso estrella.
- Tarjetas blancas con **esquinas muy redondeadas** y **sombra gris difusa** repetida en toda la página.
- Emojis sueltos haciendo de iconos en secciones serias.
- Hero centrado genérico + 3 tarjetas + CTA azul, sin ninguna decisión propia.
- Espaciados a ojo, sin escala; todo "apretado" o todo "flotando".

**El antídoto:** elige UNA dirección visual a propósito (abajo) y ejecútala con
disciplina. Una decisión fuerte y coherente > diez decisiones tibias.

## 1) Plano antes que píxel (spec-first)
Antes de maquetar (o de retocar), escribe un **bloque DESIGN** corto —es el puente
entre el plano del Arquitecto y el código del Frontend:

```
DIRECCIÓN: <una de las del catálogo, en 1 frase + por qué encaja con el sector>
PALETA:    --brand, --bg, --ink... (HEX exactos + ratio de contraste AA verificado)
TIPOS:     display=<fuente con carácter> · cuerpo=<sans limpia> (con su <link> Google Fonts)
ESCALA:    espaciado 4/8/12/16/24/32/48/64 · radius · sombras (en capas, no gris difuso)
MOTION:    transiciones 150–400ms solo transform/opacity · respeta reduced-motion
PIEZAS:    botones (primario/fantasma), card, hero, sección, formulario, header sticky
```

Si retocas una app ya hecha, **deduce su bloque DESIGN** primero y respétalo (no mezcles
dos direcciones en la misma web).

## 2) Elige UNA dirección visual (no improvises)
Hay un catálogo con recetas concretas (fuentes reales de Google Fonts, lógica de color,
superficies, motion y "cómo saber si lo clavaste") en:

→ **`referencias/direcciones-visuales.md`** — ábrelo y elige la que case con el sector y la vibra del briefing.

Resumen de las que hay: *Editorial cálido · Minimal premium · Brutalista moderno ·
Retro-futurista · Artesanal/orgánico · Tech confiable · Lujo oscuro · Fresco y vivo.*
Elige **una** y comprométete con ella en toda la app.

## 3) Usa el sistema de tokens de la casa
Para que TODAS las apps salgan coherentes, el diseño se expresa SIEMPRE con este
vocabulario de variables CSS (mismos nombres que usa `apps/peluqueria-aurora.html`):

```css
:root{
  /* superficies y texto */
  --bg; --card; --ink; --ink-soft; --ink-mut; --line;
  /* marca (del briefing; nunca inventada ni copiada de otra app) */
  --brand; --brand-deep; --brand-soft;
  /* feedback */ --ok; --err;
  /* tipos */ --display; --sans;
  /* sistema */ --shadow; --radius;
}
```

Las **recetas completas, listas para pegar** (reset, escala de tipos con `clamp()`,
botones, card, hero, secciones, formulario con sus estados, header sticky con blur,
FAB, toast, motion + reduced-motion, breakpoints y el `<link>` de fuentes) están en:

→ **`referencias/recetas-css.md`** — son un *starter* con valores PLACEHOLDER. Cambia los
HEX y las fuentes por los del briefing; **nunca pegues los valores de marca de otra app**.

## 4) Tipografía con carácter
- El **carácter lo pone la fuente de titulares** (display). El cuerpo, una sans limpia y muy legible.
- `disenador-marca` desaconseja **Inter/Roboto/Arial** como recurso por defecto. Si el cuerpo va
  a ser una neutra, que sea una decisión consciente y **siempre emparejada con un display con
  personalidad** (como hace `peluqueria-aurora`: *Fraunces* display + *Inter* cuerpo).
- Escala fluida con `clamp()` (mobile-first), 1.1 de interlineado en titulares, `letter-spacing`
  negativo leve en display grande. Máx. 2 familias.

## 5) Color con intención
- Regla 60/30/10: 60% neutro de fondo, 30% superficies/texto, 10% acento de marca.
- **UN** color de marca protagonista (+ su versión profunda para hover y una suave para fondos).
- **Contraste AA obligatorio**: calcula el ratio real (≥4.5:1 texto, ≥3:1 grande/UI). Si no llega,
  ajusta el HEX. No entregues un par que el Agente 9 vaya a tener que rehacer.
- Una **sección oscura** (ej. el bloque de formulario) da contraste y hace que el embudo respire.

## 6) Profundidad, espacio y ritmo
- Escala de espaciado fija (4/8/12/16/24/32/48/64). Nada "a ojo".
- **Aire generoso**: secciones con `padding` amplio; el lujo se percibe en el espacio en blanco.
- `--radius` coherente en toda la app (no mezcles 8px y 24px sin criterio).
- Sombras **en capas** (`0 1px 2px ... , 0 8px 30px ...` con el tinte de la marca), nunca una sombra
  gris plana repetida por todo.

## 7) Motion con criterio
- Solo `transform`/`opacity`, 150–400ms, curvas suaves. Microinteracción al pulsar (`:active{scale(.97)}`).
- Entradas sutiles al hacer scroll (opcional, con `IntersectionObserver`), nunca animaciones que mareen.
- **Respeta `prefers-reduced-motion`** SIEMPRE (hay media query en las recetas).

## ✅ Checklist de calidad visual (puerta antes de pasar a los revisores)
- [ ] Hay UNA dirección visual clara y coherente (no el look "por defecto").
- [ ] Display con carácter + cuerpo legible. Sin Inter/Roboto en todo sin justificar.
- [ ] Tokens `:root` completos; cero HEX sueltos repetidos por el CSS.
- [ ] Contraste AA verificado en cada par texto/fondo y en botones.
- [ ] Escala de espaciado y `--radius` consistentes en toda la app.
- [ ] Áreas táctiles ≥44px; nada depende de `hover` para funcionar.
- [ ] `:focus-visible` claro en enlaces, botones e inputs.
- [ ] Estados con estilo: **vacío, carga, error y éxito** (no solo el "feliz").
- [ ] Motion con `prefers-reduced-motion` respetado.
- [ ] Responsive en 2 cortes (≈820px y ≈560px) sin desbordes ni texto cortado.
- [ ] Icono/logo coherente (logo del briefing o emblema SVG; **nunca marca inventada**).
- [ ] Firma del estudio en el pie ("Diseñado por Incuba tu Negocio · por Jaime M. M.").

## Cómo encaja en el pipeline
- **`disenador-marca`** saca de aquí la lógica de paleta/tipos y devuelve los tokens con HEX reales.
- **`disenador-ux`** usa los estados y las microinteracciones definidas.
- **`ingeniero-frontend`** pega las recetas de `referencias/recetas-css.md` y las puebla con los valores del briefing.
- El **Director** puede aplicar todo esto directamente al construir o al "subir el nivel" visual de una app existente.

## 🔒 Reglas de oro (manda `CLAUDE.md`)
- **No inventes marca, nombre ni logo.** Sin briefing → placeholders neutros y avísalo.
- **Cada app es una isla**: no copies paleta, tipos, textos ni valores de marca de otra app. Estas
  recetas son un *starter* con placeholders, no la marca de nadie.
- Solo te inspiras en una referencia externa si el **prompt lo pide expresamente** (un enlace concreto).
