# Guía de Despliegue en Netlify — MIS-DATOS

**Objetivo:** Pasar de ejecutable local (`file://`) a una PWA en HTTPS funcional en Netlify.

**Tiempo estimado:** 10–15 minutos (sin contar tiempos de build de Netlify)

---

## 1. Preparar el Repositorio Git

### Paso 1.1: Inicializar git (si no lo está ya)

```bash
cd /home/user/mis-apps
git init
git add .
git commit -m "Initial commit: MVP data dividend platform"
```

### Paso 1.2: Crear repositorio en GitHub

1. Ve a https://github.com/new
2. Nombre: `mis-datos-app` (o el que prefieras)
3. Descripción: "MVP de cesión voluntaria de datos con reparto de ganancias"
4. Privado o público (recomendado privado para prototipos)
5. **No inicialices con README** (ya tienes uno)
6. Crea el repositorio

### Paso 1.3: Conectar repositorio local a GitHub

```bash
cd /home/user/mis-apps
git remote add origin https://github.com/TU_USUARIO/mis-datos-app.git
git branch -M main
git push -u origin main
```

Reemplaza `TU_USUARIO` con tu usuario de GitHub.

---

## 2. Preparar los Archivos para Netlify

### Paso 2.1: Estructura de Carpetas para PWA

Netlify espera esta estructura:

```
mis-datos-app/
├── public/                          ← Carpeta raíz de la web
│   ├── index.html                   ← Redirige a mis-datos.html
│   ├── mis-datos.html               ← App principal
│   ├── pwa/
│   │   └── mis-datos/
│   │       ├── manifest.json        ← Manifest PWA (puede estar embebido en HTML)
│   │       ├── icon-192x192.png     ← Icono app
│   │       └── icon-512x512.png
│   └── robots.txt                   ← SEO (opcional)
├── docs/                            ← Documentación (no se despliega)
├── netlify.toml                     ← Configuración de Netlify
├── .gitignore
└── README.md
```

### Paso 2.2: Crear archivo `public/index.html`

Crea un archivo pequeño que redirija a la app principal:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MIS-DATOS — Plataforma de Cesión de Datos</title>
  <script>
    // Redirigir a la app principal
    window.location.href = '/mis-datos.html';
  </script>
</head>
<body>
  <p>Redirigiendo a MIS-DATOS...</p>
</body>
</html>
```

### Paso 2.3: Crear archivo `netlify.toml`

En la raíz del proyecto (mismo nivel que `.git`), crea `netlify.toml`:

```toml
# Configuración de despliegue para Netlify
# Archivo: netlify.toml

[build]
  # Directorio que se despliega (contiene los HTML/CSS/JS finales)
  publish = "public"
  
  # No necesita build si son archivos estáticos; si tuvieras un builder:
  # command = "npm run build"

[[redirects]]
  # Si navegas a una ruta, redirige a la app HTML (para SPA)
  from = "/*"
  to = "/mis-datos.html"
  status = 200

[[headers]]
  # Headers de seguridad y PWA
  for = "/*"
  [headers.values]
    # HTTPS obligatorio, no permitir downgrade
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    
    # Prevent clickjacking
    X-Frame-Options = "DENY"
    
    # Prevent MIME type sniffing
    X-Content-Type-Options = "nosniff"
    
    # Habilitar PWA en HTTPS
    Service-Worker-Allowed = "/"
    
    # Cache-Control: 
    Cache-Control = "public, max-age=3600"

[[headers]]
  # No cachear HTML (index siempre fresco)
  for = "*.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
  # Cachear assets (CSS, JS, PNG) agresivamente
  for = "/pwa/**"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### Paso 2.4: Crear `public/robots.txt` (opcional)

```text
User-agent: *
Disallow: /admin
Allow: /

Sitemap: https://TU_DOMINIO.netlify.app/sitemap.xml
```

Reemplaza `TU_DOMINIO` con tu dominio final.

---

## 3. Arreglos en `mis-datos.html` para HTTPS + PWA

### Paso 3.1: Garantizar que el Manifest está Embebido

El HTML **debe contener** un `<link rel="manifest">` que apunte al manifest:

