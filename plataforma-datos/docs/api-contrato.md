# Contrato de API REST `/v1` — Plataforma de Datos *consent-first*

Este documento es **el contrato** que siguen el resto de ingenieros. Es **normativo**: los
nombres de campos JSON que tocan la base de datos usan **exactamente** los de
[`db/schema.sql`](../db/schema.sql), y los reportes respetan **al pie de la letra** la semántica
de [`src/k-anonimato.mjs`](../src/k-anonimato.mjs) (`K_MINIMO_LEGAL = 50`, supresión de celdas,
anti-divulgación complementaria). Lo marcado `‹PLACEHOLDER›` se fija en config/Stripe, no aquí.

---

## 0. Convenciones generales

- **Base URL**: `https://api.‹PLACEHOLDER-dominio›/v1`. La versión va **en la ruta** (`/v1`).
- **Formato**: JSON UTF-8. `Content-Type: application/json`. Fechas en **ISO-8601 UTC**
  (`2026-06-19T10:00:00Z`); en BD se guardan como `datetime('now')` (texto SQLite).
- **IDs**: todos los `id` son **UUID v4** en texto (igual que el esquema), salvo
  `logs_auditoria.id` que es entero autoincremental interno (no se expone).
- **Importes**: **siempre en céntimos** (enteros), igual que el esquema
  (`importe_centimos`, `precio_centimos`, …). Nunca decimales de euro.
- **Idempotencia**: las operaciones que cobran o crean recursos aceptan cabecera
  `Idempotency-Key: <uuid>` (se cachea en KV). Webhooks idempotentes por `event.id`.
- **Trazabilidad**: toda petición lleva/recibe `X-Request-Id`; las acciones sensibles se anotan
  en `logs_auditoria` (`actor`, `accion`, `entidad`, `entidad_id`, `detalles`, `ip_hash`).
- **Rate limiting**: por token/IP (KV). Excedido → `429` (ver formato de error).

### 0.1 Autenticación (tres planos)
| Plano | Cabecera | Quién | Requisitos |
|---|---|---|---|
| **App de consumo** | `X-App-Key: <key>` + `Authorization: Bearer <token_usuario>` | El “proyecto 1” en nombre de un usuario seudónimo | Token de usuario válido (UUID `usuarios.id`) |
| **Agencia (B2B)** | `Authorization: Bearer <jwt_agencia>` | Cliente B2B | `agencias.kyc_estado = 'verificada'` y `contrato_firmado_en` no nulo |
| **Admin / DPO** | `Authorization: Bearer <admin_token>` | Cumplimiento | `ADMIN_TOKEN` + allowlist IP ‹PLACEHOLDER› |
| **Stripe** | `Stripe-Signature: <firma>` | Stripe | Firma verificada con `STRIPE_WEBHOOK_SECRET` |

### 0.2 Formato de error (uniforme)
```json
{
  "error": {
    "codigo": "consentimiento_inexistente",
    "mensaje": "No hay consentimiento ACTIVO para este usuario y propósito.",
    "request_id": "req_3a9f...",
    "detalles": {}
  }
}
```
**Códigos HTTP usados**: `200` OK · `201` Creado · `202` Aceptado (asíncrono) · `400` petición
inválida · `401` no autenticado · `403` prohibido (p. ej. KYC pendiente) · `404` no existe ·
`409` conflicto (idempotencia / estado) · `410` recurso expirado (export) · `422` regla de
negocio (p. ej. categoría especial) · `429` rate limit · `5xx` error interno.

**Catálogo de `codigo` de error** (no exhaustivo): `auth_invalida`, `kyc_no_verificada`,
`consentimiento_inexistente`, `consentimiento_ya_revocado`, `categoria_no_permitida`,
`categoria_especial_prohibida`, `cuasi_identificador_invalido`, `segmento_no_entregable`,
`pago_requerido`, `pago_no_confirmado`, `firma_webhook_invalida`, `idempotencia_conflicto`,
`reautenticacion_requerida`, `export_expirado`, `rate_limit`.

