# Recetas SVG — logo, emblemas, favicon e icono (listas para pegar)

Sustituye `NEGOCIO` por el `BUSINESS_NAME` del briefing y `IN` por sus **iniciales reales**.
Sin nombre → placeholder neutro `"Tu Negocio"` + aviso. **Nunca** inventes marca ni copies otra app.
Todo usa `currentColor`/`var(--brand)` para heredar el color del tema.

---

## 1) Wordmark (el nombre, con un detalle)
Versión CSS (la del header de `diseno-web-pro`, lo más simple y honesto):
```html
<a class="logo" href="#/" aria-label="NEGOCIO — inicio">
  <span class="dot" aria-hidden="true"></span> NEGOCIO
</a>
```
Versión SVG (cuando necesitas el logo como imagen):
```html
<svg viewBox="0 0 220 48" role="img" aria-label="NEGOCIO">
  <title>NEGOCIO</title>
  <circle cx="16" cy="24" r="8" fill="var(--brand)"/>
  <text x="34" y="32" font-family="Georgia, 'Times New Roman', serif"
        font-size="26" font-weight="700" fill="currentColor">NEGOCIO</text>
</svg>
```
> En favicons el texto SVG **no** carga fuentes de Google; usa una familia del sistema (serif/sans) o,
> mejor, el monograma de abajo.

## 2) Monograma (iniciales en una forma — ideal para icono)
```html
<svg viewBox="0 0 64 64" role="img" aria-label="NEGOCIO">
  <title>NEGOCIO</title>
  <rect width="64" height="64" rx="14" fill="var(--brand)"/>
  <text x="32" y="43" text-anchor="middle"
        font-family="Georgia, serif" font-size="30" font-weight="700" fill="#fff">IN</text>
</svg>
```
Variante "escudo": cambia el `rect` por `<circle cx="32" cy="32" r="30">`.

## 3) Emblemas de sector (línea, una tinta, `currentColor`)
Acompañan al wordmark; **no** son "el logo oficial". Escala con `width`/`height` o dentro de un botón.
```html
<!-- Peluquería (tijeras) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Peluquería"><title>Peluquería</title>
<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="8.1" y1="8.1" x2="20" y2="20"/><line x1="8.1" y1="15.9" x2="20" y2="4"/></svg>

<!-- Cafetería (taza) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Cafetería"><title>Cafetería</title>
<path d="M4 8h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z"/><path d="M16 9h2a2 2 0 0 1 0 4h-2"/><line x1="7" y1="2.5" x2="7" y2="4.5"/><line x1="11" y1="2.5" x2="11" y2="4.5"/></svg>

<!-- Dentista (diente) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Dentista"><title>Dentista</title>
<path d="M12 4c-2-1.4-4.8-1.4-6 1-1 2.4 0 5 .5 8 .4 2.3.5 4.5 1.8 4.5 1.4 0 1-2.5 2.2-2.5h3c1.2 0 .8 2.5 2.2 2.5 1.3 0 1.4-2.2 1.8-4.5.5-3 1.5-5.6.5-8-1.2-2.4-4-2.4-6-1z"/></svg>

<!-- Gimnasio (mancuerna) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Gimnasio"><title>Gimnasio</title>
<line x1="6.5" y1="12" x2="17.5" y2="12"/><rect x="2.5" y="9" width="3.5" height="6" rx="1"/><rect x="18" y="9" width="3.5" height="6" rx="1"/></svg>

<!-- Natural / cosmética (hoja) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Natural"><title>Natural</title>
<path d="M5 19C5 11 11 5 19 5c0 8-6 14-14 14z"/><path d="M5 19c3-5 7-7 10-8"/></svg>

<!-- Restaurante (cubiertos) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Restaurante"><title>Restaurante</title>
<path d="M7 2v8M5 2v4a2 2 0 0 0 2 2M9 2v4a2 2 0 0 1-2 2M7 10v12"/><path d="M16 2c-1.5 1-2 3-2 6 0 2 1 3 2 3v11"/></svg>
```

## 4) Favicon SVG (inline, sin archivo)
Monograma como favicon (sustituye `%23BRAND` por tu HEX, p. ej. `%235b3a86`, y `IN`):
```html
<link rel="icon" type="image/svg+xml"
 href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23BRAND'/%3E%3Ctext x='32' y='43' text-anchor='middle' font-family='Georgia,serif' font-size='32' font-weight='700' fill='white'%3EIN%3C/text%3E%3C/svg%3E">
```

## 5) apple-touch-icon + icono PWA (PNG generado con canvas)
Apple no usa SVG; genera un PNG al vuelo:
```js
function iconoPNG(iniciales, brand, size=180){
  const c=document.createElement('canvas'); c.width=c.height=size;
  const x=c.getContext('2d'); const r=size*0.22;
  x.fillStyle=brand; x.beginPath(); x.roundRect(0,0,size,size,r); x.fill();
  x.fillStyle='#fff'; x.textAlign='center'; x.textBaseline='middle';
  x.font=`700 ${size*0.5}px Georgia, serif`;
  x.fillText(iniciales, size/2, size/2 + size*0.04);
  return c.toDataURL('image/png');
}
// Apple touch icon
const apple = Object.assign(document.createElement('link'),
  {rel:'apple-touch-icon', href: iconoPNG('IN', getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#5b3a86')});
document.head.appendChild(apple);
```
Úsalo también para el `icons` del **manifest embebido** (ver `diseno-web-pro` §15).

## 6) El dueño sube su logo (override desde el panel)
```js
// Al cargar: si el dueño subió logo (dataURL en localStorage), reemplaza el SVG/monograma.
const ownLogo = localStorage.getItem('BIZ_LOGO');
if (ownLogo) {
  document.querySelectorAll('[data-logo]').forEach(el => {
    el.innerHTML = `<img src="${ownLogo}" alt="${CONFIG.BUSINESS_NAME}" style="height:32px;width:auto">`;
  });
  let f = document.querySelector('link[rel~="icon"]')
       || document.head.appendChild(Object.assign(document.createElement('link'),{rel:'icon'}));
  f.href = ownLogo;
}

// En el panel #/admin: input de archivo → guarda dataURL
adminLogoInput.addEventListener('change', e => {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => { localStorage.setItem('BIZ_LOGO', reader.result); location.reload(); };
  reader.readAsDataURL(file);
});
```
Marca el contenedor del logo con `data-logo` para que el override lo encuentre.

---

### Accesibilidad y coherencia
- Todo SVG decorativo-pero-informativo lleva `role="img"` + `<title>`. Si es puro adorno, `aria-hidden="true"`.
- Una sola tinta; deja que `currentColor`/`var(--brand)` mande. Sin texto diminuto en emblemas.
- El estilo del emblema debe casar con la **dirección visual** de `diseno-web-pro` (línea fina ≠ brutalista grueso).
- Recuerda: **el nombre y las iniciales salen del briefing**. Sin nombre → placeholder neutro + aviso.
