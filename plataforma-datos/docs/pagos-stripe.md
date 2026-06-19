# Diseño de Pagos — Stripe Connect (España, B2B consent-first)

> **Versión:** 1.0 · **Fecha:** 2026-06-19  
> **Destino de ejecución:** Cloudflare Workers + D1 (SQLite)  
> **Autor:** Ingeniero de Pagos  
> **Este documento es diseño, no código final.**

---

## 1. Modelo de cuentas Connect: qué tipo usar y por qué

Stripe Connect ofrece tres modelos: Standard, Express y Custom.

### Para PAGAR a los usuarios (receptores del 30%)

**Recomendación: Express**

- Stripe gestiona el onboarding KYC mediante su propia UI alojada (no nos exponemos a datos bancarios crudos).
- El usuario hace el flujo en la pantalla de Stripe; nosotros solo recibimos el `account_id`.
- Soporta `transfers` desde la cuenta de la plataforma hacia la cuenta del usuario, que es exactamente el flujo del reparto mensual.
- Coste menor que Custom; riesgo legal mucho menor que Standard (en Standard el usuario ve la marca Stripe directa y puede haber confusión de responsabilidad).
- **Alineado con el esquema:** el campo `usuarios.stripe_account_id` almacena este `acct_xxx`, y `payout_estado` refleja el KYC (`pendiente` → `verificado` → `restringido`).

**Descartar Standard** porque da al usuario acceso directo al Dashboard de Stripe; inadecuado para usuarios finales no técnicos.  
**Descartar Custom** porque exige que la plataforma gestione toda la verificación KYC, añade carga regulatoria enorme y requiere licencia de dinero electrónico en la UE si los fondos se mantienen más de un tiempo mínimo.

### Para COBRAR a las agencias (clientes B2B)

No se usa una cuenta Connect para las agencias; se les crea un **Customer de Stripe** (`agencias.stripe_customer_id`) en la cuenta de la plataforma. La plataforma cobra directamente con `PaymentIntent` o `Checkout Session` y retiene el dinero. Desde esa retención se hacen los `transfers` a usuarios Express.

---

## 2. KYC: qué verifica Stripe y qué debemos hacer nosotros

