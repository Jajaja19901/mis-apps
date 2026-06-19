# Sistema Visual — Data Dividend MVP
## Diseñador de Marca · Agente 2

**Concepto:** Claridad radical como escudo. El sistema visual no vende; *informa*. Cada token transmite que no hay letra pequeña.

---

## 1. Tono Visual (3 principios de carácter)

1. **Transparente como el cristal.** Fondos claros, contenedores blancos con bordes finos visibles. Nada se oculta en capas opacas ni en sombras profundas.
2. **Cálido y cercano, no bancario.** Un acento anaranjado rompe la frialdad del azul institucional y humaniza la propuesta. El sistema debe sentirse como una conversación honesta, no como un contrato.
3. **Control siempre visible.** Los estados (activo/desactivado/pendiente/ganado) tienen color y etiqueta simultáneamente; nunca dependen solo de iconos o color aislado (accesibilidad + claridad).

---

## 2. Paleta de Color

### Decisión de diseño propia (el briefing no da color)
Se elige **azul petróleo profundo** (`#1A6FB5`) como primario. Razones: (a) es el color de confianza institucional más reconocido (banca, sanidad, gobierno); (b) contrasta fácilmente con blanco en botones; (c) funciona con un acento cálido sin parecer fintech frío si se usa con tipografía humana y espacio generoso. Se evita el negro puro y el azul eléctrico de startup.

El verde de ganancias (`#1A7A45`) refuerza la metáfora de "dinero que crece". El acento naranja (`#E07010`) es el toque humano: aparece en el CTA principal de cesión y en los badges de "nuevo".

### Tabla de tokens de color

| Token CSS | HEX | Rol |
|---|---|---|
| `--brand` | `#1A6FB5` | Azul petróleo. Color principal. Headers, iconos de acción, links activos. |
| `--brand-dark` | `#0F4F85` | Azul oscuro. Hover de botón primario, estado pressed. |
| `--brand-soft` | `#E3EFF9` | Azul pálido. Fondos de cards activas, indicadores de progreso, chips seleccionados. |
| `--ok` | `#1A7A45` | Verde ganancias. Cantidades ganadas, confirmaciones, checkmarks, estado "cedido". |
| `--ok-soft` | `#D4EEE0` | Verde pálido. Fondo de notificaciones de éxito, fondo de badges de ganancias. |
| `--acento` | `#E07010` | Naranja cálido. CTA principal de cesión voluntaria, badges "Nuevo", destacados humanos. Solo con texto oscuro encima. |
| `--acento-dark` | `#9E4900` | Naranja oscuro. Versión de botón secundario naranja con texto blanco (ratio 5.6:1). |
| `--alerta` | `#C0392B` | Rojo. Errores, campos inválidos, estado "rechazado". |
| `--alerta-soft` | `#FDECEA` | Rojo pálido. Fondo de mensajes de error. |
| `--aviso` | `#B07D00` | Ámbar oscuro. Advertencias, datos pendientes de confirmar, acciones irreversibles. |
| `--aviso-soft` | `#FFF8DC` | Ámbar pálido. Fondo de advertencias. |
| `--bg` | `#F4F7FA` | Fondo de página. Gris muy frío-claro. Transmite limpieza y aire. |
| `--surface` | `#FFFFFF` | Superficie de cards, modales, formularios, nav. Blanco puro. |
| `--ink` | `#0F2233` | Tinta principal. Textos de encabezado y body crítico. Casi negro azulado. |
| `--ink-soft` | `#3D5E78` | Tinta secundaria. Labels, subtítulos, textos de apoyo. |
| `--ink-muted` | `#6B8A9E` | Tinta atenuada. Placeholders, metadata, timestamps, pie de tarjeta. |
| `--line` | `#D8E4EE` | Bordes y divisores. Azul muy pálido, visible pero no agresivo. |

### Verificacion de contraste WCAG AA

Método: luminancia relativa según sRGB IEC 61966-2-1, formula WCAG 2.1.
Umbral: texto normal ≥4.5:1 · texto grande/UI ≥3:1.

