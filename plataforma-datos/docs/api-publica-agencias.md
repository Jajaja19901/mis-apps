# Documentación de API — Plataforma de Datos *consent-first*

## Para Agencias Cliente (B2B)

**Versión:** 1.0 · **Fecha:** 2026-06-19

Esta API permite a las agencias explorar, previsualizar y comprar reportes de datos agregados y anonimizados. La plataforma garantiza **k-anonimato ≥ 50** (ningún dato identifica a menos de 50 personas) y **separación total de datos personales**; solo recibirás agregados definitivos.

---

## 1. Información General

### 1.1 Base URL y Autenticación

```
Base URL: https://api.‹PLACEHOLDER-dominio›/v1
Autenticación: Bearer <jwt_agencia>
```

**Requisitos previos:**
- Tu agencia debe estar **verificada** (`kyc_estado = 'verificada'`).
- Debes haber firmado el contrato de acceso (`contrato_firmado_en` no nulo).
- Dispones de un token JWT válido emitido por la plataforma.

### 1.2 Formato de Datos

- **Formato:** JSON UTF-8. Cabecera `Content-Type: application/json`.
- **Fechas:** ISO-8601 UTC. Ejemplo: `2026-06-19T10:00:00Z`.
- **IDs:** Todos son UUID v4 en texto.
- **Importes:** Siempre en **céntimos de euro** (enteros). `price_centimos: 49900` = 499,00 €.

### 1.3 Código de Solicitud (X-Request-Id)

Toda petición recibe una cabecera de respuesta `X-Request-Id` para trazabilidad. Úsala en cualquier consulta de soporte.

---

## 2. Autenticación y Seguridad

### 2.1 Token JWT

Tu token JWT se emite tras la verificación de tu agencia. Inclúyelo en la cabecera `Authorization`:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  https://api.‹PLACEHOLDER-dominio›/v1/segmentos
```

**Validez:** Los tokens tienen expiración corta (ver dashboard para fecha exacta). Si caduca, solicita uno nuevo en tu perfil de agencia.

### 2.2 Rate Limiting

Se aplican límites de tasa por token de agencia:

- **Límite:** ‹PLACEHOLDER: p. ej. 1000 peticiones/hora›.
- **Excedido:** Recibirás respuesta `429 Too Many Requests`.
- **Reintento:** Espera al menos 60 segundos antes de reintentar.

---

## 3. Formato de Errores (Uniforme)

Toda respuesta de error sigue este formato:

```json
{
  "error": {
    "codigo": "kyc_no_verificada",
    "mensaje": "Tu agencia aún no ha sido verificada.",
    "request_id": "req_3a9f...",
    "detalles": {}
  }
}
```

### Códigos HTTP y Códigos de Error Comunes

| HTTP | Código | Significado |
|------|--------|-------------|
| 400 | `peticion_invalida` | Falta un campo obligatorio o tiene formato incorrecto. |
| 401 | `auth_invalida` | Token expirado, inválido o no enviado. |
| 403 | `kyc_no_verificada` | Tu agencia no está verificada o no ha firmado contrato. |
| 403 | `prohibido` | Acceso denegado por política de seguridad. |
| 404 | `no_existe` | El recurso solicitado no existe. |
| 422 | `segmento_no_entregable` | El segmento tiene < 50 usuarios; no es posible generar reporte. |
| 422 | `categoria_no_permitida` | Solicitaste una categoría que no está en la lista blanca. |
| 429 | `rate_limit` | Excediste el límite de tasa. Espera antes de reintentar. |
| 500 | `error_interno` | Error del servidor. Contacta a soporte con el `request_id`. |

---

## 4. Endpoints — Catálogo y Dimensiones

### 4.1 `GET /v1/segmentos` — Catálogo Disponible

**¿Qué hace?**  
Devuelve las **dimensiones** y **categorías** disponibles para construir segmentos personalizados.

**Petición:**

```bash
curl -H "Authorization: Bearer <jwt>" \
  https://api.‹PLACEHOLDER-dominio›/v1/segmentos