---

# A) Contribuciones (app de consumo)

## A.1 — `POST /v1/contribuciones`
Registra una contribución **ya seudonimizada y generalizada**. El servidor **rechaza** edad
exacta, dirección o cualquier campo fuera del esquema. La BD aplica el trigger
`trg_contrib_consent_valido`: sin consentimiento ACTIVO (`proposito='venta_datos_agregados'`,
`revocado_en IS NULL`) del mismo usuario, **aborta**.

- **Auth**: App de consumo (`X-App-Key` + `Bearer token_usuario`).
- **Petición**:
```json
{
  "usuario_id": "0e8b...uuid",
  "consentimiento_id": "c1a2...uuid",
  "banda_edad": "25-34",
  "region": "Madrid",
  "genero": "F",
  "categoria": "compras_online",
  "valor": 3.0
}
```
> `categoria` **debe** existir en `categorias_permitidas`. `banda_edad`/`region`/`genero` son
> **cuasi-identificadores generalizados** (nunca fecha de nacimiento ni dirección).

- **Respuesta `201`**:
```json
{ "id": "f7c0...uuid", "recogido_en": "2026-06-19T10:00:00Z", "categoria": "compras_online" }
```
- **Errores**:
  - `422 categoria_no_permitida` — `categoria` no está en la lista blanca.
  - `422 cuasi_identificador_invalido` — banda/región no normalizada o campo prohibido presente.
  - `403 consentimiento_inexistente` — el trigger abortó (sin consentimiento activo).
  - `404` — `usuario_id` o `consentimiento_id` no existen.

## A.2 — `POST /v1/contribuciones/lote`
Igual que A.1 pero **array** (hasta ‹PLACEHOLDER: 500› ítems) para el SDK. Atómico por lote
(batch D1); si una fila viola el trigger, se reporta su índice y se rechaza solo esa o todo el
lote según `modo` (`"parcial"` | `"estricto"`, por defecto `"estricto"`).
- **Respuesta `201`**: `{ "creadas": 480, "rechazadas": [ { "indice": 12, "codigo": "..." } ] }`

## A.3 — `GET /v1/contribuciones/resumen`
Resumen **agregado del propio usuario** (para su panel): cuántas contribuciones tiene, por
categoría y su peso estimado de cara al reparto. **No** devuelve filas de otros usuarios.
- **Auth**: App de consumo (token del propio usuario).
- **Respuesta `200`**:
```json
{
  "usuario_id": "0e8b...",
  "total_contribuciones": 42,
  "por_categoria": { "compras_online": 30, "rango_gasto_mensual": 12 },
  "peso_estimado_periodo_actual": 0.0007
}
```

---

# B) Consentimiento (alta y revocación)

> `consentimientos` es un **ledger append-only**. No se actualiza ni se borra: revocar = poner
> `revocado_en`. Cada alta guarda `texto_hash` (hash del **texto exacto** mostrado),
> `politica_version`, `metodo`, e `ip_hash`/`user_agent` como evidencia.

## B.1 — `POST /v1/consentimientos`  *(alta)*
- **Auth**: App de consumo. Si el usuario es nuevo, este endpoint puede **crear el seudónimo**
  (`usuarios`) y, opcionalmente, `usuarios_contacto` con `email_hash`.
- **Petición**:
```json
{
  "usuario_id": "0e8b...uuid",
  "proposito": "venta_datos_agregados",
  "politica_version": "2026-06-01",
  "texto_mostrado": "Acepto que mis datos, agregados y anonimizados (k≥50), se vendan...",
  "metodo": "web_checkbox",
  "email": "opcional@ejemplo.com"
}
```
> El servidor calcula `texto_hash = SHA-256(texto_mostrado)` y `ip_hash = SHA-256(ip ‖ PEPPER_PII)`.
> El cliente **no** envía hashes ni IP en claro al ledger; los deriva el Worker.

