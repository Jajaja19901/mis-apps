# Arquitectura — Plataforma de Datos *consent-first*

> **Modelo de negocio (resumen).** Una app de consumo (el *“proyecto 1”*) recoge datos de
> personas que **aceptan EXPRESAMENTE** que sus datos, una vez **agregados y anonimizados**, se
> vendan a agencias. La plataforma vende **solo reportes agregados y anónimos** con
> **k-anonimato ≥ 50**. El dinero se reparte **30 % a los usuarios** (proporcional a su
> contribución) y **70 % a la plataforma**.
>
> **Líneas rojas (no negociables).** No se importan bases de datos externas. No se
> “anonimiza para cumplir” datos sin permiso. Solo entra dato con **consentimiento ACTIVO y
> revocable**. Estas reglas están blindadas por el esquema (`db/schema.sql`) y el motor
> (`src/k-anonimato.mjs`), que son **el contrato**; este documento describe cómo se orquestan.

Los valores de negocio (marca, precios, importes mínimos) son **placeholders** y van marcados
con `‹PLACEHOLDER›`. Se fijan en `wrangler.toml` / Stripe, no en el código.

---

## 1. Principios de diseño

1. **Privacy & consent by design / by default** (art. 25 RGPD). El permiso es un *ledger*
   append-only (`consentimientos`); sin fila activa no hay contribución (trigger
   `trg_contrib_consent_valido`).
2. **Separación de la PII.** La identidad operativa es un **seudónimo** (`usuarios.id`, UUID).
   El contacto vive aparte y minimizado (`usuarios_contacto`, solo `email_hash` y, si es
   imprescindible, `email_cifrado`). Las contribuciones **nacen ya seudonimizadas y
   generalizadas** (banda de edad, región — nunca fecha de nacimiento ni dirección).
3. **k-anonimato como suelo legal, en dos capas.** En la **BD** (`CHECK n_usuarios >= 50` y
   `k_aplicado >= 50` en `reportes`) y en el **motor** (`K_MINIMO_LEGAL = 50`, supresión de
   celdas y anti-divulgación complementaria). Imposible persistir un reporte por debajo de 50.
4. **Lista blanca de categorías** (`categorias_permitidas`, `CHECK es_especial = 0`): por
   diseño no caben datos del art. 9 RGPD (salud, ideología, religión, orientación, biometría…).
5. **El dinero cuadra al céntimo.** `transacciones` exige
   `comision_plataforma_centimos + pool_usuarios_centimos = importe_centimos`; el reparto es
   idempotente por mes (`UNIQUE(periodo, usuario_id)` en `repartos`).
6. **Trazabilidad proactiva** (art. 5.2): todo evento sensible se escribe en `logs_auditoria`
   (append-only, sin PII innecesaria, retención 5 años).
7. **Sin frameworks pesados.** Solo Cloudflare Workers + D1 + R2 + KV + Queues y el runtime web
   estándar (`fetch`, Web Crypto).

---

## 2. Diagrama de servicios (ASCII)

```
                              INTERNET
                                 │
        ┌────────────────────────┼─────────────────────────────┐
        │ (1) App consumo        │ (3) Portal agencias          │ (Stripe)
        │     SDK móvil/web       │     dashboard B2B            │  webhooks
        ▼                        ▼                              ▼
 ┌──────────────┐        ┌──────────────┐               ┌──────────────┐
 │ w-ingesta    │        │ w-catalogo   │               │ w-pagos      │
 │ (consent +   │        │ (segmentos + │               │ (Stripe:     │
 │  contrib.)   │        │  preview)    │               │  checkout +  │
 └──────┬───────┘        └──────┬───────┘               │  webhooks +  │
        │                        │  compra              │  Connect)    │
        │                        ▼                       └──────┬───────┘
        │                ┌──────────────┐                       │
        │                │ w-reportes   │  invoca motor          │
        │                │ (k-anon +    │◀──── src/k-anonimato   │
        │                │  entrega R2) │                        │
        │                └──────┬───────┘                        │
        │                        │                                │
        │  (5) w-derechos        │        (8) w-reparto (cron)    │
        │  acceso/portab./supr.  │        reparto mensual 30%     │
        │  ┌──────────────┐      │        ┌──────────────┐        │
        │  │ w-derechos   │      │        │ w-reparto    │◀──cron─┘ (programado)
        │  └──────┬───────┘      │        └──────┬───────┘
        │         │              │               │
        ▼         ▼              ▼               ▼
   ┌───────────────────────────────────────────────────────┐
   │                       BINDINGS                          │
   │  D1 «PLATAFORMA_DB»  ── tablas del schema.sql           │
   │  R2 «REPORTES»       ── JSON/CSV de reportes entregados │
   │  R2 «EXPORTS»        ── ZIP de portabilidad (efímeros)  │
   │  KV «RATE_LIMIT»     ── límites de tasa / nonces        │
   │  KV «CONFIG»         ── parámetros (precios, versiones) │
   │  QUEUE «JOBS»        ── trabajos asíncronos (export,    │
   │                          reparto, reportes pesados)     │
   │  SECRETS             ── PEPPER_PII, HMAC_REPORTE,        │
   │                          STRIPE_*, ADMIN_*               │
   └───────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ w-admin          │  cumplimiento / DPO
                    │ (auditoría, KPIs,│  acceso restringido
                    │  revisión KYC)   │
                    └──────────────────┘
```

