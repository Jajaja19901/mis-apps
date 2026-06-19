# Auditoría de Accesibilidad WCAG 2.1 AA — mis-datos.html
**Ingeniero de accesibilidad · Agente 9 · 2026-06-19**
**Modo: SOLO INFORMAR — sin ediciones al archivo**

---

## Resultado global
**Nivel estimado: WCAG 2.1 AA parcial.**
La base es sólida (lang, focus-visible global, aria-hidden en decorativos, nav con aria-label, aria-current, reduced-motion, toggles con checkbox real oculto). Sin embargo hay 4 fallos que bloquean AA y varios MEDIOS que degradan la experiencia con teclado y lector de pantalla.

---

## ALTO — Fallos que bloquean WCAG AA

### A1 · Modal sin `aria-labelledby` ni foco atrapado correctamente
**Línea 631**
```
root.innerHTML=`...<div class="modal" role="dialog" aria-modal="true">${html}</div>...`
```
El modal tiene `role="dialog"` y `aria-modal="true"` pero **no tiene `aria-labelledby`** apuntando al `<h3>` interno. El lector de pantalla anuncia un diálogo sin nombre. Además, la función de foco solo mueve al primer `input|button|textarea` (línea 635) pero **no atrapa el foco**: Tab puede salir del modal al contenido de fondo, lo que viola WCAG 2.1 SC 2.1.2 (Sin trampa de teclado) en su variante modal.

**Fix:** añadir un `id` único al `<h3>` del modal y `aria-labelledby` en el `<div class="modal">`. Implementar un listener de teclado que, cuando el foco esté en el último elemento focusable del modal, lo reenvíe al primero (y viceversa con Shift+Tab desde el primero).

---