- **Respuesta `201`**:
```json
{
  "id": "c1a2...uuid",
  "usuario_id": "0e8b...",
  "proposito": "venta_datos_agregados",
  "politica_version": "2026-06-01",
  "otorgado_en": "2026-06-19T10:00:00Z",
  "revocado_en": null
}
```
- **Errores**:
  - `400` — `proposito` vacío (viola `CHECK (proposito <> '')`).
  - `409` — ya existe un consentimiento ACTIVO idéntico (se devuelve el vigente, no se duplica).

## B.2 — `GET /v1/consentimientos`
Lista el historial de consentimientos del usuario autenticado (activos y revocados).
- **Respuesta `200`**: `{ "items": [ { "id": "...", "proposito": "...", "politica_version": "...", "otorgado_en": "...", "revocado_en": null } ] }`

## B.3 — `POST /v1/consentimientos/{id}/revocar`  *(revocación)*
Cierra el consentimiento: `revocado_en = now`. A partir de ahí el trigger impide nuevas
contribuciones de ese usuario para ese propósito. **No** borra contribuciones previas ya
agregadas (son anónimas), pero detiene aportaciones futuras. Se audita `consent.revocado`.
- **Auth**: App de consumo (propio usuario).
- **Petición**: *(vacío)* o `{ "motivo": "opcional, libre y sin PII" }`.
- **Respuesta `200`**:
```json
{ "id": "c1a2...", "revocado_en": "2026-06-19T11:00:00Z", "estado": "revocado" }
```
- **Errores**:
  - `404` — el consentimiento no existe o no es del usuario.
  - `409 consentimiento_ya_revocado` — ya tenía `revocado_en`.

---

# C) Derechos del interesado (RGPD arts. 15, 17, 20)

> Requieren **reautenticación** (enlace firmado de un solo uso / doble opt-in). Procesos pesados
> se **encolan** (`202` + `job_id`); el resultado se entrega vía R2 «EXPORTS» con URL efímera.

## C.1 — `GET /v1/yo`  *(acceso, art. 15)*
Devuelve **todos los datos del propio usuario** en JSON, legible al instante (si es pequeño).
- **Auth**: App de consumo (reautenticado).
- **Respuesta `200`**:
```json
{
  "usuario": { "id": "0e8b...", "creado_en": "...", "estado": "activo", "payout_estado": "pendiente" },
  "contacto": { "email_hash": "9f86...", "email_presente": true },
  "consentimientos": [ { "id": "...", "proposito": "...", "otorgado_en": "...", "revocado_en": null } ],
  "contribuciones": [ { "id": "...", "categoria": "compras_online", "banda_edad": "25-34", "region": "Madrid", "recogido_en": "..." } ],
  "repartos": [ { "periodo": "2026-05", "importe_centimos": 137, "estado": "pagado" } ]
}
```
> Se devuelve `email_hash` (no el email en claro); `email_presente` indica si hay `email_cifrado`.

## C.2 — `POST /v1/yo/portabilidad`  *(portabilidad, art. 20)*
Genera un **export estructurado y portable** (JSON/CSV en un ZIP) y lo encola.
- **Auth**: App de consumo (reautenticado).
- **Respuesta `202`**: `{ "job_id": "job_...", "estado": "encolado" }`
- **Seguimiento**: `GET /v1/yo/portabilidad/{job_id}` →
  `{ "estado": "listo", "url": "https://.../exports/...zip?firma=...", "expira_en": "2026-06-20T11:00:00Z" }`
  - `410 export_expirado` si el enlace ya caducó (objeto R2 efímero).