```html
<head>
  ...
  <link rel="manifest" href="/pwa/mis-datos/manifest.json">
  <meta name="theme-color" content="#1A6FB5">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="MIS-DATOS">
  ...
</head>
```

### Paso 3.2: Crear `public/pwa/mis-datos/manifest.json`

```json
{
  "name": "MIS-DATOS — Plataforma de Cesión de Datos",
  "short_name": "MIS-DATOS",
  "description": "Cede tus datos voluntariamente y recibe dinero real. Transparencia total, control en tus manos.",
  "start_url": "/mis-datos.html",
  "scope": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#1A6FB5",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/pwa/mis-datos/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/pwa/mis-datos/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/pwa/mis-datos/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    }
  ],
  "screenshots": [
    {
      "src": "/pwa/mis-datos/screenshot-540x720.png",
      "sizes": "540x720",
      "type": "image/png",
      "form_factor": "narrow"
    }
  ],
  "categories": ["finance", "lifestyle"],
  "screenshots": []
}
```

### Paso 3.3: Crear Iconos PWA

Usa herramientas online (realfavicongenerator.net o iconkitchen.app) para generar:

- `icon-192x192.png` (para pantalla de inicio móvil)
- `icon-512x512.png` (para splash screen)

Guárdalos en `public/pwa/mis-datos/`

**Alternativa rápida:** Exporta el SVG del logo de `docs/diseno/marca.md` a PNG en 192x192 y 512x512.

---

## 4. Desplegar en Netlify

### Opción A: Conectar GitHub a Netlify (Recomendado)

1. **Ir a https://app.netlify.com**
2. **Inicia sesión** con GitHub (o crea cuenta)
3. **Nuevo sitio** → "Import an existing project"
4. **Selecciona GitHub**
5. **Busca y selecciona** `mis-datos-app`
6. **Configurar la construcción:**
   - Base directory: (dejar vacío si la raíz está limpia)
   - Publish directory: `public`
   - Build command: (dejar vacío; son archivos estáticos)
7. **Deploy site**