### Plataforma (cuenta Stripe principal)
- Stripe exige verificar la identidad del negocio operador de la plataforma (razón social, CIF, responsable legal, IBAN propio).
- La plataforma debe aceptar el [Stripe Connected Account Agreement](https://stripe.com/es/legal/connect-account) en nombre de sus usuarios Express.
- **Responsabilidad nuestra:** completar el onboarding de la plataforma en el Dashboard de Stripe antes de cualquier cobro real.

### Agencias (clientes B2B que pagan)
- Stripe aplica KYC estándar al crear el `Customer`; para pagos con tarjeta B2B la verificación la hace el emisor de la tarjeta.
- **Nuestra capa adicional:** la tabla `agencias` exige `kyc_estado = 'verificada'` y `contrato_firmado_en NOT NULL` antes de emitir ningún reporte. Esto es nuestra barrera de negocio, independiente de Stripe.

### Usuarios Express (receptores del reparto)
- Stripe verifica nombre completo, fecha de nacimiento, dirección y IBAN/cuenta bancaria durante el onboarding Express.
- Solo cuando `account.details_submitted = true` y sin `requirements.currently_due` pendientes el usuario puede recibir payouts.
- **Nuestra capa:** sincronizamos el estado via webhook `account.updated` y actualizamos `usuarios.payout_estado` (`pendiente` → `verificado` o `restringido`).
- **No** almacenamos ningún dato bancario en nuestra base de datos; solo el `stripe_account_id`.

---

## 3. Comisiones de Stripe y cálculo de ejemplo

> **Nota:** Tarifas publicadas en stripe.com/es para España (UE) en junio 2026 — a confirmar con el dashboard del contrato si se negocia tarifa personalizada por volumen.

| Concepto | Tarifa estándar ES |
|---|---|
| Tarjeta de crédito/débito UE (Visa/MC) | 1,5 % + 0,25 € por transacción |
| Tarjeta fuera de la UE | 3,25 % + 0,25 € |
| Transfer entre cuentas Connect | 0,25 % (mín. 0,25 €, máx. 25 €) |
| Stripe Connect (tarifa de plataforma) | Incluida si se usa `application_fee_amount`; no hay cuota fija adicional en el modelo Express |
| Payout a cuenta bancaria (SEPA) | Gratis (1-2 días hábiles) |

### Cálculo de ejemplo: reporte de 500 € cobrado a una agencia española

```
Importe bruto cobrado a la agencia:   500,00 €  (50.000 céntimos)

Comisión Stripe por cobro (tarjeta UE):
  1,5 % × 500,00 = 7,50 €
  + 0,25 €
  Total comisión cobro Stripe:          7,75 €

Neto que queda en la cuenta plataforma:  492,25 €

Reparto del BRUTO (antes de descontar Stripe, o del neto — DECISIÓN):
  Opción A — repartir sobre bruto:
    70 % plataforma:  350,00 €  (35.000 céntimos)
    30 % pool:        150,00 €  (15.000 céntimos)
    Stripe se descuenta del 70 % de la plataforma → neto plataforma: 342,25 €

  Opción B — repartir sobre neto (492,25 €):
    70 % plataforma:  344,58 €
    30 % pool:        147,67 €

RECOMENDACIÓN: Opción A (repartir sobre bruto).
  - Simplifica la aritmética: comision_plataforma + pool = importe exacto (CHECK del esquema).
  - La plataforma absorbe el coste de Stripe de su propio 70 %; los usuarios siempre
    reciben exactamente el 30 % del precio anunciado.

Comisión transfer (por usuario, en el cron mensual):
  Si el pool de 15.000 céntimos se reparte entre 200 usuarios:
    Importe medio por usuario: 75 céntimos
    Transfer Stripe: 0,25 % × 0,75 € = 0,0019 €, pero mínimo 0,25 € → cuesta 0,25 €
    → El transfer vale más que el reparto. VER MITIGACIÓN en §5.

Coste real con umbral mínimo de 5 € para pagar:
  Solo se transfiere si el acumulado del usuario ≥ 500 céntimos (5 €).
  Transfer de 5 €: 0,25 % × 5 = 0,013 €, mínimo 0,25 € → coste 0,25 € = 5 % del reparto.
  Transfer de 50 €: 0,25 % × 50 = 0,13 € → coste 0,26 % del reparto. Razonable.
```

**Conclusión de comisiones:**
- Cobro a agencia: Stripe se lleva ~1,55–1,60 % del bruto (a confirmar con tarifa negociada).
- Repartos: imponer un **umbral mínimo de 5 €** para hacer el transfer; por debajo se acumula al mes siguiente.

---

## 4. Flujo de cobro a la agencia

```
Agencia solicita reporte
       ↓
[Validar: agencia.kyc_estado = 'verificada' y contrato firmado]
       ↓
Crear reporte (estado = 'generado')
       ↓
Crear PaymentIntent en Stripe
  - amount: precio_centimos del reporte
  - currency: 'eur'
  - customer: agencias.stripe_customer_id
  - metadata: { reporte_id, agencia_id }
  - NO se usa application_fee_amount ni transfer_data aquí:
    la plataforma retiene TODO el dinero y hace los transfers
    manualmente en el cron mensual (mayor control y auditoría)
       ↓
Insertar en transacciones (estado = 'pendiente'):
  id                           = uuid()
  agencia_id                   = agencia.id
  reporte_id                   = reporte.id
  importe_centimos             = precio_centimos
  comision_plataforma_centimos = ROUND(precio_centimos * 0.70)  ← 70 %
  pool_usuarios_centimos       = precio_centimos - comision_plataforma_centimos  ← resto exacto
  stripe_payment_intent        = pi_xxx
  estado                       = 'pendiente'
```

**Nota crítica sobre el CHECK:** el campo `pool_usuarios_centimos` se calcula como
`importe - parte_plataforma`, no como `importe × 0.30`. Así la suma es **exactamente igual** al
importe, sin riesgo de descuadre por redondeo flotante. Nunca usar `ROUND(x * 0.30) + ROUND(x * 0.70)` porque en algunos valores esas dos cifras difieren del total en ±1 céntimo.

```
Webhook payment_intent.succeeded
       ↓
UPDATE transacciones SET estado = 'pagada'
UPDATE reportes SET estado = 'entregado'
INSERT INTO logs_auditoria (actor='sistema', accion='transaccion.pagada', ...)
Entregar reporte a la agencia
```

---

## 5. Flujo de reparto mensual (cron)

El cron se ejecuta el **día 1 de cada mes** sobre el periodo `YYYY-MM` anterior.

### Pasos

1. **Calcular el pool total del periodo:**
   ```sql
   SELECT SUM(pool_usuarios_centimos) AS pool_total
   FROM transacciones
   WHERE estado = 'pagada'
     AND strftime('%Y-%m', creado_en) = :periodo
   ```

2. **Calcular el peso de contribución de cada usuario:**
   ```sql
   SELECT usuario_id, COUNT(*) AS n_contribuciones
   FROM contribuciones c
   JOIN consentimientos co ON co.id = c.consentimiento_id
   WHERE co.revocado_en IS NULL
     AND strftime('%Y-%m', c.recogido_en) = :periodo
   GROUP BY usuario_id
   ```
   El peso de cada usuario = `n_contribuciones_usuario / n_contribuciones_total`.  
   Solo participan usuarios con `payout_estado = 'verificado'`.

3. **Algoritmo de reparto con redondeo exacto** (ver §6).

4. **Verificar idempotencia:** antes de insertar cada reparto, comprobar que
   `NOT EXISTS (SELECT 1 FROM repartos WHERE periodo = :p AND usuario_id = :u)`.
   El UNIQUE del esquema lo garantiza también a nivel de base de datos como segunda línea.

5. **Insertar en `repartos` (estado = 'pendiente')** con `importe_centimos` calculado.

6. **Crear los transfers en Stripe** (solo si `importe_centimos >= 500`, es decir, ≥ 5 €):
   ```
   stripe.transfers.create({
     amount: importe_centimos,
     currency: 'eur',
     destination: usuarios.stripe_account_id,
     transfer_group: 'REPARTO_' + periodo,
     metadata: { periodo, usuario_id, reparto_id }
   })
   ```
   Guardar `stripe_transfer_id` y actualizar `estado = 'pagado'` al confirmar.

7. **Usuarios por debajo del umbral:** dejar `estado = 'pendiente'` y acumular.
   En el cron del mes siguiente, sumar el saldo acumulado al reparto del mes nuevo antes de
   calcular si supera el umbral.

---

## 6. Pseudocódigo de reparto con redondeo exacto (algoritmo del mayor resto)

```python
# Entradas
pool_total  : int   # céntimos totales a repartir (exactos)
contribs    : dict  # { usuario_id -> n_contribuciones }

total_contribs = sum(contribs.values())

# Paso 1: cuota base (parte entera) y resto fraccionario por usuario
cuotas = {}
restos = {}
asignado_total = 0

for uid, n in contribs.items():
    peso_exacto = n / total_contribs           # float
    valor_exacto = pool_total * peso_exacto     # float
    base = int(valor_exacto)                    # parte entera (floor)
    cuotas[uid] = base
    restos[uid] = valor_exacto - base           # fracción 0..1
    asignado_total += base

# Paso 2: céntimos sobrantes (por el truncado)
sobrante = pool_total - asignado_total          # siempre 0 <= sobrante < N usuarios

# Paso 3: repartir el sobrante entre los N usuarios con mayor resto (un céntimo extra cada uno)
ordenados = sorted(restos, key=restos.get, reverse=True)
for i in range(sobrante):
    cuotas[ordenados[i]] += 1

# Verificación (OBLIGATORIA antes de insertar)
assert sum(cuotas.values()) == pool_total, "DESCUADRE: abortar y alertar"

# Resultado
return cuotas  # { usuario_id -> céntimos a pagar }
```

**Garantías:**
- La suma de todas las cuotas es **siempre exactamente** `pool_total`.
- No hay redondeo de floats acumulado: el `sobrante` se calcula como diferencia de enteros.
- El `assert` final es la última línea de defensa; si falla, el cron aborta y envía alerta.
- Usuarios con 0 contribuciones no entran en el reparto (no se inserta fila en `repartos`).

---

## 7. Webhooks necesarios y máquina de estados

### Webhooks a suscribir

| Evento Stripe | Acción |
|---|---|
| `payment_intent.succeeded` | `transacciones.estado` → `'pagada'`; entregar reporte |
| `payment_intent.payment_failed` | `transacciones.estado` → `'fallida'`; notificar agencia |
| `charge.dispute.created` | Iniciar proceso de chargeback; congelar cuenta agencia si reiterado |
| `charge.refunded` | `transacciones.estado` → `'reembolsada'`; no incluir en pool mensual |
| `transfer.created` | Confirmar creación del transfer (no garantiza pago aún) |
| `transfer.failed` | `repartos.estado` → `'fallido'`; reprogramar con backoff |
| `account.updated` | Sincronizar `usuarios.payout_estado` (`verificado` / `restringido`) |
| `capability.updated` | Detectar pérdida de capacidad `transfers` en cuenta del usuario |

**Seguridad webhooks:** verificar siempre la firma con `stripe.webhooks.constructEvent` y el
`STRIPE_WEBHOOK_SECRET` (idéntico al patrón de `servidor-pagos/server.js`). Rechazar con 400 si falla.

### Máquina de estados: `transacciones.estado`

```
pendiente → pagada      (payment_intent.succeeded)
pendiente → fallida     (payment_intent.payment_failed)
pagada    → reembolsada (charge.refunded)
```

### Máquina de estados: `repartos.estado`

```
pendiente → pagado   (transfer confirmado, umbral alcanzado)
pendiente → pendiente (umbral no alcanzado; acumular al mes siguiente)
pendiente → fallido  (transfer.failed tras reintentos agotados)
fallido   → pendiente (reintento manual autorizado por admin)
```

---

## 8. Idempotencia y reintentos

- **Cron mensual:** el cron lee el periodo como argumento y lleva un registro de progreso
  en una tabla auxiliar (o en `logs_auditoria`). Si se interrumpe, al relanzar salta los
  usuarios que ya tienen fila en `repartos` para ese periodo (UNIQUE lo garantiza a nivel BD).
- **Transfers individuales:** usar el campo `transfer_group = 'REPARTO_' + periodo` como
  clave de agrupación; Stripe permite retransmitir si el transfer no existe aún con ese grupo.
- **Reintentos de transfers fallidos:** backoff exponencial (1 h, 4 h, 24 h); tras 3 intentos
  fallidos, marcar `repartos.estado = 'fallido'` y escalar a revisión manual.
- **Idempotency-Key en Stripe:** para cada transfer, usar `reparto.id` como `idempotencyKey`
  en la llamada a la API. Así, un reintento accidental no crea un transfer duplicado.

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| **Chargeback de agencia** | Media | Contrato firmado (`contrato_firmado_en`) como evidencia; entregar reporte SOLO tras `payment_intent.succeeded`; webhook `charge.dispute.created` para actuar en < 7 días; reserva de litigios del 1 % del volumen mensual |
| **Cuenta de usuario restringida** por Stripe (KYC incompleto) | Alta (usuarios no bancados) | `payout_estado = 'restringido'` excluye al usuario del pago inmediato; fondos se acumulan hasta que pase KYC o se devuelvan al pool general tras 12 meses |
| **Fondos insuficientes en cuenta plataforma** para transfers | Baja | Nunca hacer transfers antes de que los PaymentIntents estén `succeeded`; el cron verifica balance disponible en Stripe antes de lanzar transfers |
| **Error de redondeo / descuadre** | Muy baja | Algoritmo del mayor resto + `assert` antes de insertar; CHECK de BD como última barrera |
| **Fraude de contribuciones** (inflado de peso para recibir más) | Media | Trigger `trg_contrib_consent_valido` en BD; auditorías periódicas de distribución de pesos; límite de contribuciones por usuario/día a nivel de aplicación |
| **RGPD: transferencia de datos a Stripe** | Baja | Stripe Inc. opera bajo SCCs (Cláusulas Contractuales Estándar) con filial irlandesa; incluir en política de privacidad y en el consentimiento la mención al procesador |
| **Periodo de gracia de funds de Stripe** | Baja | Stripe puede retener fondos los primeros 7-14 días en cuentas nuevas; no prometer repartos el primer mes |
| **Umbrales mínimos de transfer** | Baja | Usuarios de baja actividad nunca superan el umbral; política clara de devolución o acumulación máxima (ver §5) |

---

## 10. Checklist antes de ir a producción

- [ ] Cuenta Stripe de la plataforma verificada (KYC empresa completo).
- [ ] Variables de entorno: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`.
- [ ] Webhook endpoint registrado con todos los eventos de §7; firma verificada.
- [ ] Primer cobro en modo TEST con tarjeta de prueba ES; verificar INSERT en `transacciones` y CHECK de suma exacta.
- [ ] Primer cron en modo TEST con datos ficticios; verificar algoritmo de redondeo.
- [ ] Umbral mínimo de transfer (500 céntimos) configurado como constante, no hardcodeado.
- [ ] Política de privacidad actualizada con mención a Stripe como procesador de pagos.
- [ ] Contrato de servicios con agencias revisado por asesor legal (cobro, devoluciones, chargebacks).

---

*Documento de diseño — el código de implementación lo produce el Ingeniero de Datos a partir de este plano.*
