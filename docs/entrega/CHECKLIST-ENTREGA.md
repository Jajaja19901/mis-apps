# Entrega — App de cesión voluntaria de datos con reparto de ganancias (`mis-datos`)

> Resumen de cierre del pipeline de 10 agentes. La app pasa el verificador automático
> (`tools/verificar-app.mjs`) en **`✅ APTO` con 16/16 tests** y ha superado las auditorías de
> seguridad (veto levantado), rendimiento (<2 s) y accesibilidad (WCAG AA).

## 1. Archivos entregados

| Ruta | Qué es |
|---|---|
| `apps/mis-datos.html` | La app (single-file). Ábrela con doble clic (`file://`). |
| `apps/manifest.webmanifest` · `apps/sw.js` | PWA de la app canónica (iconos en SVG data-URI). |
| `apps/pwa/mis-datos/` | Versión **desplegable** (index.html + manifest + sw + iconos PNG). |
| `docs/investigacion/` | Research: legal (RGPD/LOPDGDD/LSSI), mercado de brokers, competencia. |
| `docs/arquitectura/plano-mvp.md` | Plano técnico + 16 criterios de aceptación. |
| `docs/diseno/` | Sistema de marca + mockups UX. |
| `docs/legal/` | Política de privacidad, términos y aviso de cookies. |
| `docs/copy.md` | Todos los textos del embudo. |
| `docs/revision/` | Informes de seguridad, rendimiento y accesibilidad. |
| `docs/entrega/` | README, guía de despliegue Netlify, manual de usuario y este documento. |

## 2. Checklist de criterios de aceptación (verificados clic a clic)

| # | Criterio | Estado |
|---|---|---|
| 1 | Home carga y muestra propuesta + CTA | ✅ |
| 2 | Se puede usar sin ceder datos | ✅ |
| 3 | Consentimiento: todos los toggles OFF por defecto | ✅ |
| 4 | No guarda consentimiento sin casilla legal | ✅ |
| 5 | Activar categoría + casilla + edad → queda activa | ✅ |
| 6 | Dashboard muestra saldo/desglose tras consentir | ✅ |
| 7 | Responder encuesta suma al saldo | ✅ |
| 8 | Transparencia muestra cesión o estado vacío | ✅ |
| 9 | Descargar mis datos existe y actúa | ✅ |
| 10 | Revocar consentimiento NO pone saldo a 0 | ✅ |
| 11 | Borrar cuenta pide confirmación (2 pasos) y limpia | ✅ |
| 12 | Cobrar muestra aviso de pago simulado | ✅ |
| 13 | Las 3 páginas legales renderizan | ✅ |
| 14 | `#/admin` pide contraseña y entra con `ADMIN_PASSWORD` | ✅ |
| 15 | Lanzar campaña en admin genera cesión/transparencia | ✅ |
| 16 | El pie muestra la firma del estudio | ✅ |

## 3. Filosofía `CLAUDE.md`

- ✅ Un solo archivo HTML autocontenido, mobile-first, sin librerías pesadas.
- ✅ Panel de admin en `#/admin` con `ADMIN_PASSWORD`.
- ✅ Consentimiento + casilla de política + páginas legales enlazadas en el pie.
- ✅ Firma del estudio: "Incuba tu Negocio · por Jaime M. M.".
- ✅ PWA instalable (manifest + service worker, favicon = emblema).
- ✅ Contenido real (cero "lorem ipsum").
- ✅ Cobro y cesión **simulados** y avisados (banner + dashboard + legales).
- ✅ Datos de categoría especial (art. 9) **excluidos**.
- ✅ Nombre, marca, contacto y datos legales = **placeholders neutros** (nada inventado).

## 4. ⚠️ Datos que debes rellenar (placeholders)

Edita la caja **`CONFIG`** al principio de `apps/mis-datos.html` (≈ línea 341):

| Campo | Valor actual (placeholder) | Qué poner |
|---|---|---|
| `BUSINESS_NAME` | "Tu Negocio de Datos" | El nombre comercial real |
| `ADMIN_PASSWORD` | "cambia-esto-1234" | Una contraseña fuerte |
| `WHATSAPP` / `EMAIL` / `CIUDAD` | placeholders | Tus datos de contacto |
| Titular legal | `[NOMBRE_TITULAR]`, `[NIF]`, `[DIRECCIÓN]`, `[TELÉFONO]` | Datos del responsable (política/términos) |
| `PCT_USUARIO` | `0.5` (50 %) | El % real que repartes al usuario |
| `UMBRAL_RETIRO` | `5` € | Mínimo para cobrar |
| Cifras de tiers | 0,30 / 3 / 12 €/mes | Confirmar (mercado real: 0,10–0,50 €/mes pasivo) |
| Edad mínima | **18** | Confirmar con asesor (contrato oneroso → 18; consentimiento de datos en España sería 14) |

> Si actualizas el manifest, recuerda cambiar `BUSINESS_NAME`/`short_name` también en
> `apps/manifest.webmanifest` y `apps/pwa/mis-datos/manifest.webmanifest`.

## 5. Cómo usarla y desplegarla

- **Abrir:** doble clic en `apps/mis-datos.html` (funciona offline, sin instalar nada).
- **Panel del dueño:** ve a `#/admin` e introduce `ADMIN_PASSWORD`.
- **Instalar como app (PWA):** requiere HTTPS. Sube la carpeta `apps/pwa/mis-datos/` a Netlify
  (ver `docs/entrega/guia-despliegue-netlify.md`) y usa "Añadir a pantalla de inicio".

## 6. Avisos importantes

- Es un **MVP sin backend**: los datos viven en el `localStorage` del dispositivo y los cobros
  y cesiones son **simulados** (no se transfiere dinero ni se venden datos de verdad todavía).
- Antes de operar de verdad hace falta: backend (Cloudflare Workers + D1 previsto), contratos
  art. 26/28 con los compradores, una **DPIA/EIPD** previa y revisión legal de los textos.