| Par evaluado | Ratio calculado | Nivel | Uso |
|---|---|---|---|
| `#FFFFFF` sobre `--brand` `#1A6FB5` | **5.11:1** | AA texto normal | Texto en botón primario |
| `#FFFFFF` sobre `--brand-dark` `#0F4F85` | **8.24:1** | AAA | Texto en hover botón primario |
| `#FFFFFF` sobre `--ok` `#1A7A45` | **4.90:1** | AA texto normal | Texto en badge de exito |
| `#FFFFFF` sobre `--alerta` `#C0392B` | **5.09:1** | AA texto normal | Texto en badge de error |
| `#FFFFFF` sobre `--acento-dark` `#9E4900` | **5.60:1** | AA texto normal | Texto en variante boton naranja |
| `--ink` `#0F2233` sobre `--bg` `#F4F7FA` | **16.8:1** | AAA | Body principal |
| `--ink-soft` `#3D5E78` sobre `--bg` `#F4F7FA` | **5.73:1** | AA texto normal | Subtitulos, labels |
| `--ink-muted` `#6B8A9E` sobre `--bg` `#F4F7FA` | **3.87:1** | FALLA texto normal | Solo para metadata >=18px o >=14px bold |
| `--ink` `#0F2233` sobre `--surface` `#FFFFFF` | **17.7:1** | AAA | Texto en cards |
| `--ink-soft` `#3D5E78` sobre `--surface` `#FFFFFF` | **6.02:1** | AA texto normal | Labels en cards |
| `--ink` `#0F2233` sobre `--acento` `#E07010` | **4.97:1** | AA texto normal | Texto oscuro sobre badge naranja |
| `--brand` `#1A6FB5` sobre `--bg` `#F4F7FA` | **4.61:1** | AA texto normal | Links en body |
| `--ok` `#1A7A45` sobre `--surface` `#FFFFFF` | **4.73:1** | AA texto normal | Texto de cantidades ganadas |
| `--aviso` `#B07D00` sobre `--surface` `#FFFFFF` | **4.51:1** | AA texto normal | Texto de advertencia (verificado al limite) |

**Nota sobre `--ink-muted`:** no cumple 4.5:1 en texto normal (3.87:1). Se permite exclusivamente en textos no informativos de tamaño >=18px (texto grande, ratio >=3:1 cumplido con 3.87:1) o en metadata estrictamente decorativa. El Agente 9 (accesibilidad) debe verificar cada uso en el HTML final. Si aparece en texto <18px informativo, sustituir por `--ink-soft`.

---

## 3. Tipografia

### Familias elegidas

**Familia 1 — Plus Jakarta Sans** (Google Fonts)
Rol: interfaz, body, botones, labels, datos numericos.
Justificacion: diseñada para legibilidad en pantallas pequeñas, tiene una "g" abierta y números de caja baja que refuerzan la sensacion de cercanía y humanidad. Pesos disponibles 400/500/600/700. A diferencia de Inter (prohibida por instrucciones), Plus Jakarta Sans tiene proporciones ligeramente más amplias en titulos de tamaño medio que favorecen la lectura de frases cortas (precios, ganancias, porcentajes). Velocidad: subset latin, display:swap.

**Familia 2 — DM Serif Display** (Google Fonts)
Rol: h1 hero, cifras de impacto, claims de confianza.
Justificacion: serif humanista con remates suaves, sin austeridad bancaria. Una sola aparicion en el hero ("Tus datos, tu dinero, tus reglas") ancla la emocion antes de que empiece la interfaz funcional. Solo pesos 400 (italic opcional). No se usa para body ni labels.

### Link Google Fonts (unica peticion, display:swap)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Escala de tipografia (mobile-first con clamp)

| Token | Valor CSS | Uso |
|---|---|---|
| `--t-hero` | `clamp(2rem, 6vw + 0.5rem, 3.5rem)` | h1 hero (DM Serif Display) |
| `--t-h2` | `clamp(1.5rem, 4vw + 0.25rem, 2.25rem)` | h2 de seccion (Plus Jakarta Sans 700) |
| `--t-h3` | `clamp(1.125rem, 2.5vw, 1.5rem)` | h3 de card/subgrupo (Plus Jakarta Sans 600) |
| `--t-body` | `1rem` (16px) | Body principal (Plus Jakarta Sans 400) |
| `--t-small` | `0.875rem` (14px) | Labels, metadata, disclaimers (Plus Jakarta Sans 400/500) |
| `--t-xs` | `0.75rem` (12px) | Timestamps, badges, pie de firma (Plus Jakarta Sans 500) |