**Netlify automáticamente:**
- Despliega desde `public/`
- Genera HTTPS automático (Let's Encrypt)
- Asigna URL: `https://tu-sitio.netlify.app`
- Redeploy en cada `git push` a `main`

### Opción B: Arrastra Carpeta a Netlify (Más Rápido para MVP)

1. **Ir a https://app.netlify.com**
2. **Inicia sesión**
3. **Arrastra la carpeta `public/` al área indicada**
4. **Netlify despliega en <10s**
5. **Te da una URL aleatoria** (ej: `https://tiny-fluffy-abc123.netlify.app`)
6. **Para renombrar:** Settings → Site settings → Change site name

**Desventaja:** No hay redeploy automático; tienes que arrastra cada cambio.

---

## 5. Verificar que Funciona en Producción

### Paso 5.1: Abrir la URL en Navegador

```
https://tu-sitio.netlify.app
```

### Paso 5.2: Verificar Acceso Admin

1. Abre DevTools (F12)
2. Ve a `#/admin`
3. Entra con la contraseña (por defecto en CONFIG: `admin123`)
4. Verifica que el panel de admin carga correctamente

### Paso 5.3: Verificar PWA en Móvil

1. Abre el sitio en **iPhone** (Safari) o **Android** (Chrome)
2. Botón de compartir (↗️) o menú (⋯)
3. "Añadir a pantalla de inicio" / "Install app"
4. Aparecerá un icono en tu pantalla de inicio
5. Abre desde el icono → debe funcionar sin conexión (localStorage persiste)

### Paso 5.4: Verificar HTTPS

1. En navegador, ve a la URL
2. Mira el candado (🔒) en la barra de direcciones
3. "Seguro" o "HTTPS" debe aparecer
4. DevTools → Network → todas las peticiones en `https://`

---

## 6. Dominio Personalizado (Opcional)

### Para usar tu propio dominio (ej: `www.mis-datos.es`)

1. **En Netlify:**
   - Settings → Domain management → Add custom domain
   - Escriba `www.mis-datos.es`
   - Sigue las instrucciones de verificación DNS

2. **En tu registrador de dominios (GoDaddy, Namecheap, etc.):**
   - Ve al gestor de DNS
   - Agrega un registro CNAME:
     ```
     Nombre: www
     Valor: tu-sitio.netlify.app
     ```

3. **Espera 5–30 minutos** a que propague (TTL)

4. **Acceso:** `https://www.mis-datos.es`

Netlify renueva automáticamente el certificado SSL/TLS.

---

## 7. Configuración de Variables de Entorno (Opcional)

Si en el futuro necesitas secretos (API keys, contaseñas), crea un archivo `.env`:

```bash
# .env (NO committear a git; añádelo a .gitignore)
ADMIN_PASSWORD=tu_password_seguro
STRIPE_API_KEY=sk_live_...
```

En Netlify:
1. Settings → Build & deploy → Environment
2. Agrega pares clave-valor
3. El build puede acceder vía `process.env.ADMIN_PASSWORD`

**Nota:** En el MVP actual no necesitas esto (CONFIG está en el HTML), pero es buena práctica para futuro.

---

## 8. Verificar Seguridad y Cumplimiento

### Headers de Seguridad (Verificar en `netlify.toml`)

Abre DevTools → Network → Haz clic en la petición de `index.html` → pestaña Headers → Response Headers

Debe contener:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Service-Worker-Allowed: /
```

### WCAG AA y Rendimiento

1. **Lighthouse (Chrome DevTools):**
   - F12 → Lighthouse → Analizar página
   - Verifica Accessibility >= 90, Performance >= 85

2. **Observatory (Mozilla):**
   - https://observatory.mozilla.org/
   - Pega tu URL
   - Espera análisis de seguridad

---

## 9. Monitoreo Continuo

### Notifications de Error

1. **En Netlify:**
   - Settings → Deploy notifications
   - Agrega email o Slack para notificaciones de deploy fallido

2. **Errores de cliente (en localStorage):**
   - MIS-DATOS registra errores en `console.error`
   - Suscríbete a Sentry (opcional) para monitoreo de errores en producción

---

## 10. Rollback (en caso de error)

Si desplegaste con bug:

1. **Opción 1 (Git):**
   ```bash
   git revert HEAD  # Deshace último commit
   git push         # Netlify redeploy automático
   ```

2. **Opción 2 (Netlify UI):**
   - Ir a https://app.netlify.com
   - Sitio → Deploys → Selecciona un deploy anterior → "Publish deploy"

---

## 11. Checklist Pre-Lanzamiento

Antes de pasar a producción real (con pagos reales):

- [ ] HTTPS funciona (candado 🔒 visible)
- [ ] Admin panel accesible y protegido en `#/admin`
- [ ] Registro y login persisten en localStorage
- [ ] Consentimiento granular funciona (toggles activan/desactivan)
- [ ] PWA se instala en móvil
- [ ] Offline mode funciona (navega sin conexión)
- [ ] Política de Privacidad enlazada y accesible
- [ ] AEPD enlazada en pie y en derechos GDPR
- [ ] CSV export del admin funciona
- [ ] Lighthouse: Performance >= 85, Accessibility >= 90
- [ ] No hay errores en DevTools Console (F12)
- [ ] Datos sensibles NO se guardan en localStorage en plaintext (usar hash)
- [ ] Dominio personalizado configurado (opcional pero profesional)
- [ ] Email de notificación de errores configurado

---

## Notas Finales

- **Localhost vs. Netlify:** El HTTPS es obligatorio en Netlify; `file://` local no lo tiene. PWA funciona parcialmente en local (sin instalación visual), pero completamente en HTTPS.

- **Build con backend:** Si en futuro usas build (Next.js, SvelteKit), cambia `publish` en `netlify.toml` a la carpeta de build (ej: `.next` o `build`).

- **Escalado:** Netlify free soporta hasta 300 minutos de build/mes. Para apps estáticas grandes (100MB+), upgrade a Pro.

- **Performance:** Netlify usa CDN global; tu app se carga desde el edge (servidor más cercano al usuario), no desde un único servidor.

---

**Generado por:** Agente 10 (QA/Documentación)  
**Fecha:** 19 de junio de 2026