```

**Respuesta `200 OK`:**

```json
{
  "dimensiones": [
    "region",
    "banda_edad",
    "genero"
  ],
  "categorias": [
    {
      "categoria": "compras_online",
      "descripcion": "Frecuencia / interés de compra online"
    },
    {
      "categoria": "preferencia_ocio",
      "descripcion": "Preferencias de ocio declaradas"
    },
    {
      "categoria": "rango_gasto_mensual",
      "descripcion": "Banda de gasto mensual declarada"
    }
  ],
  "valores_ejemplo": {
    "region": [
      "Madrid",
      "Cataluña",
      "Andalucía",
      "Valencia",
      "..."
    ],
    "banda_edad": [
      "18-24",
      "25-34",
      "35-44",
      "45-54",
      "55-64",
      "65+"
    ],
    "genero": [
      "F",
      "M",
      "X"
    ]
  },
  "k_minimo_legal": 50
}
```

**Explicación:**
- **dimensiones**: campos por los que puedes filtrar/agrupar.
- **categorias**: temas de datos disponibles (no hay categorías especiales del art. 9 RGPD — salud, religión, etc.).
- **valores_ejemplo**: ejemplos reales del catálogo.
- **k_minimo_legal**: `50`. No se entrega ningún reporte con menos de 50 personas; esta es la garantía de privacidad.

### 4.2 `GET /v1/segmentos/categorias` — Categorías Permitidas (Atajo)

**¿Qué hace?**  
Lista solo las categorías de la lista blanca, sin ruido extra.

**Petición:**

```bash
curl -H "Authorization: Bearer <jwt>" \
  https://api.‹PLACEHOLDER-dominio›/v1/segmentos/categorias
```

**Respuesta `200 OK`:**

```json
{
  "items": [
    {
      "categoria": "compras_online",
      "descripcion": "Frecuencia / interés de compra online"
    },
    {
      "categoria": "preferencia_ocio",
      "descripcion": "Preferencias de ocio declaradas"
    },
    {
      "categoria": "rango_gasto_mensual",
      "descripcion": "Banda de gasto mensual declarada"
    }
  ]
}
```

---

## 5. Endpoints — Preview (Antes de Comprar)

### 5.1 `POST /v1/segmentos/preview` — ¿Es Entregable? ¿Cuánto Cuesta?

**¿Qué hace?**  
Valida si un segmento es **entregable** (tiene ≥ 50 usuarios) sin devolverte ningún dato. Solo es un **recuento y precio estimado**. Úsalo para saber si vale la pena comprar sin verlo antes.

**Petición:**

```json
{
  "definicion": {
    "filtros": {
      "region": "Madrid",
      "categoria": "compras_online"
    },
    "dimensiones": [
      "banda_edad"
    ],
    "metrica": "valor"
  }
}
```

**Explicación del payload:**
- **filtros**: qué criterios aplicas (p. ej. solo personas en Madrid que dieron datos sobre compras).
- **dimensiones**: por cuáles campos desglosas el resultado (p. ej. por banda de edad).
- **metrica**: `"valor"` (el único disponible por ahora).

**Respuesta `200 OK` (Es Entregable):**

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

**Explicación:**
- **entregable**: `true` = sí puedes comprar este segmento.
- **n_usuarios**: 1840 personas contribuyeron al segmento.
- **k_aplicado**: Se aplica k-anonimato de 50 (garantía de privacidad).
- **celdas_estimadas_entregables**: ~4 filas en el reporte final (cada una con ≥ 50 personas).
- **celdas_estimadas_suprimidas**: ~2 filas se ocultarán por tener < 50 personas (privacidad).
- **precio_estimado_centimos**: `49900` = **499,00 €**.

**Respuesta `200 OK` (NO Es Entregable):**

```json
{
  "entregable": false,
  "motivo": "segmento con 31 usuarios (< k=50)",
  "n_usuarios": 31
}
```

**Explicación:**
- **entregable**: `false` = no se puede entregar este segmento.
- **motivo**: Tienes solo 31 personas, necesitas al menos 50.
- Si probabas un segmento muy específico (p. ej. "mujeres 65+ en La Rioja"), intenta con filtros más amplios.

**Errores Posibles:**

- `422 categoria_no_permitida` — Solicitaste una categoría que no existe.
- `429 rate_limit` — Probaste demasiados previews. Espera un minuto.

---

## 6. Endpoints — Compra de Reportes

### 6.1 `POST /v1/reportes` — Inicia Compra (Abre Checkout)

**¿Qué hace?**  
Crea la compra de un reporte y abre una sesión de pago Stripe. El reporte **no se genera hasta que pagues**.

**Petición:**

```json
{
  "definicion_segmento": {
    "filtros": {
      "region": "Madrid",
      "categoria": "compras_online"
    },
    "dimensiones": [
      "banda_edad"
    ],
    "metrica": "valor"
  }
}
```

**Cabecera recomendada (para idempotencia):**

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Si repites la misma compra con la misma clave, no se duplicará.

**Respuesta `201 Created`:**

```json
{
  "reporte_id": "r5d4...uuid",
  "estado": "pendiente_pago",
  "precio_centimos": 49900,
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_...",
  "transaccion_id": "t9e8...uuid"
}
```

**Explicación:**
- **reporte_id**: Tu identificador único de compra. Guárdalo.
- **estado**: `pendiente_pago` = esperando que pagues.
- **precio_centimos**: `49900` = 499,00 € (el segmento cuesta esto).
- **checkout_url**: Redirige a tu usuario a esta URL para pagar.
- **transaccion_id**: Referencia interna del pago.

**Pasos siguientes:**
1. Redirige a `checkout_url`.
2. El usuario paga con tarjeta.
3. Stripe te notifica a ti (y a nosotros) que se completó.
4. El reporte se genera automáticamente.
5. Usa `reporte_id` para descargarlo (sección 6.2).

**Errores Posibles:**

- `403 kyc_no_verificada` — Tu agencia no está verificada aún.
- `422 segmento_no_entregable` — El segmento ya no es entregable (cambió el catálogo). Usa preview otra vez.
- `422 categoria_no_permitida` — Categoría fuera de la lista blanca.
- `409 idempotencia_conflicto` — Usaste la misma `Idempotency-Key` con definición distinta.

### 6.2 `GET /v1/reportes/{reporte_id}` — Estado y Descarga

**¿Qué hace?**  
Consulta el estado de tu compra y, cuando esté listo, descarga el reporte JSON.

**Petición:**

```bash
curl -H "Authorization: Bearer <jwt>" \
  https://api.‹PLACEHOLDER-dominio›/v1/reportes/r5d4...uuid
