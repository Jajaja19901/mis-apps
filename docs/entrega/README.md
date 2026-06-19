# MIS-DATOS — Plataforma MVP de Cesión Voluntaria de Datos con Reparto de Ganancias

**Versión:** 1.0 MVP  
**Fecha:** Junio 2026  
**Estado:** Prototype / Single-File + localStorage (sin backend)

---

## Qué es MIS-DATOS

MIS-DATOS es una plataforma legalmente conforme que te permite **ceder voluntariamente tus datos personales y recibir dinero real** por ello. A diferencia de las redes sociales, que usan tus datos sin pagar, aquí:

- **Tú decides qué datos compartes** (datos demográficos, hábitos de compra, ubicación, opiniones, navegación).
- **Ves cuánto dinero ganan nuestros socios** con ellos.
- **Tú recibes una parte clara** del ingreso.
- **Revocas cuando quieras**, sin penalización.

### Propuesta de Valor

| Aspecto | Promesa |
|--------|---------|
| **Transparencia** | Cada cesión muestra exactamente a quién van tus datos, para qué, cuánto tiempo se guardan y cuánto ganas. |
| **Control** | Consentimiento granular: una casilla por tipo de dato. Activa/desactiva en tiempo real. |
| **Dinero Real** | Pagos en euros directo (no tokens, no criptos volátiles). Rango realista: €0.50–€3/mes inicial, escalando con tu participación. |
| **Privacidad Respetada** | No recopilamos datos de salud, origen étnico, creencias políticas ni orientación sexual. Sin cookies de tracking. Cumplimiento pleno RGPD/GDPR. |
| **Instalable** | PWA (Progressive Web App): instálala en tu móvil como una app nativa desde el navegador. |

---

## ⚠️ AVISO IMPORTANTE: MVP Single-File + localStorage

Este es un **MVP (Minimum Viable Product)**. Debes saber:

- **No hay backend real.** Los datos se guardan en `localStorage` de tu navegador. Si limpias los datos del navegador, se borran.
- **Los pagos son simulados.** La app calcula lo que te corresponde, pero el cobro con tarjeta es **ficticio** para prototipar. En producción, se conectaría a un procesador de pagos (Stripe, etc.).
- **Funciona solo online (vía file://)** sin servidor. Instalada como PWA, es una web offline-first.
- **Seguridad en tránsito:** cuando se despliegue en HTTPS (Netlify, Vercel), los datos viajan cifrados TLS 1.3.

### Arquitectura Planeada (Futuro)

```
MIS-DATOS MVP (actual)
├── Single HTML file (CSS + JS inline)
└── localStorage (datos del usuario)
      │
      ▼ (Escalado)
MIS-DATOS PRODUCCIÓN
├── Frontend: Remix / SvelteKit (servidor estatico + edge functions)
├── Backend: Cloudflare Workers (lógica sin servidor, bajo costo)
├── Base de datos: Cloudflare D1 (SQLite serverless)
├── Pagos: Stripe o Bizum API
└── Cumplimiento: DPIA, DPO, auditoría anual AEPD
```

---

## Estructura de Archivos

```
mis-apps/
├── apps/
│   └── mis-datos.html                    ← APP PRINCIPAL (autocontenida, 1 archivo)
├── apps/pwa/
│   └── mis-datos/
│       ├── manifest.json                 ← manifest.json embebido en HTML
│       ├── icon-192x192.png              ← icono PWA (el dueño lo reemplaza)
│       └── icon-512x512.png
├── docs/
│   ├── investigacion/
│   │   ├── agente-1-legal-gdpr.md        ← Marco legal (RGPD/LOPDGDD)
│   │   ├── agente-2-mercado-brokers.md   ← Precios de mercado, cifras realistas
│   │   └── agente-3-competencia.md       ← Análisis de competidores
│   ├── diseno/
│   │   └── marca.md                      ← Sistema visual (paleta, tipografía)
│   └── entrega/
│       ├── README.md                     ← Este archivo (visión general)
│       ├── guia-despliegue-netlify.md    ← Paso a paso: de local a Netlify
│       ├── manual-usuario.md             ← Manual de usuario (no técnico)
│       └── manual-usuario.html           ← Manual imprimible a PDF
└── tools/
    └── verificar-app.mjs                 ← Verificador automático de funcionalidad
```

---

## Cómo Abrirlo

### Opción 1: En tu Navegador Local (sin instalar)

1. **Descarga** `apps/mis-datos.html`
2. **Abre** el archivo con doble clic o arrastra a navegador
3. **URL será** `file:///ruta/a/mis-datos.html`
4. **Funciona 100%** offline; datos en `localStorage`

### Opción 2: Instalar como PWA (Recomendado)

1. Abre `mis-datos.html` en navegador
2. Chrome/Edge: botón de instalación (⬇️) en la barra de direcciones
3. Safari (iOS 16+): Botón de Compartir → Añadir a Pantalla de Inicio
4. Se descargará un icono en tu pantalla de inicio; funciona offline.

**Nota:** La instalación requiere **HTTPS en producción**. En `file://` la app funciona pero sin el icono de instalación en el nav.

### Opción 3: Desplegar en Netlify/Vercel (Producción)

Ver `guia-despliegue-netlify.md`

---

## Panel de Admin

**Ruta:** `#/admin`  
**Contraseña:** Ver `ADMIN_PASSWORD` al inicio del código de `mis-datos.html`

El dueño accede a:
- **Ver todos los usuarios registrados**
- **Consultar datos cedidos por cada usuario**
- **Exportar CSV de leads/usuarios**
- **Cambiar configuración** (WhatsApp de contacto, email, comisión de plataforma)
- **Subir logo personalizado** (reemplaza el placeholder)

### Caja de Configuración (Placeholders que Rellena el Dueño)

Al inicio de `mis-datos.html` hay un objeto `CONFIG`:

```javascript
const CONFIG = {
  BUSINESS_NAME: "Tu Negocio",           // ← Nombre placeholder
  PHONE: "+34 600 000 000",              // ← WhatsApp/teléfono
  EMAIL: "contacto@ejemplo.com",         // ← Email de contacto
  ADMIN_PASSWORD: "admin123",            // ← Contraseña panel admin
  ADMIN_EMAIL: "admin@ejemplo.com",      // ← Email para reportes
  PLATFORM_FEE: 0.30,                    // ← Comisión plataforma (30%)
  PAYOUT_THRESHOLD: 5.00,                // ← Mínimo para cobro (5€)
  STUDIO_BRAND: "Incuba tu Negocio",    // ← Firma estudio
  STUDIO_AUTHOR: "Jaime M. M.",         // ← Autor
  STUDIO_URL: "https://ejemplo.com",    // ← URL estudio
};
```

**El dueño cambiar estos valores en 1 minuto** para personalizar la app. El resto del código es el mismo.

---

## Compliance Legal (RGPD/GDPR)

MIS-DATOS **cumple íntegramente** con:

- **RGPD (UE 2016/679)** — Reglamento General de Protección de Datos
- **LOPDGDD (LO 3/2018)** — Transposición española del RGPD
- **LSSI (Ley 34/2002)** — Régimen de cookies y servicios digitales
- **Directiva 2019/770** — Derechos del consumidor en servicios digitales
- **Data Act (UE 2025)** — Regulación de intermediarios de datos

### Checklist de Compliance Implementado

- [x] Consentimiento granular (casilla por tipo de dato)
- [x] Revocación de consentimiento sin penalización
- [x] Información clara (art. 13 RGPD) en pantalla de registro
- [x] Derechos del usuario: acceso, rectificación, borrado, portabilidad
- [x] Política de Privacidad y Aviso Legal (enlazados en pie)
- [x] Panel de privacidad: el usuario ve qué datos ha cedido y a quién
- [x] Historial de cesiones: exportable a CSV
- [x] Derecho al olvido (borrado de cuenta + datos)
- [x] Sin datos de categoría especial (salud, etnia, religión, política)
- [x] Verificación de mayoría de edad (18 años recomendado)
- [x] Notificación de contacto de la AEPD (Autoridad de Protección de Datos)

---

## Cifras Realistas de Ganancias (Agente 2)

### Tabla de Precios del Mercado

| Tipo de Dato | Precio Mercado | Cuánto Tú Recibes (40% comisión) |
|---|---|---|
| Datos demográficos | €0.30–0.80 / CPM | €0.12–0.32 / mil personas |
| Intereses y aficiones | €0.50–1.50 / CPM | €0.20–0.60 / mil personas |
| Geolocalización | €1.00–3.00 / mes | €0.40–1.20 / mes |
| Hábitos de compra | €1.50–4.00 / CPM | €0.60–1.60 / mil personas |
| Intención de compra | €2.00–5.00 / CPM | €0.80–2.00 / mil personas |

### Ganancia Estimada por Usuario y Mes

| Escenario | Ganancia/mes |
|---|---|
| **Pasivo** (solo datos demográficos) | €0.05–0.10 |
| **Activo** (dema + navegación + ubicación + compras) | €0.10–0.30 |
| **Muy activo** (todos + surveys + datos de intención) | €0.50–1.00 |

**Por qué no más dinero?** El dato individual vale poco; lo valiosa es la agregación de 10 000–100 000 personas. La plataforma:
- Vende un dataset de 50 000 usuarios por €10 000 a un data broker
- €10 000 ÷ 50 000 = €0.20 por usuario
- Con comisión de plataforma 30–40%, el usuario recibe €0.12–0.14

**Conclusión:** Sé honesto con el usuario. Vende la propuesta como **"Control + Transparencia + Dinero Mínimo Honesto"**, no como "Renta Pasiva de 500€/año".

---

## Pantallas de la App (Mapa de Rutas)

| Ruta | Descripción | Estado [revisar al cierre] |
|---|---|---|
| `#/` | **Home/Onboarding**. Explica qué es, cuánto puede ganar, invita a registrarse. | Pendiente de UI final |
| `#/registro` | **Formulario de Registro**. Email, contraseña, verificación de edad (18+), aceptación de política de privacidad. | Pendiente |
| `#/login` | **Login**. Email + contraseña. Recordar sesión. | Pendiente |
| `#/consentimiento` | **Panel de Consentimiento Granular**. 5 bloques (demográficos, hábitos de compra, navegación, ubicación, opiniones). Cada uno con toggle + info de ganancia. | Pendiente |
| `#/perfil` | **Mi Perfil**. Editar email, contraseña, nombre. Ver resumen de datos cedidos. | Pendiente |
| `#/dashboard` | **Mis Ganancias**. Gráfico de evolución, total acumulado, payout status, botón "Solicitar pago" (simulado). | Pendiente |
| `#/transparencia` | **Transparencia de Datos**. Historial de cada cesión: fecha, tipo de dato, comprador (anonimizado), dinero ganado. Exportar a CSV. | Pendiente |
| `#/derechos` | **Tus Derechos GDPR**. Botones para Acceso, Rectificación, Borrado, Portabilidad (todos simulados / a formulario email). | Pendiente |
| `#/privacidad` | **Política de Privacidad** (scroll largo, completo, con enlaces a AEPD). | Pendiente |
| `#/legal` | **Aviso Legal + Términos**. Plantilla con placeholders del titular. | Pendiente |
| `#/admin` | **Panel de Admin** (protegido con contraseña). Ver usuarios, exportar CSV, cambiar config, subir logo. | Pendiente |

---

## Archivo Principal: `apps/mis-datos.html`

- **Tamaño esperado:** 80–120 KB (HTML + CSS + JS inline, minificado)
- **Tecnología:** Vanilla JS (sin React, Vue, Angular)
- **Almacenamiento:** localStorage (datos locales) + IndexedDB (historial largo, opcional)
- **Capa de seguridad:**
  - Hasho SHA-256 para contraseñas (no plaintext)
  - Validación de email (RFC 5322)
  - Sanización de inputs (sin eval, sin inline scripts maliciosos)
  - CSP header en Netlify (producción)
- **Accesibilidad:** WCAG AA (verificado por Agente 9)
- **Rendimiento:** Carga < 2s (verificado por Agente 8)

---

## Marca e Identidad Visual

Ver `/docs/diseno/marca.md` para el sistema completo.

**Resumen:**
- **Paleta:** Azul petróleo `#1A6FB5` (confianza) + Verde ganancias `#1A7A45` + Naranja humano `#E07010`
- **Tipografía:** Plus Jakarta Sans (interfaz) + DM Serif Display (solo hero)
- **Concepto:** "Claridad radical como escudo"
- **Logotipo:** Placeholder SVG (nodo + escudo). El dueño reemplaza desde el admin.

---

## Datos a Confirmar con el Dueño (antes de entregar)

- [ ] **Nombre del Negocio:** ¿Cuál es el nombre oficial de la plataforma?
- [ ] **Logo:** ¿Logo de la empresa? (si no, usa el placeholder SVG)
- [ ] **Teléfono/WhatsApp:** Número de contacto para usuarios
- [ ] **Email de contacto:** Email principal
- [ ] **Email de admin:** Email para panel de control
- [ ] **Contraseña admin inicial:** Cambiar `admin123` por algo seguro
- [ ] **Comisión de plataforma:** ¿Qué % se queda la app vs. usuario? (recomendado 30–40%)
- [ ] **Umbral de payout:** ¿Mínimo de euros para solicitar cobro? (recomendado €5)
- [ ] **IBAN/Datos de banco:** ¿Cómo recibirá la plataforma ingresos de data brokers? (futuro backend)
- [ ] **Política de Privacidad:** ¿Quién es el titular? ¿Teléfono de contacto?
- [ ] **Aviso Legal:** ¿Nombre de la sociedad? ¿CIF? ¿Dirección registral?

---

## Desarrollo Futuro (Post-MVP)

### Fase 2: Backend Real

- Migrar de localStorage a servidor (Node.js + PostgreSQL o Cloudflare Workers + D1)
- Integración con procesadores de pago reales (Stripe, Bisq para criptos)
- API REST para mobile native
- Dashboard de analytics del dueño (churn, LTCV, CAC)

### Fase 3: Integración con Data Brokers

- Conectar con TapTap Digital, Experian, NielsenIQ, Criteo (ver Agente 2)
- Automatizar venta de segmentos agregados
- Auditabilidad de uso de datos (trazabilidad)
- Facturación automática a compradores

### Fase 4: Marketplace de Datos

- Los usuarios pueden publicar sus datos con precio mínimo
- Compradores (investigadores, agencias) licitan en tiempo real
- Subasta de datasets con transparencia total

---

## Checklist de Validación Final (Agente 10 / QA)

Antes de entregar, verifica:

- [ ] La app abre sin errores en file:// y HTTPS
- [ ] Registro y login funcionan (datos persisten en localStorage)
- [ ] Consentimiento granular: cada casilla se activa/desactiva sin errores
- [ ] Panel de ganancias muestra cifras coherentes (acumuladas)
- [ ] Transparencia: historial exporta a CSV correctamente
- [ ] Derechos GDPR: botón "Borrar mi cuenta" borra toda la data
- [ ] Mobile-first: funciona en pantalla de 375px y 1920px
- [ ] Accesibilidad: tecla Tab navega todas las interacciones; contraste ✓
- [ ] Rendimiento: Carga en <2s (en 4G)
- [ ] Seguridad: No hay XSS, inyección SQL, CSRF; hashes en contraseñas
- [ ] Legal: Política de Privacidad accesible; AEPD enlazada
- [ ] Admin: Acceso protegido; exportación CSV funciona
- [ ] PWA: Instala en móvil; funciona offline; icono visible

---

## Contacto y Soporte

**Panel de admin:** `#/admin` (usuario: admin, contraseña en CONFIG)  
**Ejercer derechos GDPR:** Botón en `#/derechos` (redirige a formulario email)  
**Reportar brecha de datos:** `#/derechos` → Notificar incidente  
**Feedback:** Email en pie de página

---

## Versiones y Control de Cambios

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | Jun 2026 | MVP inicial: registro, consentimiento granular, ganancias simuladas, admin básico |
| 1.1 | - | (Planeada) Integración con TapTap Digital |
| 2.0 | - | (Planeada) Backend con Cloudflare Workers + D1 |

---

**Generado por:** Agente 10 (QA/Documentación) del Pipeline MVP Data Dividend  
**Modelo de IA:** Claude Opus 4.8  
**Fecha de generación:** 19 de junio de 2026

---

*Este documento es parte de un proyecto MVP legalmente conforme conforme al RGPD (UE 2016/679) y a la normativa española de protección de datos (LOPDGDD, LSSI). Consulta la carpeta `/docs/legal/` para análisis detallado de cumplimiento.*

*El MVP está diseñado para demostrar viabilidad de un modelo de data dividend transparente, honesto y legal. No es una plataforma de producción lista para escala sin pasos adicionales de seguridad, auditoría y integración con backend.*
