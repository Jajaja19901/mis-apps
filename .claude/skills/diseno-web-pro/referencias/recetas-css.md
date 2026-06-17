# Recetas CSS (starter de la casa) — listas para pegar

Estas piezas usan el **mismo vocabulario de tokens** que `apps/peluqueria-aurora.html`,
para que toda app salga coherente. Son un *starter* con valores **PLACEHOLDER**:

> ⚠️ Cambia los HEX y las fuentes por los del **briefing** (vía `disenador-marca`).
> **Nunca** pegues los valores de marca de otra app: cada app es una isla.

---

## 0) `<head>` — fuentes + metas (cambia las familias por las elegidas)
```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NOMBRE_NEGOCIO · PROPUESTA_DE_VALOR (ciudad)</title>
<meta name="description" content="Descripción real de 140–160 caracteres orientada a la acción.">
<meta name="theme-color" content="#5b3a86"><!-- = tu --brand -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- Ejemplo: display con carácter + cuerpo limpio. SUSTITUYE por las del briefing. -->
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
```

## 1) Tokens `:root` (PLACEHOLDER — sustituye)
```css
:root{
  /* —— Superficies y texto (neutros) —— */
  --bg:#f7f6f4;        /* fondo general */
  --card:#ffffff;      /* tarjetas y superficies elevadas */
  --ink:#1c1a22;       /* texto principal */
  --ink-soft:#534f5c;  /* texto secundario */
  --ink-mut:#827e8c;   /* texto terciario / metadatos */
  --line:#e8e4ee;      /* bordes y separadores */

  /* —— Marca (DEL BRIEFING; nunca inventada ni copiada de otra app) —— */
  --brand:#5b3a86;     /* color de acento principal */
  --brand-deep:#46295f;/* versión profunda para hover/activo */
  --brand-soft:#efe9f6;/* versión clara para fondos de bloque */

  /* —— Feedback —— */
  --ok:#2e7d4f;  --err:#c0392b;

  /* —— Tipos (display con carácter + cuerpo limpio) —— */
  --display:'Fraunces',Georgia,serif;
  --sans:'Manrope',-apple-system,BlinkMacSystemFont,sans-serif;

  /* —— Sistema —— */
  --shadow:0 1px 2px rgba(20,16,30,.05),0 8px 30px rgba(20,16,30,.07); /* sombra EN CAPAS, con tinte de marca */
  --radius:14px;
}
```

## 2) Reset + base
```css
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
@media(not (prefers-reduced-motion:reduce)){html{scroll-behavior:smooth}}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
a{color:inherit}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
```

## 3) Tipografía fluida (mobile-first con `clamp()`)
```css
h1,h2,h3{font-family:var(--display);font-weight:600;letter-spacing:-.02em;line-height:1.1}
.h1{font-size:clamp(34px,8vw,60px)}   /* hero */
.h2{font-size:clamp(26px,5vw,38px)}   /* secciones */
.h3{font-size:clamp(19px,3vw,22px)}   /* tarjetas */
.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.16em;color:var(--brand-deep);font-weight:600}
.lead{font-size:18px;color:var(--ink-soft)}
```

## 4) Botones (píldora; primario / fantasma / grande)
```css
.btn{display:inline-flex;align-items:center;gap:8px;font-family:var(--sans);font-weight:600;font-size:15px;border:none;border-radius:999px;padding:14px 24px;cursor:pointer;transition:transform .15s,background .2s,border-color .2s;text-decoration:none;line-height:1}
.btn:active{transform:scale(.97)}                 /* microinteracción al pulsar */
.btn-primary{background:var(--brand);color:#fff}
.btn-primary:hover{background:var(--brand-deep)}
.btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn-ghost:hover{border-color:var(--ink)}
.btn-lg{padding:17px 30px;font-size:16px}
```

## 5) Foco visible (accesibilidad, NO lo borres)
```css
:focus-visible{outline:3px solid var(--brand-deep);outline-offset:3px;border-radius:6px}
.field input:focus-visible,.field textarea:focus-visible,.field select:focus-visible{outline:none;box-shadow:0 0 0 3px var(--brand-soft)}
```

## 6) Header sticky con blur
```css
header.site{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.logo{font-family:var(--display);font-weight:600;font-size:20px;display:flex;align-items:center;gap:9px}
.logo .dot{width:9px;height:9px;border-radius:50%;background:var(--brand)}
@media(max-width:560px){header .nav-cta{display:none}}
```