## C.3 — `DELETE /v1/yo`  *(supresión, art. 17 — “derecho al olvido”)*
Da de **baja** al usuario: `usuarios.estado='baja'` y borrado en cascada
(`usuarios_contacto`, `consentimientos`, `contribuciones` por `ON DELETE CASCADE`). Los
**reportes ya entregados son agregados anónimos** y **se conservan** (no contienen al usuario).
Se audita `usuario.baja` (sin PII en `detalles`).
- **Auth**: App de consumo (reautenticado).
- **Petición**: `{ "confirmar": true }`.
- **Respuesta `202`**: `{ "job_id": "job_...", "estado": "encolado", "nota": "Borrado en cascada; reportes agregados anónimos se conservan." }`
- **Errores**: `400` si `confirmar` no es `true`; `401 reautenticacion_requerida`.

---

# D) Catálogo de segmentos (agencias)

> Solo agencias con KYC **verificada**. El catálogo trabaja **siempre con agregados/recuentos**;
> jamás expone filas individuales. Las dimensiones disponibles son exactamente los
> cuasi-identificadores del esquema: `region`, `banda_edad`, `genero`, y la `categoria`
> (de `categorias_permitidas`).

## D.1 — `GET /v1/segmentos`
Lista las **dimensiones y categorías** disponibles para construir un segmento.
- **Auth**: Agencia.
- **Respuesta `200`**:
```json
{
  "dimensiones": ["region", "banda_edad", "genero"],
  "categorias": [
    { "categoria": "compras_online", "descripcion": "Frecuencia / interés de compra online (no especial)" },
    { "categoria": "preferencia_ocio", "descripcion": "Preferencias de ocio declaradas (no especial)" },
    { "categoria": "rango_gasto_mensual", "descripcion": "Banda de gasto mensual declarada (no especial)" }
  ],
  "valores_ejemplo": {
    "region": ["Madrid", "Cataluña", "Andalucía", "..."],
    "banda_edad": ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
    "genero": ["F", "M", "X"]
  },
  "k_minimo_legal": 50
}
```
> `k_minimo_legal` se devuelve **siempre** = 50 (`K_MINIMO_LEGAL`); la agencia no puede bajarlo.

## D.2 — `GET /v1/segmentos/categorias`
Atajo: solo la lista blanca `categorias_permitidas` (categoría + descripción). `es_especial`
es siempre 0 por diseño (no se expone).

---

# E) Preview de segmento (sin datos; solo si es entregable)

## E.1 — `POST /v1/segmentos/preview`
Comprueba si un segmento **sería entregable** y su **tamaño aproximado**, **sin** generar ni
devolver dato agregado alguno. Es una réplica de la **puerta dura** del motor
(`nTotal ≥ k`): cuenta **usuarios DISTINTOS** (no filas) del segmento.

- **Auth**: Agencia.
- **Petición** (misma forma que la `definicion` del motor):
```json
{
  "definicion": {
    "filtros": { "region": "Madrid", "categoria": "compras_online" },
    "dimensiones": ["banda_edad"],
    "metrica": "valor"
  }
}
```
- **Respuesta `200` (entregable)**:
```json
{
  "entregable": true,
  "n_usuarios": 1840,
  "k_aplicado": 50,
  "celdas_estimadas_entregables": 4,
  "celdas_estimadas_suprimidas": 2,
  "precio_estimado_centimos": 49900
}
```
- **Respuesta `200` (NO entregable)** — *misma forma que el motor cuando `nTotal < k`*:
```json
{
  "entregable": false,
  "motivo": "segmento con 31 usuarios (< k=50)",
  "n_usuarios": 31
}
```
> **Privacidad del preview**: cuando NO es entregable, se devuelve el recuento del **segmento
> total** (la propia puerta del motor lo usa en su mensaje), nunca recuentos por celda. Cuando
> sí es entregable, se devuelven **estimaciones** de cuántas celdas saldrían/se suprimirían,
> **sin** sus valores. Para evitar sondeos, este endpoint está **rate-limited** de forma estricta
> y cada preview se anota en `logs_auditoria` (`accion='segmento.preview'`).

---

# F) Compra / generación de reporte (agencias)