Hay **un Worker de entrada** (`w-router`, opcional) o, de forma equivalente, **un único Worker
con rutas** que despacha a cada módulo. Se documentan como servicios lógicos; pueden desplegarse
como Workers separados (con *Service Bindings*) o como módulos del mismo Worker. La frontera de
seguridad importante no es el número de Workers sino **qué binding toca cada uno** (ver §6).

---

## 3. Responsabilidad de cada Worker

| Worker | Responsabilidad | Lee/escribe | Auth |
|---|---|---|---|
| **w-ingesta** | Alta/baja de consentimiento; recepción de contribuciones **ya generalizadas**; validación contra `categorias_permitidas`; alta de seudónimo. | D1 (`usuarios`, `usuarios_contacto`, `consentimientos`, `contribuciones`), KV `RATE_LIMIT` | Token de app + token de usuario (ver §6.3) |
| **w-catalogo** | Catálogo de **segmentos** para agencias; **preview** de tamaño/entregabilidad (sin datos, solo recuento ≥ k); definición del segmento a comprar. | D1 (`contribuciones`, `agencias`) — solo agregados/recuentos | JWT de agencia (KYC `verificada`) |
| **w-reportes** | Orquesta la compra: confirma pago, **invoca `src/k-anonimato.mjs`**, persiste en `reportes`, sube el agregado a R2 `REPORTES`, marca entrega. | D1 (`reportes`, `transacciones`, `contribuciones`), R2 `REPORTES` | JWT de agencia + verificación de transacción `pagada` |
| **w-pagos** | Stripe Checkout (cobro a agencia), **webhooks** Stripe, Stripe **Connect** (cuentas y transfers de usuarios). Escribe el registro 70/30. | D1 (`transacciones`, `agencias`, `usuarios`, `repartos`), KV (idempotencia) | Firma de webhook Stripe; JWT agencia para iniciar checkout |
| **w-derechos** | Derechos del interesado: **acceso, portabilidad, supresión** (arts. 15/17/20). Encola exports y borrados. | D1 (todas, lectura del propio usuario; baja en `usuarios`), R2 `EXPORTS`, Queue `JOBS` | Token de usuario (reautenticado) |
| **w-reparto** | **Cron mensual.** Calcula el *pool* del periodo, el peso de cada usuario y crea filas en `repartos`; lanza transfers vía w-pagos/Connect. | D1 (`transacciones`, `contribuciones`, `repartos`, `usuarios`), Queue `JOBS` | Disparador `cron` (sin red pública) |
| **w-admin** | Panel de cumplimiento/DPO: revisión KYC de agencias, lectura de `logs_auditoria`, KPIs agregados, gestión de versiones de política. | D1 (lectura amplia + KYC en `agencias`), KV `CONFIG` | `ADMIN_TOKEN` + IP allowlist (placeholder) |
| **w-consumidor** | *Worker para procesar la cola* `JOBS` (export ZIP, supresión diferida, reportes pesados). No expone HTTP. | Según el job (D1, R2) | Consumidor de Queue |

> **Nota.** `w-router`/despachador valida cabeceras comunes, CORS, rate-limit base y añade el
> `request-id` a `logs_auditoria`. No accede a datos de negocio.