```

**Respuesta `200 OK` (Entregado):**

```json
{
  "reporte_id": "r5d4...uuid",
  "estado": "entregado",
  "k_aplicado": 50,
  "n_usuarios": 1840,
  "generado_en": "2026-06-19T12:00:00Z",
  "resultado_hash": "a1b2c3d4",
  "definicion_segmento": {
    "filtros": {
      "region": "Madrid",
      "categoria": "compras_online"
    },
    "dimensiones": [
      "banda_edad"
    ],
    "metrica": "valor"
  },
  "resultado": {
    "celdas": [
      {
        "banda_edad": "25-34",
        "n_usuarios": 820,
        "media_valor": 3.21
      },
      {
        "banda_edad": "35-44",
        "n_usuarios": 610,
        "media_valor": 2.98
      }
    ],
    "celdas_suprimidas": 2
  },
  "descarga_url": "https://.../reportes/r5d4....json?firma=...",
  "descarga_expira_en": "2026-06-19T13:00:00Z"
}
```

**Explicación:**
- **estado**: `entregado` = listo para descargar.
- **k_aplicado**: Se aplicó k-anonimato de 50.
- **n_usuarios**: 1840 personas en el segmento.
- **generado_en**: Cuándo se creó el reporte.
- **resultado_hash**: Firma criptográfica del contenido (verificabilidad).
- **celdas**: Array de filas agregadas. **Cada fila tiene ≥ 50 personas** (garantizado).
  - **banda_edad**: La dimensión.
  - **n_usuarios**: Cuántas personas distintas en esta celda.
  - **media_valor**: Valor promedio de esas personas.
- **celdas_suprimidas**: Número de celdas que se ocultaron por tener < 50 personas.
- **descarga_url**: Enlace directo de descarga (con firma y expiración).
- **descarga_expira_en**: Válido hasta esta fecha. Descarga antes.

**Respuesta `200 OK` (Pendiente de Pago):**

```json
{
  "reporte_id": "r5d4...uuid",
  "estado": "pendiente_pago",
  "precio_centimos": 49900
}
```

Intenta más tarde; el usuario aún no ha pagado.

**Respuesta `200 OK` (No Entregable — Reembolsado):**

```json
{
  "reporte_id": "r5d4...uuid",
  "estado": "no_entregable",
  "motivo": "segmento con 41 usuarios (< k=50)",
  "reembolso": "emitido"
}
```

Tras pagar, descubrimos que el segmento tiene solo 41 personas. Es imposible entregar con garantía de privacidad, así que te reembolsamos automáticamente.

**Estados Posibles:**
- `pendiente_pago` — En espera de pago.
- `pagado_generando` — Pagado, se está creando el reporte.
- `entregado` — Listo; descárgalo.
- `no_entregable` — Falló la validación; reembolso emitido.
- `anulado` — Cancelado por error o política.

---

## 7. Endpoints Auxiliares

### 7.1 `GET /v1/agencias/yo` — Tu Estado de Agencia

**¿Qué hace?**  
Consulta tu perfil: estado KYC, si firmaste contrato y tu cliente Stripe.

**Petición:**

```bash
curl -H "Authorization: Bearer <jwt>" \
  https://api.‹PLACEHOLDER-dominio›/v1/agencias/yo