> Secuencia: **(1)** la agencia crea la compra → se abre **Stripe Checkout**; **(2)** Stripe
> confirma por **webhook** (sección G) → `w-pagos` crea la `transacciones` con el reparto 70/30;
> **(3)** `w-reportes` ejecuta el **motor** y, si es entregable, persiste en `reportes` y entrega
> el agregado por R2. **Nunca** se genera reporte sin transacción `pagada`.

## F.1 — `POST /v1/reportes`  *(inicia compra)*
- **Auth**: Agencia (KYC verificada). Acepta `Idempotency-Key`.
- **Petición**:
```json
{
  "definicion_segmento": {
    "filtros": { "region": "Madrid", "categoria": "compras_online" },
    "dimensiones": ["banda_edad"],
    "metrica": "valor"
  }
}
```
> `definicion_segmento` es **idéntica** a la `definicion` del motor y se guardará tal cual en
> `reportes.definicion_segmento` (JSON). El servidor **revalida** la entregabilidad antes de
> cobrar (puerta `nTotal ≥ 50`); si ya no es entregable → `422 segmento_no_entregable` y no se
> crea Checkout.
- **Respuesta `201`**:
```json
{
  "reporte_id": "r5d4...uuid",
  "estado": "pendiente_pago",
  "precio_centimos": 49900,
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_...",
  "transaccion_id": "t9e8...uuid"
}
```
> El `reporte` aún **no** existe en la tabla `reportes` (que exige `k_aplicado`/`n_usuarios` y el
> `CHECK k≥50`): se materializa en F.3 tras el pago. `reporte_id`/`transaccion_id` son las
> referencias de seguimiento.
- **Errores**:
  - `403 kyc_no_verificada`.
  - `422 segmento_no_entregable` — el motor declararía `nTotal < 50`.
  - `422 categoria_no_permitida` — filtro sobre categoría fuera de la lista blanca.
  - `409 idempotencia_conflicto` — misma `Idempotency-Key` con cuerpo distinto.

## F.2 — `GET /v1/reportes/{reporte_id}`  *(estado + entrega)*
Devuelve el estado y, cuando esté listo, el **enlace de descarga** del agregado (R2). El cuerpo
del reporte es **solo agregados** (espejo de la salida del motor): `celdas` con dimensiones +
`n_usuarios` por celda + `media_<metrica>`, más `celdas_suprimidas` y `resultado_hash`.
- **Auth**: Agencia (dueña del reporte).
- **Respuesta `200` (entregado)**:
```json
{
  "reporte_id": "r5d4...",
  "estado": "entregado",
  "k_aplicado": 50,
  "n_usuarios": 1840,
  "generado_en": "2026-06-19T12:00:00Z",
  "resultado_hash": "a1b2c3d4",
  "definicion_segmento": { "filtros": {"region":"Madrid","categoria":"compras_online"}, "dimensiones":["banda_edad"], "metrica":"valor" },
  "resultado": {
    "celdas": [
      { "banda_edad": "25-34", "n_usuarios": 820, "media_valor": 3.21 },
      { "banda_edad": "35-44", "n_usuarios": 610, "media_valor": 2.98 }
    ],
    "celdas_suprimidas": 2
  },
  "descarga_url": "https://.../reportes/r5d4....json?firma=...",
  "descarga_expira_en": "2026-06-19T13:00:00Z"
}
```
> **Garantía**: el JSON nunca contiene `usuario_id` ni filas individuales (lo asegura el motor y
> lo verifica `k-anonimato.test.mjs`). Cada `celda` entregada tiene `n_usuarios ≥ 50`.
- **Estados posibles**: `pendiente_pago` · `pagado_generando` · `entregado` · `no_entregable` ·
  `anulado` (mapea a `reportes.estado` ∈ `generado|entregado|anulado` una vez persistido).
- **Respuesta `200` (no entregable, ya reembolsado)**:
```json
{ "reporte_id": "r5d4...", "estado": "no_entregable", "motivo": "segmento con 41 usuarios (< k=50)", "reembolso": "emitido" }
```

