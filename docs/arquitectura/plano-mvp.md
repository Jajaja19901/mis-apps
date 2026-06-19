# Plano técnico del MVP — App de cesión voluntaria de datos con reparto de ganancias

> **FASE 1 del pipeline.** Documento de arquitectura y criterios de aceptación que guía
> la construcción de `apps/mis-datos.html`. Consolida los hallazgos de FASE 0
> (investigación legal, de mercado y competitiva) en decisiones concretas.
>
> Nota: el Arquitecto automático se demoró sin entregar; la Dirección asumió el rol y
> fijó estas decisiones, que el constructor (Opus) está implementando.

## 1. Producto y propuesta de valor honesta

App donde el usuario **decide qué categorías de sus datos comparte**, da **consentimiento
granular**, y recibe una parte del dinero cuando esos datos se monetizan con clientes B2B.

- **Qué SÍ promete:** control total, transparencia radical (ver qué se comparte, con quién y
  a qué precio), y reparto real de la parte que corresponde al usuario.
- **Qué NO promete:** "renta pasiva" ni hacerse rico. La cesión pasiva real son **céntimos**
  (0,10–0,50 €/mes). Esa honestidad es el diferenciador (los competidores que mintieron, murieron).
- **MVP sin backend:** single-file HTML/JS + `localStorage`, funciona desde `file://`. Los
  cobros son **simulados**. Migración futura prevista a **Cloudflare Workers + D1**.

## 2. Criterios de aceptación (se prueban con `tools/verificar-app.mjs`)

1. La home carga sin errores y muestra la propuesta de valor + CTA de empezar.
2. La app se puede usar **sin ceder ningún dato** (entrar al dashboard con todo OFF).
3. La pantalla de consentimiento tiene **todos los toggles OFF por defecto**.
4. **No** se puede guardar el consentimiento sin marcar la casilla "He leído la Política de Privacidad".
5. Activar una categoría + casilla + guardar la deja registrada (visible como activa).
6. El dashboard muestra saldo y desglose por categoría tras dar consentimiento.
7. Responder una encuesta suma el importe al saldo.
8. La transparencia muestra al menos una cesión cuando hay consentimiento (o estado vacío).
9. El botón "Descargar mis datos" existe y dispara la exportación (JSON).
10. Revocar consentimiento desactiva la categoría pero **no** pone el saldo a 0.
11. Borrar cuenta exige confirmación en 2 pasos y limpia los datos.
12. "Cobrar" muestra el aviso de **pago simulado**.
13. Las 3 páginas legales (privacidad, términos, cookies) renderizan contenido.
14. `#/admin` sin sesión pide contraseña; con `ADMIN_PASSWORD` entra al panel.
15. Lanzar una campaña en admin genera cesiones que aparecen en transparencia.
16. El pie muestra la firma del estudio ("Incuba tu Negocio · por Jaime M. M.").

## 3. Mapa de pantallas (router hash)

| Ruta | Objetivo | CTA principal |
|---|---|---|
| `#/` | Home + registro (hero honesto, "cómo funciona", *honesty pill*) | Empezar / Usar sin ceder datos |
| `#/consentimiento` | Consentimiento granular por categoría (OFF por defecto) | Guardar consentimiento |
| `#/perfil` | Datos del usuario, categorías activas | Editar |
| `#/dashboard` | Saldo, desglose, evolución, tier, cobro simulado | Cobrar |
| `#/encuestas` | Participación activa retribuida | Responder |
| `#/transparencia` | Qué dato, qué cliente, precio y tu parte | Filtrar |
| `#/derechos` | Los 9 derechos GDPR accionables | (uno por derecho) |
| `#/legal/privacidad·terminos·cookies` | Documentos legales | — |
| `#/admin` | Panel del dueño (login) | Lanzar campaña / Export CSV |

Navegación: **barra inferior fija de 5 ítems** (Inicio · Ganancias · Perfil · Transparencia · Derechos)
en las pantallas autenticadas; oculta en home y consentimiento para no distraer del flujo crítico.

## 4. Modelo de datos (`localStorage`, prefijo `md_`)