---

## 4. Uso de cada almacén (D1 / R2 / KV / Queues)

### D1 «PLATAFORMA_DB» — fuente de verdad transaccional
SQLite gestionado. Contiene **exactamente** las tablas de `db/schema.sql`:
`usuarios`, `usuarios_contacto`, `consentimientos`, `categorias_permitidas`, `contribuciones`,
`agencias`, `reportes`, `transacciones`, `repartos`, `logs_auditoria`.
- **Garantías delegadas a D1** (no al código): trigger de consentimiento, `CHECK k≥50`, suma
  exacta del reparto, `UNIQUE(periodo, usuario_id)`, lista blanca `es_especial=0`.
- Todas las operaciones multi-tabla (p. ej. *“persistir reporte + transacción”*) van en
  **batch/transacción** D1 para atomicidad.

### R2 — objetos grandes e inmutables
- **R2 «REPORTES»**: el **resultado agregado** entregado a la agencia (JSON y/o CSV). La clave
  es `reportes/{reporte_id}.json`; el `resultado_hash` del motor sella su integridad. Se sirve a
  la agencia mediante **URL prefirmada de corta duración** o vía `w-reportes` con control de
  acceso. Nunca contiene filas individuales (lo garantiza el motor).
- **R2 «EXPORTS»**: paquetes de **portabilidad** (art. 20) que genera `w-derechos`. Objetos
  **efímeros** con expiración corta (p. ej. ‹PLACEHOLDER: 24 h›) y un solo uso por enlace.

### KV — estado pequeño, muy leído, latencia baja
- **KV «RATE_LIMIT»**: contadores por IP/token y **nonces** anti-replay del SDK de ingesta.
- **KV «CONFIG»**: parámetros editables sin desplegar — `PRECIO_BASE_SEGMENTO_CENTIMOS`,
  `POLITICA_VERSION` vigente, *feature flags*, `K_OBJETIVO` (siempre ≥ 50). KV es
  **eventualmente consistente**: úsese solo para parámetros, **nunca** para reglas legales
  (esas viven en BD/motor).

### Queues «JOBS» — trabajo asíncrono y reintentos
- Encola: **export de portabilidad** (ZIP en R2), **supresión** diferida (borrado + cascada +
  anotación en `logs_auditoria`), **reportes pesados** (segmentos enormes) y los **transfers**
  del reparto mensual. Da reintentos con *backoff* y *dead-letter* sin bloquear la petición HTTP.

---

## 5. Flujo de datos *end-to-end*

```
 PERSONA (app consumo)                                AGENCIA (portal B2B)
        │                                                     │
 (A) acepta política  ─────────────► consentimientos          │
        │  POST /v1/consentimientos     (otorgado_en,         │
        │                                texto_hash, método)  │
        │                                                     │
 (B) la app envía dato YA generalizado                        │
        │  POST /v1/contribuciones                            │
        ▼                                                     │
   contribuciones  ◀─ trigger valida consentimiento ACTIVO     │
   (seudónimo + banda_edad/region/genero + categoria∈lista)    │
        │                                                     │
        │                        (C) explora catálogo ◀───────┤  GET /v1/segmentos
        │                                                     │
        │                        (D) preview entregabilidad ◀─┤  POST /v1/segmentos/preview
        │                            (recuento ≥ k, SIN datos) │     → {entregable, n_usuarios≈}
        │                                                     │
        │                        (E) compra el segmento ◀──────┤  POST /v1/reportes
        │                            crea Checkout Stripe       │     → {checkout_url}
        │                                                     ▼
        │                                              Stripe Checkout (paga)
        │                                                     │
        │                        (F) webhook payment_intent.succeeded
        │                            ─────────────► w-pagos
        │                            crea transacciones (importe,
        │                            comision_plataforma=70%, pool_usuarios=30%, 'pagada')
        │                                                     │
        │                        (G) w-reportes ejecuta el MOTOR k-anon
        │                            generarReporteAgregado(contribuciones, definicion)
        │                            ├─ nTotal < 50  → NO entregable (auditoría, sin datos)
        │                            └─ nTotal ≥ 50  → agrega, SUPRIME celdas < 50,
        │                                              anti-divulgación complementaria
        │                            persiste en reportes (k_aplicado, n_usuarios,
        │                            resultado_hash, precio_centimos)  ── CHECK k≥50
        │                                              │
        │                        (H) sube agregado a R2 «REPORTES» y entrega
        │                            (URL prefirmada / descarga)  estado='entregado'
        │                                                     │
        │                                              [agregado ANÓNIMO]
        ▼
 (I) FIN DE MES — cron dispara w-reparto:
        pool_mes = Σ pool_usuarios_centimos de transacciones 'pagada' del periodo
        peso_usuario = (sus contribuciones que entraron en reportes de ese mes) / total
        repartos(periodo, usuario_id, importe_centimos, peso_contribucion)  ── UNIQUE
        Stripe Connect transfer → usuarios.stripe_account_id (estado 'verificado')
        Todo se registra en logs_auditoria.
```