## F.3 — *(interno, no expuesto)* materialización tras el pago
No es un endpoint público: lo dispara el webhook (G.1). `w-reportes`:
1. Carga las `contribuciones` del segmento (seudónimas).
2. Llama `generarReporteAgregado(contribuciones, definicion_segmento, { k: 50 })`.
3. Si `entregable=false` → marca `no_entregable`, **reembolsa** la `transacciones`
   (`estado='reembolsada'`) y **no** inserta en `reportes`.
4. Si `entregable=true` → firma con **HMAC** (`HMAC_REPORTE`) el `resultado_hash`, hace
   `INSERT INTO reportes(...)` con `k_aplicado`, `n_usuarios` (ambos del motor; la BD revalida
   `CHECK ≥ 50`), sube el JSON a R2 «REPORTES» y pasa `reportes.estado='entregado'`.
5. Anota `reporte.generado` en `logs_auditoria`.

---

# G) Webhooks de Stripe

> Endpoint **público** que recibe eventos de Stripe. **Obligatorio** verificar
> `Stripe-Signature` con `STRIPE_WEBHOOK_SECRET`. **Idempotente** por `event.id` (KV). Maneja
> tanto el **cobro a la agencia** (Checkout/PaymentIntent) como el **reparto a usuarios**
> (Connect transfers).

## G.1 — `POST /v1/webhooks/stripe`
- **Auth**: firma Stripe (no JWT).
- **Eventos relevantes** y efecto:

| `event.type` | Efecto en el sistema |
|---|---|
| `checkout.session.completed` / `payment_intent.succeeded` | Crea/actualiza `transacciones`: `importe_centimos`, `comision_plataforma_centimos` (= 70 %), `pool_usuarios_centimos` (= 30 %), `stripe_payment_intent`, `estado='pagada'`. Dispara F.3 (generación del reporte). |
| `payment_intent.payment_failed` | `transacciones.estado='fallida'`; el reporte queda `pendiente_pago`/`anulado`. |
| `charge.refunded` | `transacciones.estado='reembolsada'` (caso “segmento no entregable” o devolución). |
| `transfer.created` / `transfer.paid` | Actualiza `repartos.stripe_transfer_id` y `repartos.estado='pagado'`. |
| `transfer.failed` | `repartos.estado='fallido'` (se reintenta en el siguiente cron). |
| `account.updated` (Connect) | Actualiza `usuarios.payout_estado` (`pendiente|verificado|restringido`) y `usuarios.stripe_account_id`. |

- **Petición**: *payload* de Stripe (no lo definimos nosotros).
- **Respuesta `200`**: `{ "recibido": true }` (siempre 200 si la firma es válida y el evento se
  encoló/procesó; Stripe reintenta si no recibe 200).
- **Errores**:
  - `400 firma_webhook_invalida` — firma incorrecta (Stripe reintentará).
  - `409 idempotencia_conflicto` — `event.id` ya procesado (se responde `200` igualmente para no
    forzar reintentos; el conflicto se registra en auditoría).

> **Cálculo 70/30** (lo hace `w-pagos`, no el cliente): dado `importe_centimos`,
> `pool_usuarios_centimos = round(importe_centimos * 0.30)` y
> `comision_plataforma_centimos = importe_centimos − pool_usuarios_centimos`, de modo que su
> suma sea **exactamente** `importe_centimos` (lo exige el `CHECK` de `transacciones`).

## G.2 — `POST /v1/agencias/{id}/checkout-session`  *(auxiliar)*
Crea una Stripe **Checkout Session** para un `reporte_id` ya iniciado (reintento de pago).
- **Auth**: Agencia. **Respuesta `201`**: `{ "checkout_url": "https://checkout.stripe.com/..." }`.

## G.3 — `POST /v1/usuarios/{id}/connect-onboarding`  *(auxiliar)*
Genera el enlace de **onboarding de Stripe Connect** para que el usuario pueda cobrar su
reparto (alta de `stripe_account_id`).
- **Auth**: App de consumo (propio usuario, reautenticado).
- **Respuesta `201`**: `{ "onboarding_url": "https://connect.stripe.com/setup/..." }`.