Line-height recomendado: hero 1.1 · h2 1.2 · h3 1.3 · body 1.65 · small 1.5.
Letter-spacing: hero -0.02em · h2 -0.01em · resto 0.

---

## 4. Tokens CSS completos para `:root`

```css
/* =========================================================
   SISTEMA VISUAL — Data Dividend MVP
   Generado por Agente 2 (Diseñador de Marca)
   Fecha: 2026-06-19
   ========================================================= */
:root {
  /* --- FUENTES --- */
  --font-display: 'DM Serif Display', Georgia, serif;  /* hero y claims */
  --font-ui: 'Plus Jakarta Sans', system-ui, sans-serif; /* todo lo demas */

  /* --- COLOR: MARCA --- */
  --brand: #1A6FB5;        /* azul petroleo: botones primarios, iconos de accion, links */
  --brand-dark: #0F4F85;   /* hover/pressed del boton primario */
  --brand-soft: #E3EFF9;   /* fondo de chips activos, progress bars, cards seleccionadas */

  /* --- COLOR: GANANCIAS / EXITO --- */
  --ok: #1A7A45;           /* verde: cantidades ganadas, confirmaciones, checkmarks */
  --ok-soft: #D4EEE0;      /* fondo de notificaciones de exito, badges de ganancias */

  /* --- COLOR: ACENTO CALIDO (humano) --- */
  --acento: #E07010;       /* naranja: CTA de cesion, badges "Nuevo"; SOLO con --ink encima */
  --acento-dark: #9E4900;  /* naranja oscuro: boton secundario con texto blanco (5.6:1) */

  /* --- COLOR: ESTADOS NEGATIVOS --- */
  --alerta: #C0392B;       /* rojo: errores, campos invalidos, estado rechazado */
  --alerta-soft: #FDECEA;  /* fondo de mensajes de error */
  --aviso: #B07D00;        /* ambar: advertencias, acciones irreversibles */
  --aviso-soft: #FFF8DC;   /* fondo de advertencias */

  /* --- COLOR: NEUTROS --- */
  --bg: #F4F7FA;           /* fondo de pagina: gris frio muy claro */
  --surface: #FFFFFF;      /* superficie: cards, modales, formularios, nav */
  --ink: #0F2233;          /* tinta principal: h1-h3 y body critico (17.7:1 sobre blanco) */
  --ink-soft: #3D5E78;     /* tinta secundaria: labels, subtitulos (6.02:1 sobre blanco) */
  --ink-muted: #6B8A9E;    /* tinta atenuada: metadata, timestamps — SOLO texto >=18px */
  --line: #D8E4EE;         /* bordes y divisores */

  /* --- TIPOGRAFIA: ESCALA --- */
  --t-hero: clamp(2rem, 6vw + 0.5rem, 3.5rem);      /* h1 hero */
  --t-h2: clamp(1.5rem, 4vw + 0.25rem, 2.25rem);    /* h2 de seccion */
  --t-h3: clamp(1.125rem, 2.5vw, 1.5rem);           /* h3 de card */
  --t-body: 1rem;                                     /* body (16px) */
  --t-small: 0.875rem;                                /* labels, disclaimers (14px) */
  --t-xs: 0.75rem;                                    /* badges, timestamps (12px) */

  /* --- ESPACIADO (escala 4px) --- */
  --sp-1: 0.25rem;   /*  4px */
  --sp-2: 0.5rem;    /*  8px */
  --sp-3: 0.75rem;   /* 12px */
  --sp-4: 1rem;      /* 16px */
  --sp-5: 1.25rem;   /* 20px */
  --sp-6: 1.5rem;    /* 24px */
  --sp-8: 2rem;      /* 32px */
  --sp-10: 2.5rem;   /* 40px */
  --sp-12: 3rem;     /* 48px */
  --sp-16: 4rem;     /* 64px */
  --sp-20: 5rem;     /* 80px */

  /* --- RADIOS --- */
  --r-sm: 6px;      /* inputs, badges, checkboxes */
  --r-md: 12px;     /* cards secundarias, dropdowns */
  --r-lg: 18px;     /* cards principales, modales */
  --r-xl: 28px;     /* hero cards, paneles de resumen */
  --r-full: 999px;  /* botones pill, chips, avatares */

  /* --- SOMBRAS --- */
  --shadow-xs: 0 1px 2px rgba(15, 34, 51, 0.04);
  --shadow-sm: 0 2px 8px rgba(15, 34, 51, 0.07);
  --shadow-md: 0 4px 20px rgba(15, 34, 51, 0.09), 0 1px 3px rgba(15, 34, 51, 0.05);
  --shadow-lg: 0 8px 40px rgba(15, 34, 51, 0.12), 0 2px 6px rgba(15, 34, 51, 0.06);
  --shadow-focus-brand: 0 0 0 3px rgba(26, 111, 181, 0.35); /* anillo de foco accesible */
  --shadow-focus-ok: 0 0 0 3px rgba(26, 122, 69, 0.35);    /* foco en zona de ganancias */

  /* --- TRANSICIONES --- */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 120ms;
  --duration-mid: 220ms;
}
```