### A2 · Textos `--ink-muted` en tamaño pequeño (incumple 4.5:1)
La marca documenta que `--ink-muted` (#6B8A9E) sobre `--surface` (#FFFFFF) obtiene 3.87:1 y **solo es válido a ≥18px o ≥14px bold**. El CSS aplica ese token en múltiples contextos de texto pequeño:

| Línea | Selector / uso | Tamaño real | Ratio | Resultado |
|---|---|---|---|---|
| 90 | `.nav-item` (etiquetas de nav) | 10px | 3.87:1 | FALLA texto normal |
| 198 | `.toggle-state` (OFF label) | 10px | 3.87:1 | FALLA texto normal |
| 224 | `.breakdown-state` | 10px | 3.87:1 | FALLA texto normal |
| 243 | `.transparency-row-date` | 12px (--t-xs) | 3.87:1 | FALLA texto normal |
| 256 | `.survey-meta` | 12px (--t-xs) | 3.87:1 | FALLA texto normal |
| 314 | `.footer-contact` | 12px (--t-xs) | 3.87:1 | FALLA texto normal |
| 779 | texto inline consentimiento | 12px (--t-xs) | 3.87:1 | FALLA texto normal |

El más crítico es la línea 90 (nav-items) y la 198 (estado OFF del toggle de consentimiento), que son elementos informativos y de control, no metadata decorativa.

**Fix:** sustituir `--ink-muted` por `--ink-soft` (#3D5E78, ratio 6.02:1) en todos los contextos <18px informativos. En el footer y disclaimers estrictamente decorativos se puede conservar si el texto supera 18px, lo cual no es el caso aquí.

---

### A3 · Contraste insuficiente en el hero: textos semitransparentes sobre degradado
**Líneas 147, 153**
El fondo del hero es `linear-gradient(160deg, #0F4F85 → #1A6FB5 → #1a5fa0)`. Sobre ese fondo:
- `.hero-eyebrow`: `rgba(255,255,255,0.7)` = blanco al 70% → color efectivo ≈ #B2C9E0 sobre azul oscuro. Ratio resultante estimado ~2.8:1. **FALLA** (necesita 4.5:1 siendo 12px/--t-xs).
- `.hero-free-note`: ídem `rgba(255,255,255,0.7)` a 12px. **FALLA.**

**Fix:** elevar ambos a `rgba(255,255,255,0.95)` o `#fff` directamente. El diseño visual no se compromete y se alcanza la transparencia que quería la marca.

---

### A4 · El grupo de radio buttons de encuestas carece de `fieldset`/`legend`
**Línea 1059**
```js
${s.opts.map((o,i)=>`<label class="survey-opt"><input type="radio" name="${esc(s.id)}" value="${i}" required> ${esc(o)}</label>`).join("")}
```
Los radio buttons comparten `name` pero no están dentro de un `<fieldset>` con `<legend>` que identifique la pregunta a la que responden. Los lectores de pantalla leen cada opción sin contexto de a qué pregunta pertenecen (la pregunta está en un `<p>` anterior sin asociación semántica).

**Fix:** envolver los radio buttons en `<fieldset><legend>${esc(s.q)}</legend>…</fieldset>`. Ocultar visualmente la `<legend>` si el diseño ya muestra la `<p>`, usando `.sr-only` (clip-path).

---

## MEDIO — Degradan experiencia, no bloquean AA estrictamente

### M1 · Toggles de consentimiento: el estado "OFF" solo se comunica con texto y color, sin `aria-checked`
**Líneas 740–743**
El toggle usa `<input type="checkbox">` real (bien), y el estado visual se comunica en un `<span class="toggle-state">` externo con "ACTIVO"/"OFF". Sin embargo, el checkbox ya expone el estado `checked/unchecked` a tecnologías asistivas, así que el fallo es menor que si fuera un `div`. El problema real es que el `aria-label="Compartir X"` no cambia dinámicamente al cambiar el estado; el AT lee "Compartir Perfil sociodemográfico" sin saber si está marcado o no hasta que el propio `checked` se propaga. En la práctica los checkbox nativos sí lo comunican, pero sería conveniente añadir `aria-describedby` apuntando al `span.toggle-state` para reforzar la lectura del estado textual.

**Fix (bajo riesgo):** en el binder (línea 798–799), tras cambiar `state.textContent`, también actualizar `inp.setAttribute("aria-label", `${inp.checked?"Desactivar":"Activar"} ${cat.name}`)`.

---

### M2 · `<header>` renderizado como `<span>` sin landmark `<main>`
**Líneas 586, 325**
El componente `header()` emite `<header class="app-header">` (correcto, landmark implícito `banner`). Pero el contenido principal se vuelca en `<div id="app">` sin `<main>`. Las páginas tienen `<header>`, `<nav>`, `<footer>`, pero no `<main>`, lo que impide a usuarios de lector de pantalla saltar directamente al contenido mediante el landmark de navegación rápida.

**Fix:** cambiar el `<div class="view">` exterior de cada vista por `<main class="view">` o añadir `role="main"` al div `#app` (preferible wrapping en `<main>` por vista para que cambie con el router).

---

### M3 · Jerarquía de encabezados irregular en vistas dinámicas
Varias vistas tienen conflictos de jerarquía:

- **Vista home (líneas 649–694):** el `<h1>` de la hero existe (bien), pero las secciones usan `<h2>` y los sub-ítems usan `<h3>` y `<h4>` sin `<h2>` padre en algunos casos (ej. "Cuánto ganarás, sin adornos" en línea 673 es un `<h3>` sin `<h2>` anterior en el bloque `.honesty-block`). Salta de h1→h3.
- **Vista consentimiento (línea 759):** el título de sección está codificado como un `<h2>` con `style="font-size:var(--t-h3)"` — técnicamente correcto a nivel semántico, bien.
- **Vista perfil (línea 880):** el nombre de usuario se muestra en un `<div>` con `font-size:var(--t-h3)` pero no en un `<hX>`, cuando debería ser al menos un `<h1>` visible de la vista (ya que el `<header>` de la vista tiene "Mi perfil" en un `<span>`, no en un heading).
- **Vista derechos (línea 1155):** `<h2>Tus derechos sobre tus datos</h2>` dentro del `<div class="rights-banner">` sin `<h1>` previo en esa vista. La vista no tiene h1.
- **Vista dashboard y transparencia:** tampoco tienen `<h1>`.

**Fix:** asegurar que cada vista SPA expone exactamente un `<h1>` como primer heading (puede ser el título de la vista en el header, cambiando el `<span class="app-name">` por `<h1>`). Luego h2→h3 en cascada.

---

### M4 · El `#flash` toast tiene `role="status"` y `aria-live="polite"` pero el `#app` también tiene `aria-live="polite"`
**Líneas 325, 327**
Tener dos regiones `aria-live="polite"` activas simultáneamente puede causar que los lectores de pantalla anuncien ambas al mismo tiempo cuando se actualiza la vista. El `aria-live` en `#app` hace que cada cambio de ruta (todo el innerHTML de la vista) se anuncie, lo que en la práctica genera verbosidad masiva para los usuarios de AT.

**Fix:** eliminar `aria-live="polite"` del `#app`. Gestionar los anuncios de cambio de vista con un `aria-live="polite"` en un nodo separado y oculto donde se escriba únicamente el título de la vista nueva (ej. `<span class="sr-only" aria-live="polite" id="route-announcer"></span>`). El flash en `#flash` con `role="status"` es suficiente para ese componente.

---

### M5 · Campo `field-input` con `outline:none` — el foco se delega a border+box-shadow
**Línea 122**
```css
.field-input{…outline:none}
```
El foco se muestra vía `border-color + box-shadow` (línea 123), que es válido visualmente, pero se activa con `:focus` (no `:focus-visible`). Esto significa que en navegadores que distinguen `:focus` de `:focus-visible`, los usuarios de ratón verán el anillo de foco al hacer click, algo generalmente no deseable pero que no viola WCAG. El riesgo mayor es que si el `box-shadow` no fuera visible, el `:focus-visible` global de la línea 53 ya no puede rescatarlo porque el `outline:none` lo suprime. En el estado actual el box-shadow del brand es visible (3px, buen contraste), así que es MEDIO.

**Fix:** cambiar `outline:none` por `outline:0` y usar `:focus-visible` en lugar de `:focus` para el estilo del campo, preservando el global `:focus-visible` como fallback.

---

### M6 · Foco al cerrar modal no vuelve al elemento disparador
**Líneas 629–638**
`closeModal()` simplemente limpia el `innerHTML` del `modal-root` sin devolver el foco al botón que abrió el modal. WCAG 2.1 SC 2.4.3 (Orden del foco) exige que al cerrar un modal el foco vuelva a un lugar lógico (generalmente el botón que lo abrió).

**Fix:** antes de abrir el modal, guardar `const trigger = document.activeElement`. Al cerrar, llamar `trigger?.focus()`.

---

### M7 · Botón "Usar gratis sin ceder datos" en hero tiene contraste de borde insuficiente
**Línea 654**
```html
<button class="btn btn-ghost" style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.4)">
```
El borde es `rgba(255,255,255,0.4)` sobre el degradado azul. El borde semitransparente no tiene contraste 3:1 contra el fondo — aunque el texto blanco sí lo tiene, el componente UI (borde del botón) no alcanza 3:1 para componentes de interfaz. Es un fallo WCAG 1.4.11 (Contraste en componentes no textuales).

**Fix:** subir a `border-color:rgba(255,255,255,0.75)` o `border-color:#fff`.

---

## BAJO — Mejoras recomendadas, no obligatorias AA

### B1 · `<details>/<summary>` del FAQ sin `aria-expanded` explícito
**Línea 696**
El elemento nativo `<details>` expone el estado de expansión mediante el atributo `open`, que los AT modernos interpretan. Sin embargo, algunos AT (especialmente en móvil con WebKit) no anuncian el cambio de estado. Es bajo riesgo por ser elemento nativo pero vale añadir un `id` a cada `<summary>` y el header `Preguntas frecuentes` como `<h2>` padre.

---

### B2 · Texto de eyebrow del hero en uppercase CSS — posible lectura letra por letra en algunos AT
**Línea 147**
`text-transform:uppercase` sobre "Tus datos. Tu dinero. Tus reglas." Algunos lectores de pantalla leen texto en mayúsculas letra a letra. Como está en CSS y no en el HTML, los AT modernos lo ignoran, pero es buena práctica dejar el texto en el DOM en minúsculas y aplicar `text-transform:uppercase` solo cuando el texto original sea una sola palabra/sigla.

---

### B3 · Spinner de carga sin texto alternativo
**Línea 138–139**
`.loading-spinner` es un `<div>` vacío con animación CSS. Si se muestra a un usuario de AT, no hay anuncio de "cargando". Añadir `role="status"` con un `<span class="sr-only">Cargando…</span>` dentro.

---

### B4 · `<details>` del FAQ no tiene un `<h2>` padre que los agrupe semánticamente
**Línea 694**
El `<h2 class="section-title">Preguntas que merece la pena hacerse</h2>` (línea 694) sí existe como padre visual, lo que está bien. Solo confirmar que en el DOM renderizado ese h2 precede los `<details>` como hermano anterior.

---

## Resumen de contraste verificado (implementación)

| Par | Contexto | Ratio | Estado |
|---|---|---|---|
| #fff sobre #1A6FB5 (--brand) | Botón primario | 5.11:1 | AA |
| #fff sobre #0F4F85 (--brand-dark) | Hover botón primario | 8.24:1 | AAA |
| #fff sobre #1A7A45 (--ok) | Badge éxito, balance card | 4.90:1 | AA |
| #fff sobre #C0392B (--alerta) | Badge error | 5.09:1 | AA |
| #fff sobre #9E4900 (--acento-dark) | CTA naranja | 5.60:1 | AA |
| #0F2233 sobre #F4F7FA | Body principal | 16.8:1 | AAA |
| #3D5E78 sobre #F4F7FA | Labels, subtítulos | 5.73:1 | AA |
| **#6B8A9E sobre #FFFFFF** | **Nav labels, toggle-state, fechas** | **3.87:1** | **FALLA <18px** |
| #0F2233 sobre #FFFFFF | Texto en cards | 17.7:1 | AAA |
| **#fff al 70% sobre gradiente ~#1A6FB5** | **Hero eyebrow, free-note** | **~2.8:1** | **FALLA** |
| rgba(255,255,255,0.4) border sobre gradiente | Borde botón fantasma hero | <3:1 | FALLA componente UI |

---

## Checklist teclado (análisis estático)

| Elemento | Teclado OK | Notas |
|---|---|---|
| Botones de navegación | Sí | `<button>` o `<a>` nativos |
| Toggles de consentimiento | Sí | `<input type="checkbox">` real bajo la pista visual |
| Checkboxes legales | Sí | `<input type="checkbox">` con `<label for>` |
| Formulario perfil | Sí | Inputs y submit nativos |
| Radio buttons encuestas | Sí | Nativos, pero sin fieldset/legend |
| Botones de derechos | Sí | `<button>` nativos |
| Modales | PARCIAL | Foco entra pero no queda atrapado; no vuelve al trigger al cerrar |
| Bottom nav | Sí | `<a>` nativos con min-height 48px |
| `<details>` FAQ | Sí | Elemento nativo |
| Botón "Instalar app" | Sí | `<button>` nativo |

---

## Los 3 arreglos prioritarios (para la entrega)

1. **Modal accesible completo** (A1 + M6): añadir `aria-labelledby`, atrapar el foco dentro del modal con Tab/Shift+Tab, y restaurar el foco al elemento disparador al cerrar.
2. **Sustituir `--ink-muted` por `--ink-soft` en textos informativos <18px** (A2): afecta nav labels, toggle-state OFF, fechas, metadata de encuestas. Impacta directamente la legibilidad y el criterio 1.4.3.
3. **Elevar opacidad de textos semitransparentes en el hero a ≥0.90** (A3): hero-eyebrow y hero-free-note pasan de ~2.8:1 a ≥4.5:1 con un cambio de una línea CSS.