## 7) Hero + secciones (ritmo y aire)
```css
.hero{padding:64px 0 48px;text-align:center}
.hero p{font-size:18px;color:var(--ink-soft);max-width:560px;margin:18px auto 28px}
.hero-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
section{padding:54px 0}
.sec-head{text-align:center;max-width:560px;margin:0 auto 34px}
.alt{background:var(--brand-soft)}   /* sección destacada con fondo suave de marca */
```

## 8) Grid + tarjetas
```css
.grid{display:grid;gap:18px}
.grid-3{grid-template-columns:repeat(3,1fr)}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow)}
.card p{color:var(--ink-soft);font-size:15px}
```

## 9) Formulario + estados (la sección oscura que da contraste)
```css
.book{background:var(--ink);color:#fff;border-radius:24px;padding:40px 28px;max-width:620px;margin:0 auto}
.book h2{color:#fff;text-align:center}
.field{margin-bottom:14px}
.field label{display:block;font-size:13px;color:#cfc9d6;margin-bottom:6px}
.field input,.field textarea,.field select{width:100%;background:#2a2730;border:1px solid #433f4c;color:#fff;border-radius:12px;padding:14px 15px;font-family:var(--sans);font-size:16px}
.field input:focus,.field textarea:focus,.field select:focus{outline:none;border-color:var(--brand)}
.field textarea{min-height:90px;resize:vertical}
.field .err{color:#ffb3a3;font-size:13px;margin-top:5px;display:none}      /* ERROR */
.field.invalid .err{display:block}
.field.invalid input,.field.invalid textarea{border-color:var(--err)}
/* ÉXITO */
.form-ok{text-align:center;padding:20px 0}
.form-ok .check{width:64px;height:64px;border-radius:50%;background:var(--ok);margin:0 auto 16px;display:flex;align-items:center;justify-content:center}
/* CONSENTIMIENTO RGPD (obligatorio si recoges datos) */
.consent{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:#cfc9d6;margin:6px 0 10px}
.consent input{margin-top:3px}
```

## 10) Estado vacío + carga (no olvides los estados "no felices")
```css
.empty{text-align:center;color:var(--ink-mut);padding:50px 20px}
.empty .ic{font-size:40px;margin-bottom:10px}
.skeleton{background:linear-gradient(90deg,var(--line) 25%,#f3f0f7 50%,var(--line) 75%);background-size:200% 100%;animation:sk 1.2s infinite;border-radius:8px}
@keyframes sk{to{background-position:-200% 0}}
```

## 11) FAB de WhatsApp + toast
```css
.fab{position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(37,211,102,.45);z-index:60;text-decoration:none}
.fab svg{width:30px;height:30px;fill:#fff}
.toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%) translateY(20px);background:var(--ink);color:#fff;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:500;opacity:0;pointer-events:none;transition:.3s;z-index:100}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
```

## 12) Pie con firma del estudio (SIEMPRE)
```css
footer.site{border-top:1px solid var(--line);padding:40px 0;color:var(--ink-soft);font-size:15px}
.copyr{margin-top:28px;padding-top:18px;border-top:1px solid var(--line);font-size:13px;color:var(--ink-mut);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
```
```html
<!-- en el pie, discreto -->
<p class="studio">Diseñado por <a href="STUDIO_URL">Incuba tu Negocio</a> · por Jaime M. M.</p>
```

## 13) Motion + reduced-motion + responsive (cierra SIEMPRE con esto)
```css
@media(max-width:820px){.grid-3{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.grid-3{grid-template-columns:1fr}.hero{padding:46px 0 36px}}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
}
```

## 14) Revelado al hacer scroll (opcional, ligero, sin librerías)
```js
const io=new IntersectionObserver((es)=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('[data-reveal]').forEach(el=>io.observe(el));
```
```css
[data-reveal]{opacity:0;transform:translateY(16px);transition:opacity .5s,transform .5s}
[data-reveal].in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){[data-reveal]{opacity:1;transform:none}}
```

## 15) PWA (instalable) — recordatorio
- `favicon` = el logo (SVG inline o dataURL).
- **Manifest embebido** (`<link rel="manifest" href="data:application/json,...">`) + metas Apple (`apple-mobile-web-app-capable`, `apple-touch-icon`).
- Si el dueño sube su logo desde el panel, ese pasa a ser el icono.
- Botón discreto "Instalar app" (escucha `beforeinstallprompt`). En `file://` es web normal; instalar requiere HTTPS.

---

### Recordatorio de coherencia
- Todo HEX vive en `:root`. Si te ves escribiendo un color a mano en una regla, conviértelo en token.
- Un único `--radius` y una única familia de sombras en toda la app.
- Verifica contraste AA (≥4.5:1 texto, ≥3:1 grande/UI) en cada par antes de pasar a los revisores.