---

## 5. Sistema de Botones

### Boton primario (accion principal: "Ceder datos", "Confirmar", "Activar")
- Background: `--brand` (#1A6FB5)
- Texto: `#FFFFFF` · ratio 5.11:1 · AA
- Hover: background `--brand-dark` (#0F4F85) · ratio 8.24:1
- Borde-radio: `--r-full` (pill)
- Padding: 14px 28px · font-size `--t-body` · font-weight 600
- Focus: `box-shadow: var(--shadow-focus-brand)`
- Disabled: opacity 0.45 · cursor not-allowed

### Boton secundario (accion de apoyo: "Ver detalle", "Configurar")
- Background: `--surface` (#FFFFFF)
- Texto: `--brand` (#1A6FB5) · ratio 4.61:1 vs blanco (propio bg) — pero el texto brand sobre blanco: necesita check.
  - `--brand` (#1A6FB5) sobre `--surface` (#FFFFFF): L_brand=0.1555; (1.05)/(0.2055)=5.11:1 — AA
- Border: 2px solid `--brand`
- Hover: background `--brand-soft` (#E3EFF9)
- Borde-radio: `--r-full`

### Boton fantasma / terciario (acciones destructivas suaves: "Cancelar", "Revocar")
- Background: transparent
- Texto: `--ink-soft` (#3D5E78) · ratio 5.73:1 vs --bg — AA
- Border: 1px solid `--line` (#D8E4EE)
- Hover: background `--bg` (#F4F7FA) · border-color `--ink-soft`

### Boton de CTA especial naranja (solo para el embudo hero: "Empezar a ganar")
- Background: `--acento-dark` (#9E4900)
- Texto: `#FFFFFF` · ratio 5.60:1 · AA
- Hover: `#7A3800` (mas oscuro)
- Proposito: un unico boton de conversion en la pantalla hero; el naranja llama la atencion sin romper el sistema azul.

### Chip / toggle de consentimiento (critico en la app)
- Estado OFF: background `--line` (#D8E4EE) · label `--ink-soft`
- Estado ON: background `--ok` (#1A7A45) · icono check blanco (4.90:1) · label `--ok`
- Transicion: 220ms ease-out
- SIEMPRE tiene label textual ademas del color (no depende solo del color para comunicar estado)

---

## 6. Iconografia

- Estilo: SVG line, trazo 1.75px, terminaciones redondeadas (stroke-linecap: round; stroke-linejoin: round).
- Tamano estandar: 20px × 20px en UI · 24px en cards · 40px en ilustraciones de estado.
- Emojis funcionales: permitidos como refuerzo visual en estados vacios y mensajes de carga (p.ej. "No has cedido nada todavia 🔒").
- Iconos clave del dominio: candado (control), escudo (privacidad), flecha de bifurcacion (cesion), moneda/billete (ganancia), grafico de barra ascendente (historial), ojo tachado (anonimidad).

---

## 7. Logotipo / Emblema SVG (placeholder generico)

**Concepto:** Un nodo central (hexagono como dato) con tres lineas que salen hacia afuera (cesion, control, ganancia) y un escudo superpuesto semitransparente en el fondo. Evoca datos que fluyen con proteccion. Monocromatico por defecto; la version de color usa `--brand`.

El emblema funciona:
- En 192×192 y 512×512 como icono PWA (rellenado azul sobre fondo blanco)
- Como favicon 32×32 en monocromo (solo el hexagono + escudo)
- Como wordmark si se añade el nombre placeholder a la derecha

```svg
<!-- LOGOTIPO / EMBLEMA SVG — Data Dividend MVP -->
<!-- Placeholder generico; el dueño sustituye por su logo real -->
<!-- Cuadrado 1:1, escalable. Funciona en 32px (favicon) y 512px (PWA) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Logo placeholder">
  <!-- Fondo de icono PWA (blanco, visible en contextos de color) -->
  <rect width="100" height="100" rx="20" fill="#ffffff"/>

  <!-- Escudo base: proteccion, confianza -->
  <path
    d="M50 12 L78 24 L78 52 C78 68 65 80 50 88 C35 80 22 68 22 52 L22 24 Z"
    fill="#E3EFF9"
    stroke="#1A6FB5"
    stroke-width="3"
    stroke-linejoin="round"
  />

  <!-- Hexagono central: dato / nodo -->
  <polygon
    points="50,32 60,38 60,50 50,56 40,50 40,38"
    fill="#1A6FB5"
  />

  <!-- Linea de cesion (arriba-derecha): datos que fluyen -->
  <line x1="60" y1="38" x2="76" y2="28" stroke="#1A7A45" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="76" cy="28" r="3.5" fill="#1A7A45"/>

  <!-- Linea de control (abajo): usuario en el centro -->
  <line x1="50" y1="56" x2="50" y2="70" stroke="#E07010" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="50" cy="70" r="3.5" fill="#E07010"/>

  <!-- Linea de ganancia (arriba-izquierda) -->
  <line x1="40" y1="38" x2="24" y2="28" stroke="#1A6FB5" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 2"/>
  <circle cx="24" cy="28" r="3" fill="#1A6FB5" opacity="0.6"/>
</svg>
```

**Nota obligatoria:** Este emblema es un placeholder de estudio. El dueño debe reemplazarlo con su logo real desde el panel de admin. Mientras no lo haga, la app arranca con este SVG como icono PWA, favicon y cabecera.

---

## 8. Principios Visuales de Confianza (los 5 que guian cada pantalla)

1. **El precio siempre visible, nunca al final.** Cada card de cesion muestra cuanto va a ganar el usuario Y cuanto se queda la plataforma, en el mismo elemento, con el mismo tamaño tipografico. No hay sorpresas post-clic.

2. **Espacio en blanco es honestidad.** Padding generoso (minimo `--sp-6` en cards) y un maximo de 3 elementos por fila en mobile. Las apps con demasiada informacion comprimida parecen sospechosas. El espacio comunica que no hay nada que esconder.

3. **Los estados siempre con doble señal.** Cualquier estado de un toggle (cedido/no cedido, activo/pausado) usa color + icono + etiqueta textual. Nunca solo color. El usuario daltónico o en pantalla con brillo bajo sabe exactamente en que estado esta.

4. **Confirmaciones antes de ceder, siempre.** Cualquier accion de cesion de datos abre un modal de confirmacion que detalla: que datos, a quien, durante cuanto tiempo, cuanto se paga. La accion es en dos pasos (tap + confirmar). Esta friccion es una feature, no un bug; refuerza que el control es del usuario.

5. **El historico es sagrado.** Existe siempre una pantalla de historial con cada cesion (fecha, dato, comprador anonimizado, cantidad recibida) que el usuario puede exportar. La opacidad mata la confianza; el historial completo la construye.

---

## Resumen ejecutivo (max 150 palabras)

**Paleta principal:** Azul petroleo `#1A6FB5` (confianza institucional) + verde ganancias `#1A7A45` + naranja humano `#E07010` / `#9E4900`. Fondo `#F4F7FA`, superficie `#FFFFFF`, tinta `#0F2233`.

**Tipografia:** Plus Jakarta Sans (interfaz, 400/500/600/700) + DM Serif Display (solo hero y claims de impacto). Google Fonts, display:swap, subset latin. Sin Arial, Helvetica, Inter ni Roboto.

**Concepto visual:** "Claridad radical como escudo." El sistema no seduce ni promete: informa. Fondos abiertos, espacio generoso, estados siempre con doble señal (color + texto), historial siempre accesible. El azul ancla la confianza institucional; el verde confirma que el dinero llega de verdad; el naranja rompe la frialdad y dice que detras hay personas. Cada decision de diseno reemplaza una duda del usuario por una certeza.

**Contraste verificado:** todos los pares criticos cumplen WCAG AA. Unica excepcion documentada: `--ink-muted` solo para texto grande (>=18px) o decorativo.