```

**Respuesta `200 OK`:**

```json
{
  "id": "a3f2...uuid",
  "razon_social": "Agencia Ejemplo S.L.",
  "cif": "B12345678",
  "kyc_estado": "verificada",
  "contrato_firmado_en": "2026-06-01T10:00:00Z",
  "stripe_customer_id": "cus_..."
}
```

---

## 8. Flujo Completo de Ejemplo

### Caso: "Quiero un reporte de compras online en Madrid, desglosado por edad"

**Paso 1: Explora el catálogo**

```bash
curl -H "Authorization: Bearer <jwt>" \
  https://api.‹PLACEHOLDER-dominio›/v1/segmentos
```

Ves que `compras_online` está disponible y que puedes desglosar por `banda_edad`.

**Paso 2: Pregunta al preview**

```bash
curl -X POST \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  https://api.‹PLACEHOLDER-dominio›/v1/segmentos/preview \
  -d '{
    "definicion": {
      "filtros": { "region": "Madrid", "categoria": "compras_online" },
      "dimensiones": ["banda_edad"],
      "metrica": "valor"
    }
  }'
```

Respuesta: `1840 usuarios`, `4 celdas entregables`, **499 €**.

**Paso 3: Compra**

```bash
curl -X POST \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  https://api.‹PLACEHOLDER-dominio›/v1/reportes \
  -d '{
    "definicion_segmento": {
      "filtros": { "region": "Madrid", "categoria": "compras_online" },
      "dimensiones": ["banda_edad"],
      "metrica": "valor"
    }
  }'
```

Respuesta:
```json
{
  "reporte_id": "r5d4...uuid",
  "estado": "pendiente_pago",
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_...",
  "precio_centimos": 49900
}
```

**Paso 4: Paga**

Abre `checkout_url` en tu navegador y completa el pago con tarjeta.

**Paso 5: Descarga**

Cuando Stripe confirme el pago (unos segundos), el reporte está listo:

```bash
curl -H "Authorization: Bearer <jwt>" \
  https://api.‹PLACEHOLDER-dominio›/v1/reportes/r5d4...uuid
```

Respuesta incluye `descarga_url`. Descárgalo (es un JSON con agregados).

**Paso 6: Analiza**

El reporte tiene algo así:

```json
{
  "celdas": [
    { "banda_edad": "25-34", "n_usuarios": 820, "media_valor": 3.21 },
    { "banda_edad": "35-44", "n_usuarios": 610, "media_valor": 2.98 },
    { "banda_edad": "45-54", "n_usuarios": 280, "media_valor": 2.45 }
  ]
}
```

- Personas de 25–34 años interesadas en compras online: **820 personas**, gasto promedio **3,21 €**.
- Y así con cada grupo de edad.

**Garantía:** Ninguna fila tiene menos de 50 personas. Nadie individual es identificable.

---

## 9. Límites de Uso y Cuotas

| Concepto | Límite | Notas |
|----------|--------|-------|
| Peticiones por hora | ‹PLACEHOLDER: 1000› | Por token de agencia |
| Previews consecutivos | ‹PLACEHOLDER: 10 por minuto› | Protección contra sondeos de privacidad |
| Descarga URL vigencia | 1 hora | Descarga dentro de este tiempo o genera una nueva |
| Tamaño máximo de reporte | ‹PLACEHOLDER: 10 MB› | Reportes muy grandes se comprimen |

---

## 10. Preguntas Frecuentes (FAQ)

**P: ¿Puedo ver filas individuales?**  
R: No. Jamás. La plataforma solo entrega agregados (conteos y promedios). Está diseñada así por privacidad.

**P: ¿Qué es k-anonimato?**  
R: Garantía de que cada fila del reporte representa **al menos 50 personas distintas**. Imposible identificar a ninguna persona individual.

**P: ¿Qué ocurre si compro pero luego el segmento no es entregable?**  
R: Se reembolsa automáticamente. No hay riesgo.

**P: ¿Cómo renuevo mi token cuando caduca?**  
R: Accede a tu panel de agencia y genera uno nuevo. Los antiguos se inhabilitan.

**P: ¿Puedo integrar esto en mi producto?**  
R: Sí. La API es REST con JSON estándar. Cualquier lenguaje (Python, JS, Go, etc.) puede usarla.

---

## 11. Soporte

- **Email de soporte:** ‹PLACEHOLDER: support@plataforma.es›
- **Incluye en toda consulta:** Tu `request_id` de la petición que falla.
- **Horario:** ‹PLACEHOLDER: L-V 09:00–18:00 CET›

---

## Apéndice A — Contracto Legal

Toda compra de reporte está sujeta a:
1. **Prohibición de reidentificación** — No intentarás identificar a personas individuales del reporte.
2. **Uso exclusivo para inteligencia comercial** — No lo compartirás con terceros sin autorización.
3. **Retención máxima** — Los reportes son tuyo por plazo de 1 año; después se archive/destruye.

Ver `contratos/contrato-agencia-cliente.md` para términos completos.