**Puntos clave del flujo**

- Entre **(D) preview** y **(E) compra** no viaja ni un solo dato individual: el preview es solo
  un **recuento** y un booleano `entregable` (réplica de la puerta `nTotal ≥ k` del motor).
- El **motor es la única vía** para producir un reporte. `w-reportes` nunca arma agregados “a
  mano”: llama a `generarReporteAgregado(...)` y persiste su salida. La doble barrera
  (motor + `CHECK` de BD) significa que aunque el código tuviera un bug, **la BD rechaza** un
  reporte de < 50.
- El **cobro va antes que la generación**: si el motor declara el segmento **no entregable**, se
  **reembolsa** la transacción (`estado='reembolsada'`) y no se crea fila en `reportes`.
- El **reparto** solo reparte el `pool_usuarios_centimos` (el 30 %) ya cobrado; el 70 %
  (`comision_plataforma_centimos`) queda en la plataforma. La idempotencia
  `UNIQUE(periodo, usuario_id)` permite reintentar el cron sin pagar dos veces.

---

## 6. Seguridad y seudonimización

### 6.1 Separación de PII (defensa en capas)
- **Identidad operativa = seudónimo** `usuarios.id` (UUID v4). Todo el sistema (contribuciones,
  reportes, auditoría) referencia **solo** ese UUID.
- **Contacto aislado** en `usuarios_contacto`, accesible solo por `w-derechos` y `w-pagos`
  (Connect). Guardamos `email_hash` (para login/dedupe) y, **solo si es imprescindible operar
  con el email**, `email_cifrado`.
- **Contribuciones generalizadas en origen**: el SDK de la app **debe** mandar `banda_edad` y
  `region` (provincia/CCAA), no edad exacta ni dirección. `w-ingesta` rechaza cualquier campo
  no contemplado por el esquema (lista de campos cerrada).

### 6.2 Hashing y cifrado (Web Crypto)
| Dato | Técnica | Clave/Secreto | Por qué |
|---|---|---|---|
| `email_hash` | `SHA-256(email_normalizado ‖ PEPPER_PII)` | `PEPPER_PII` (secret) | Login/dedupe sin guardar email en claro; el *pepper* evita ataques de diccionario. |
| `email_cifrado` | AES-GCM (256) | clave derivada de `PEPPER_PII`/KMS | Solo si hay que reenviar email; descifrable únicamente por `w-derechos`. |
| `ip_hash`, `texto_hash`, `user_agent` (consent.) | `SHA-256` (ip con *pepper*) | `PEPPER_PII` | Evidencia de consentimiento sin almacenar IP en claro; `texto_hash` prueba **qué texto exacto** aceptó. |
| `resultado_hash` (reporte) | FNV-1a (integridad) **+ HMAC-SHA256 servidor** | `HMAC_REPORTE` (secret) | El motor calcula FNV-1a (no cripto); el servidor **firma con HMAC** para no repudio antes de persistir/entregar. |
| Tokens de sesión/API | JWT firmado (HS256/EdDSA) | secret de firma | Auth de agencias y usuarios; expiración corta + refresh. |

> El motor (`src/k-anonimato.mjs`) deja claro en su cabecera que el FNV-1a es para integridad,
> **no** criptográfico, y que en producción se **firma con HMAC**: por eso `HMAC_REPORTE` se
> aplica en `w-reportes` justo antes de guardar `resultado_hash`/entregar.