---

# H) Agencias — alta y KYC

## H.1 — `POST /v1/agencias`  *(alta / registro B2B)*
Crea la agencia en estado `kyc_estado='pendiente'`. No puede comprar hasta verificarse.
- **Auth**: pública con captcha ‹PLACEHOLDER› (registro inicial).
- **Petición**:
```json
{ "razon_social": "Agencia ‹PLACEHOLDER› S.L.", "cif": "B12345678", "email": "compras@ejemplo.com", "pais": "ES" }
```
- **Respuesta `201`**:
```json
{ "id": "a3f2...uuid", "razon_social": "Agencia ‹PLACEHOLDER› S.L.", "kyc_estado": "pendiente", "creado_en": "..." }
```

## H.2 — `GET /v1/agencias/yo`
Estado de la propia agencia (KYC, contrato, `stripe_customer_id`).
- **Auth**: Agencia. **Respuesta `200`**: `{ "id":"...", "kyc_estado":"verificada", "contrato_firmado_en":"...", "stripe_customer_id":"cus_..." }`.

---

# I) Admin / cumplimiento (DPO)

> Acceso restringido (`ADMIN_TOKEN` + allowlist). Toda acción se anota en `logs_auditoria` con
> `actor='admin:<id>'`. **Solo lectura** sobre datos personales; las únicas escrituras son
> KYC de agencias y versiones de política.

## I.1 — `POST /v1/admin/agencias/{id}/kyc`
Verifica o rechaza una agencia: `kyc_estado ∈ {verificada, rechazada}` y, si se verifica, fija
`contrato_firmado_en`.
- **Petición**: `{ "kyc_estado": "verificada", "contrato_firmado_en": "2026-06-19T09:00:00Z" }`.
- **Respuesta `200`**: `{ "id": "a3f2...", "kyc_estado": "verificada" }`.
- **Errores**: `422` si `kyc_estado` no está en el enum del esquema.

## I.2 — `GET /v1/admin/auditoria`
Consulta `logs_auditoria` (filtros: `actor`, `accion`, `entidad`, `entidad_id`, rango de fechas;
paginado). **Append-only**: no hay endpoints de edición/borrado.
- **Respuesta `200`**:
```json
{
  "items": [
    { "id": 1024, "actor": "sistema", "accion": "reporte.generado", "entidad": "reportes", "entidad_id": "r5d4...", "creado_en": "...", "detalles": { "k_aplicado": 50, "n_usuarios": 1840 } }
  ],
  "siguiente_cursor": "..."
}
```

## I.3 — `GET /v1/admin/metricas`
KPIs **agregados** del negocio (sin PII): nº usuarios activos, contribuciones por categoría,
reportes entregados, ingresos por periodo, pool repartido. Útil para cumplimiento y operación.
- **Respuesta `200`**:
```json
{
  "usuarios_activos": 12840,
  "reportes_entregados_mes": 36,
  "ingresos_centimos_mes": 1796400,
  "pool_usuarios_centimos_mes": 538920,
  "consentimientos_activos": 12810,
  "revocaciones_mes": 31
}
```

## I.4 — `POST /v1/admin/reparto/{periodo}/ejecutar`  *(disparo manual del reparto)*
Lanza el reparto del periodo `YYYY-MM` (idéntico al cron). **Idempotente** gracias a
`UNIQUE(periodo, usuario_id)`: reejecutar no duplica pagos.
- **Petición**: `{ "dry_run": true }` (simulación: calcula sin crear transfers).
- **Respuesta `200`**:
```json
{
  "periodo": "2026-05",
  "pool_total_centimos": 538920,
  "usuarios_con_reparto": 9120,
  "creados": 9120,
  "ya_existentes": 0,
  "dry_run": true
}
```
- **Reglas del reparto** (las implementa `w-reparto`):
  - `pool_total = Σ pool_usuarios_centimos` de `transacciones` con `estado='pagada'` del periodo.
  - `peso_contribucion(u)` = proporción de la contribución de `u` que **entró en reportes
    entregados** ese periodo (0..1). Se guarda en `repartos.peso_contribucion`.
  - `importe_centimos(u) = floor(pool_total * peso)`; el **redondeo residual** (céntimos sueltos
    por truncar) se asigna de forma determinista para que `Σ importe_centimos ≤ pool_total`.
  - Una fila por `(periodo, usuario_id)`; transfer vía Connect solo si
    `usuarios.payout_estado='verificado'`.