| Clave | Forma |
|---|---|
| `md_user` | `{id, alias, email, mayorEdad, tier, fechaAlta}` |
| `md_consents` | `[{categoryId, granted, ts, formVersion, finalidad, destinatarios}]` |
| `md_earnings` | `{saldo, movimientos:[{ts, tipo, concepto, importe}]}` |
| `md_surveys_done` | `[surveyId, …]` |
| `md_rights` | `[{tipo, ts, estado}]` |
| `md_cessions` | `[{ts, cliente, categoryId, precioVenta, tuParte}]` |
| `md_admin_clients` | `[{id, nombre, sector}]` |
| `md_session_admin` | `bool` |

Catálogos de categorías y encuestas = constantes en código. El **registro de consentimiento**
guarda `ts` + `formVersion` como prueba de cargo (exigencia legal).

### Esquema equivalente para D1 (migración futura)
`users(id, alias, email, mayor_edad, tier, fecha_alta)` ·
`consents(id, user_id, category_id, granted, ts, form_version)` ·
`earnings(id, user_id, ts, tipo, concepto, importe)` ·
`cessions(id, user_id, ts, cliente, category_id, precio_venta, tu_parte)` ·
`rights(id, user_id, tipo, ts, estado)` · `clients(id, nombre, sector)`.

## 5. Catálogo de categorías (sin datos del art. 9)

`ganancia_usuario = precio_mercado × PCT_USUARIO (0,5)`

| Categoría | Ganancia estimada usuario | Tipo |
|---|---|---|
| Perfil sociodemográfico | ~0,03 €/mes | pasiva |
| Hábitos de compra | ~0,10 €/mes | pasiva |
| Navegación / intereses | ~0,06 €/mes | pasiva |
| Geolocalización / movilidad | ~0,08 €/mes | pasiva |
| Participación en encuestas | 0,15–0,50 €/encuesta | activa |

Cesión pasiva total ≈ **0,27 €/mes** (coherente con el mercado real). **Excluidas** las
categorías especiales del art. 9 (salud, ideología, biometría, orientación) por riesgo legal.

## 6. Tiers = niveles de ganancia objetivo (suben por actividad, no se pagan)

- **Free** ≈ 0,30 €/mes — cesión pasiva básica.
- **Plus** ≈ 3 €/mes — cesión completa + encuestas ocasionales.
- **Premium** ≈ 12 €/mes — cesión completa + encuestas frecuentes / paneles.

Aviso honesto permanente: sin participación activa lo normal son **céntimos**; 3 € y 12 €
exigen completar encuestas con regularidad. El tier sube solo según la ganancia acumulada.

## 7. Cumplimiento legal (de FASE 0 · agente 1)

- Base jurídica: **consentimiento explícito** (art. 6.1.a), libre y revocable.
- **Tier gratuito usable sin ceder datos** (consentimiento libre).
- Consentimiento **granular**, OFF por defecto, registrado con timestamp + versión.
- **Edad mínima 18** (contrato con contraprestación económica) — *pendiente de validar*.
- 9 derechos del interesado implementados en la UI.
- 3 documentos legales (privacidad, términos, cookies) enlazados en el pie.
- Cobros simulados claramente avisados.

## 8. Plan de fases (1–2 h/día)

1. **Insumos** (✅): investigación, marca, copy, UX, legal, PWA.
2. **Construcción del HTML único** (🔄): home+registro → consentimiento → derechos → dashboard/encuestas/transparencia → admin.
3. **Verificación automática** (`verificar-app.mjs`) hasta `✅ APTO`.
4. **Revisores en paralelo (solo informar):** seguridad (veto), rendimiento, accesibilidad → aplicar correcciones.
5. **QA final** recorriendo los criterios uno a uno.
6. **Entrega:** ensamblar PWA (`apps/pwa/mis-datos/index.html`), commit y push.

## 9. Datos a confirmar (placeholders)

`BUSINESS_NAME`, nombre del titular legal + NIF/dirección (política), WhatsApp y email de
contacto, ciudad/jurisdicción, `ADMIN_PASSWORD`, `PCT_USUARIO` (50 % propuesto), `UMBRAL_RETIRO`
(5 € propuesto), y la confirmación de las **cifras de tiers** (0,30 / 3 / 12 €/mes) y de la
**edad mínima** (18).