### 6.3 Autenticación y autorización
- **App de consumo → w-ingesta**: doble credencial — *app key* (identifica al “proyecto 1”) +
  **token de usuario** (seudónimo). Nonce anti-replay en KV `RATE_LIMIT`.
- **Agencia → w-catalogo/w-reportes/w-pagos**: **JWT de agencia**; solo operan agencias con
  `agencias.kyc_estado = 'verificada'` y `contrato_firmado_en` no nulo. Sin KYC: 403.
- **Usuario → w-derechos**: **reautenticación** (doble opt-in / enlace firmado de un solo uso)
  antes de exportar o suprimir, para que nadie ejerza derechos en nombre de otro.
- **Admin/DPO → w-admin**: `ADMIN_TOKEN` (secret) + *allowlist* de IP (‹PLACEHOLDER›). Toda
  acción de admin se escribe en `logs_auditoria` con `actor = 'admin:<id>'`.
- **Stripe → w-pagos**: verificación obligatoria de **firma de webhook**
  (`STRIPE_WEBHOOK_SECRET`) e **idempotencia** por `event.id` en KV.

### 6.4 Minimización, retención y auditoría
- `logs_auditoria` es **append-only** (no hay endpoints de update/delete); `detalles` es JSON
  **sin PII innecesaria**. Retención **5 años** para transacciones y accesos.
- **Supresión (art. 17)**: `ON DELETE CASCADE` en `usuarios` arrastra contacto, consentimientos
  y contribuciones; los **reportes ya entregados** son agregados anónimos (no contienen al
  usuario) y **se conservan**. La baja anota `consent.revocado`/`usuario.baja` en auditoría.
- **Revocación de consentimiento**: cierra la fila activa (`revocado_en = now`); a partir de ahí
  el trigger impide nuevas contribuciones de ese usuario para ese propósito. Las contribuciones
  pasadas que ya entraron en reportes anónimos no se pueden “sacar” del agregado, pero **dejan
  de generar** nuevas aportaciones.

### 6.5 Gestión de claves
- Todos los secretos vía `wrangler secret put` (nunca en `wrangler.toml` ni en el repo):
  `PEPPER_PII`, `HMAC_REPORTE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `JWT_FIRMA`, `ADMIN_TOKEN`.
- **Rotación**: `PEPPER_PII` y `HMAC_REPORTE` se versionan (sufijo de versión guardado junto al
  hash) para poder rotar sin perder verificabilidad histórica. La rotación de `PEPPER_PII` no
  re-identifica nada: solo cambia los hashes futuros.
- **Principio de mínimo privilegio por binding**: p. ej. `w-catalogo` **no** tiene acceso a
  `usuarios_contacto`; `w-ingesta` **no** tiene `HMAC_REPORTE`. Se materializa dividiendo en
  Workers con bindings distintos o, en mono-Worker, restringiendo en código + revisión.

---

## 7. Errores, idempotencia y consistencia

- **Idempotencia**: claves `Idempotency-Key` en compra/checkout (KV); `event.id` en webhooks;
  `UNIQUE(periodo, usuario_id)` en reparto.
- **Pago vs. entrega**: si tras cobrar el segmento resulta **no entregable**, se reembolsa y se
  audita. Nunca se entrega un reporte sin transacción `pagada`.
- **Consistencia**: las reglas duras viven en **D1** (transaccional, fuerte). KV (eventual) solo
  para parámetros/contadores. Las operaciones de varias tablas usan batch D1.

---

## 8. Mapa de artefactos del repo

```
plataforma-datos/
├─ db/schema.sql            ← CONTRATO (no se toca): tablas, triggers, CHECKs k≥50
├─ src/k-anonimato.mjs      ← CONTRATO (no se toca): motor k≥50 + supresión + auditoría
├─ src/k-anonimato.test.mjs ← pruebas del motor
├─ wrangler.toml           ← este entregable: bindings + vars + cron
└─ docs/
   ├─ arquitectura.md      ← este documento
   ├─ api-contrato.md      ← contrato REST /v1 (lo siguen los demás ingenieros)
   └─ roadmap.md           ← plan por fases con criterios de aceptación
```

> Los **endpoints** que implementan este flujo están especificados, campo a campo, en
> [`api-contrato.md`](./api-contrato.md). Los **bindings y el cron** del reparto se configuran en
> [`../wrangler.toml`](../wrangler.toml).