## I.5 — `GET /v1/admin/reparto/{periodo}`
Estado del reparto de un periodo: filas de `repartos` con `importe_centimos`,
`peso_contribucion`, `estado` (`pendiente|pagado|fallido`) y totales.

---

## J) Resumen de endpoints

| # | Método | Ruta | Auth | Qué hace |
|---|---|---|---|---|
| A.1 | POST | `/v1/contribuciones` | App | Alta de contribución generalizada |
| A.2 | POST | `/v1/contribuciones/lote` | App | Alta por lote |
| A.3 | GET | `/v1/contribuciones/resumen` | App | Resumen del propio usuario |
| B.1 | POST | `/v1/consentimientos` | App | Alta de consentimiento (ledger) |
| B.2 | GET | `/v1/consentimientos` | App | Historial de consentimientos |
| B.3 | POST | `/v1/consentimientos/{id}/revocar` | App | Revocar consentimiento |
| C.1 | GET | `/v1/yo` | App+reauth | Acceso (art. 15) |
| C.2 | POST | `/v1/yo/portabilidad` | App+reauth | Portabilidad (art. 20) |
| C.3 | DELETE | `/v1/yo` | App+reauth | Supresión (art. 17) |
| D.1 | GET | `/v1/segmentos` | Agencia | Dimensiones y categorías |
| D.2 | GET | `/v1/segmentos/categorias` | Agencia | Lista blanca de categorías |
| E.1 | POST | `/v1/segmentos/preview` | Agencia | ¿Entregable? + tamaño (sin datos) |
| F.1 | POST | `/v1/reportes` | Agencia | Inicia compra (Checkout) |
| F.2 | GET | `/v1/reportes/{id}` | Agencia | Estado + entrega del agregado |
| G.1 | POST | `/v1/webhooks/stripe` | Stripe | Webhooks (cobro y transfers) |
| G.2 | POST | `/v1/agencias/{id}/checkout-session` | Agencia | Reintento de pago |
| G.3 | POST | `/v1/usuarios/{id}/connect-onboarding` | App+reauth | Alta Connect del usuario |
| H.1 | POST | `/v1/agencias` | Pública | Alta de agencia |
| H.2 | GET | `/v1/agencias/yo` | Agencia | Estado de la agencia |
| I.1 | POST | `/v1/admin/agencias/{id}/kyc` | Admin | Verificar/rechazar KYC |
| I.2 | GET | `/v1/admin/auditoria` | Admin | Consultar logs (append-only) |
| I.3 | GET | `/v1/admin/metricas` | Admin | KPIs agregados |
| I.4 | POST | `/v1/admin/reparto/{periodo}/ejecutar` | Admin | Disparo manual del reparto |
| I.5 | GET | `/v1/admin/reparto/{periodo}` | Admin | Estado del reparto |

> **Invariantes que ningún endpoint puede violar** (las garantiza la BD/motor, no la cortesía
> del código): (1) contribución sin consentimiento ACTIVO → la BD aborta; (2) reporte de < 50
> usuarios → imposible persistir (`CHECK`); (3) `comision + pool = importe` siempre; (4) un solo
> reparto por mes y usuario; (5) ninguna categoría especial del art. 9; (6) ninguna respuesta
> contiene `usuario_id` dentro de un agregado entregado.
