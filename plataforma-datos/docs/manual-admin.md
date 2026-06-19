# Manual del Panel Administrativo — Plataforma de Datos *consent-first*

**Versión:** 1.0 · **Fecha:** 2026-06-19 · **Audiencia:** DPO / Equipo de Cumplimiento

Este manual describe cómo usar el panel admin interno para:
1. Revisar y validar el cumplimiento de consentimientos.
2. Verificar agencias (KYC).
3. Monitorizar logs de auditoría.
4. Atender derechos de los interesados.
5. Ejecutar y monitorizar repartos mensuales.

---

## 1. Acceso y Autenticación

### 1.1 Conectar al Panel

**URL Admin:** `https://‹PLACEHOLDER-dominio›/admin`

**Credenciales:**
- **Token:** `ADMIN_TOKEN` (secret, gestionado en `wrangler secret put`).
- **IP:** Tu acceso está restringido a una **allowlist de IPs** (configurado por el equipo de SRE).
- **Cabecera:** Incluye `Authorization: Bearer <ADMIN_TOKEN>` en toda petición.

### 1.2 Permisos y Roles

El panel admin es **monolítico**: acceso total a:
- Logs de auditoría (solo lectura).
- Estado KYC de agencias.
- Métricas del negocio.
- Ejecución manual de repartos.

**Nota:** No hay roles granulares. El panel es accesible solo a personal de cumplimiento/DPO autorizado.

---

## 2. Sección: KYC de Agencias (Verificación de Clientes B2B)

### 2.1 Listar Agencias Pendientes

**Endpoint:** `GET /v1/admin/agencias?estado=pendiente`

Devuelve todas las agencias que se han registrado pero aún no están verificadas.

**Respuesta de ejemplo:**

```json
{
  "items": [
    {
      "id": "a3f2...uuid",
      "razon_social": "Agencia Marketing Plus S.L.",
      "cif": "B87654321",
      "email": "cumplimiento@marketing-plus.es",
      "pais": "ES",
      "kyc_estado": "pendiente",
      "creado_en": "2026-06-18T15:30:00Z"
    },
    {
      "id": "b5e1...uuid",
      "razon_social": "Consultora Data S.A.",
      "cif": "A12345678",
      "email": "legal@consultora-data.es",
      "pais": "ES",
      "kyc_estado": "pendiente",
      "creado_en": "2026-06-19T09:00:00Z"
    }
  ],
  "total": 2
}
```

### 2.2 Verificar una Agencia

**Endpoint:** `POST /v1/admin/agencias/{id}/kyc`

Marca a una agencia como **verificada** (KYC pasó) o **rechazada** (no cumple requisitos).

**Petición (Verificar):**

```json
{
  "kyc_estado": "verificada",
  "contrato_firmado_en": "2026-06-19T09:00:00Z"
}
```

- **kyc_estado**: `"verificada"` o `"rechazada"`.
- **contrato_firmado_en**: Fecha ISO-8601 UTC de cuándo se firmó el contrato. Solo se incluye si es `"verificada"`.

**Respuesta `200 OK`:**

```json
{
  "id": "a3f2...uuid",
  "razon_social": "Agencia Marketing Plus S.L.",
  "kyc_estado": "verificada",
  "contrato_firmado_en": "2026-06-19T09:00:00Z"
}
```

**Petición (Rechazar):**

```json
{
  "kyc_estado": "rechazada"
}
```

**Respuesta `200 OK`:**

```json
{
  "id": "a3f2...uuid",
  "razon_social": "Agencia Marketing Plus S.L.",
  "kyc_estado": "rechazada"
}
```

La agencia recibe notificación y no puede comprar reportes hasta que se verifique.

### 2.3 Checklist: Qué Revisar Antes de Verificar

Antes de aprobar, valida:

- [ ] **CIF válido** — Existe en el Registro Mercantil. Use https://consultas.redsocial.gob.es/ o contacta al gestor fiscal.
- [ ] **Razón social coherente** — No es genérica ni sospechosa.
- [ ] **Email corporativo** — No es `@gmail.com`; es del dominio de la empresa.
- [ ] **País** — Es `"ES"` u otro donde operamos legalmente.
- [ ] **Contrato firmado** — El cliente ha aceptado los términos y la **cláusula anti-reidentificación**.

---

## 3. Sección: Logs de Auditoría

### 3.1 Ver Logs (Tabla Append-Only)

**Endpoint:** `GET /v1/admin/auditoria`

Parámetros opcionales:
- `actor` — Filtrar por quién realizó la acción (p. ej. `"sistema"`, `"admin:1234"`).
- `accion` — Filtrar por tipo de acción (p. ej. `"reporte.generado"`, `"consent.revocado"`).
- `entidad` — Tipo de entidad (p. ej. `"reportes"`, `"usuarios"`).
- `desde` — Fecha ISO-8601 (inicio del rango).
- `hasta` — Fecha ISO-8601 (fin del rango).
- `cursor` — Para paginación.

**Ejemplo:**

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  'https://api.‹PLACEHOLDER-dominio›/v1/admin/auditoria?accion=reporte.generado&desde=2026-06-01T00:00:00Z&hasta=2026-06-30T23:59:59Z'
```

**Respuesta:**

```json
{
  "items": [
    {
      "id": 1024,
      "actor": "sistema",
      "accion": "reporte.generado",
      "entidad": "reportes",
      "entidad_id": "r5d4...uuid",
      "creado_en": "2026-06-19T12:00:00Z",
      "detalles": {
        "k_aplicado": 50,
        "n_usuarios": 1840,
        "precio_centimos": 49900,
        "agencia_id": "a3f2...uuid"
      }
    },
    {
      "id": 1023,
      "actor": "admin:dpo-001",
      "accion": "agencia.kyc_verificada",
      "entidad": "agencias",
      "entidad_id": "a3f2...uuid",
      "creado_en": "2026-06-19T10:30:00Z",
      "detalles": {}
    },
    {
      "id": 1022,
      "actor": "sistema",
      "accion": "consent.revocado",
      "entidad": "consentimientos",
      "entidad_id": "c1a2...uuid",
      "creado_en": "2026-06-19T11:00:00Z",
      "detalles": {
        "usuario_id": "0e8b...uuid",
        "proposito": "venta_datos_agregados"
      }
    }
  ],
  "siguiente_cursor": "cursor_opaco_..."
}
```

### 3.2 Acciones Auditadas

Estas son las principales **acciones** que se registran:

| Acción | Entidad | Descripción | Detalles |
|--------|---------|-------------|----------|
| `usuario.creado` | `usuarios` | Nuevo usuario en la app. | `usuario_id` |
| `consent.otorgado` | `consentimientos` | Usuario dio consentimiento. | `texto_hash`, `politica_version`, `metodo` |
| `consent.revocado` | `consentimientos` | Usuario revocó consentimiento. | `usuario_id`, `proposito` |
| `contrib.registrada` | `contribuciones` | Dato recogido (seudonimizado). | `usuario_id`, `categoria` |
| `segmento.preview` | `segmentos` | Agencia consultó un preview. | `agencia_id`, `filtros` |
| `reporte.generado` | `reportes` | Reporte entregado tras pago. | `k_aplicado`, `n_usuarios`, `precio_centimos` |
| `reporte.no_entregable` | `reportes` | Reporte rechazado por < 50 usuarios. | `motivo`, `reembolsado` |
| `transaccion.pagada` | `transacciones` | Stripe confirmó pago. | `importe_centimos`, `pool_usuarios_centimos` |
| `reparto.ejecutado` | `repartos` | Fin de mes: dinero repartido a usuarios. | `periodo`, `usuarios_con_reparto`, `pool_total` |
| `agencia.kyc_verificada` | `agencias` | Admin aprobó KYC. | `agencia_id` |
| `usuario.baja` | `usuarios` | Usuario ejerció derecho al olvido. | `usuario_id` (sin PII) |

### 3.3 Detalles Sensibles

**NORMA CRÍTICA:** El campo `detalles` **nunca contiene PII innecesaria**. Por ejemplo:

- ✅ `"usuario_id": "0e8b...uuid"` (seudónimo).
- ✅ `"email_presente": true` (booleano, sin email).
- ❌ ~~`"email": "usuario@ejemplo.com"`~~ (PII innecesaria).
- ❌ ~~`"ip": "192.168.1.1"`~~ (PII innecesaria).

Si necesitas investigar un caso, contacta al equipo de datos; ellos tienen acceso a la información completa bajo protocolos de seguridad.

---

## 4. Sección: Métricas Agregadas del Negocio

### 4.1 Dashboard de KPIs

**Endpoint:** `GET /v1/admin/metricas`

Devuelve **números sin PII**: cuántos usuarios, cuántos reportes vendidos, ingresos, etc.

**Respuesta:**

```json
{
  "usuarios_activos": 12840,
  "reportes_entregados_mes": 36,
  "ingresos_centimos_mes": 1796400,
  "pool_usuarios_centimos_mes": 538920,
  "consentimientos_activos": 12810,
  "revocaciones_mes": 31,
  "agencias_verificadas": 8,
  "agencias_pendientes": 2
}
```

**Interpretación:**

- **usuarios_activos**: 12.840 seudónimos activos.
- **reportes_entregados_mes**: 36 reportes vendidos este mes.
- **ingresos_centimos_mes**: `1796400` = **17.964,00 €** (ingresos plataforma, 70 %).
- **pool_usuarios_centimos_mes**: `538920` = **5.389,20 €** (repartir a usuarios, 30 %).
- **consentimientos_activos**: 12.810 usuarios con consentimiento vigente para venta.
- **revocaciones_mes**: 31 usuarios revocaron consentimiento este mes.

### 4.2 Interpretación: Indicadores de Cumplimiento

| Métrica | Señal Roja | Acción |
|---------|-----------|--------|
| Ratio revocaciones alto (>5 % mensual) | Usuarios no entienden el consentimiento. | Revisar textos de política; simplificar. |
| Consentimientos activos caen bruscamente | Posible problema técnico o trust. | Investigar en logs; contactar usuarios. |
| Reportes `no_entregable` frecuentes (>10 %) | Segmentos solicitados son muy específicos. | Alertar a agencias; sugerir filtros más amplios. |
| Agencias pendientes > 7 días | Cuello de botella en KYC. | Establecer SLA; asignar recurso. |

---

## 5. Sección: Derechos de los Interesados (RGPD arts. 15, 17, 20)

### 5.1 Ejercer Derechos en Nombre de un Usuario (Solo en Emergencias)

**Escenario:** Un usuario solicita su derecho de supresión pero no logra usar la web. Como admin, puedes procesar manualmente.

**Endpoint (Supresión):** `DELETE /v1/yo` (admin override)

**Nota:** Esto requiere **elevación de privilegios** y **justificación en auditoría**. Solo úsalo en casos legales justificados.

### 5.2 Verificar Solicitudes Pendientes

Las solicitudes de derechos (acceso, portabilidad, supresión) se cuelan en la cola `JOBS`. Para monitorizarlas:

**Endpoint:** `GET /v1/admin/jobs?estado=pendiente`

Devuelve trabajos encolados:

```json
{
  "items": [
    {
      "job_id": "job_export_0e8b...uuid",
      "tipo": "portabilidad",
      "usuario_id": "0e8b...uuid",
      "estado": "encolado",
      "solicitado_en": "2026-06-19T14:00:00Z"
    },
    {
      "job_id": "job_delete_c1a2...uuid",
      "tipo": "supresion",
      "usuario_id": "c1a2...uuid",
      "estado": "procesando",
      "solicitado_en": "2026-06-19T13:30:00Z"
    }
  ]
}
```

**Estados:**
- `encolado` — En la cola, no ha empezado.
- `procesando` — Se está ejecutando.
- `completado` — Listo (usuario recibirá enlace de descarga).
- `error` — Falló; requiere investigación.

### 5.3 Protocolo de Supresión (Art. 17 — Derecho al Olvido)

Cuando se ejecuta una **supresión**, ocurre en cascada:

1. **Tabla `usuarios`**: Estado pasa a `'baja'`.
2. **Tabla `usuarios_contacto`**: Se borra (`ON DELETE CASCADE`).
3. **Tabla `consentimientos`**: Se borran (el usuario revocó implícitamente).
4. **Tabla `contribuciones`**: Se borran (el usuario revocó).
5. **Reportes previos**: **SE CONSERVAN** (son agregados anónimos, no datos personales).
6. **Auditoría**: Se registra `usuario.baja` sin PII.

**Explicación al usuario:**

> Tu cuenta ha sido dada de baja. Tus datos seudónimos se han eliminado. Los reportes agregados que ya se vendieron permanecen (son anónimos, no contienen información tuya). No podrás cobrar futuros repartos asociados a esta baja.

### 5.4 Tiempo de Respuesta

**RGPD art. 12**: Responder a una solicitud de derechos **en 1 mes** (prorrogable a 2 meses si es compleja).

**Checklist para tiempos:**

- [ ] **Recibida**: Registrar en auditoría con timestamp.
- [ ] **Verificación de identidad**: Confirmar que el solicitante es el usuario (o su representante legal).
- [ ] **Procesamiento**: Encolar trabajo; máximo 30 días hasta respuesta.
- [ ] **Respuesta**: Enviar al email del usuario (vía template seguro).
- [ ] **Registro**: Guardar copia de la solicitud y respuesta (auditoría, 5 años).

---

## 6. Sección: Reparto Mensual (Data Dividend)

### 6.1 Ejecutar el Reparto (Cron Manual)

**Endpoint:** `POST /v1/admin/reparto/{periodo}/ejecutar`

Dispara el reparto del mes indicado (p. ej. `"2026-06"` para junio de 2026).

**Petición:**

```json
{
  "dry_run": false
}
```

- **dry_run**: `false` = realmente crea transfers. `true` = simula (cálculos sin dinero real).

**Respuesta:**

```json
{
  "periodo": "2026-06",
  "pool_total_centimos": 538920,
  "usuarios_con_reparto": 9120,
  "creados": 9120,
  "ya_existentes": 0,
  "dry_run": false
}
```

**Explicación:**

- **pool_total_centimos**: `538920` = **5.389,20 €** (el 30 % de los pagos del mes).
- **usuarios_con_reparto**: 9.120 usuarios recibirán algo.
- **creados**: 9.120 filas nuevas en la tabla `repartos` (cada usuario, cada mes, una única fila por la constraint `UNIQUE(periodo, usuario_id)`).
- **dry_run**: `false` = los transfers ya están en Stripe Connect.

### 6.2 Cálculo del Reparto

**Fórmula:**

```
pool_mes = Σ pool_usuarios_centimos (todos los pagos con estado='pagada')

Para cada usuario U:
  peso(U) = (valor_contribuciones(U) que entraron en reportes ese mes) / (valor_total_mes)
  importe(U) = floor(pool_mes * peso(U))

Redondeo residual: los céntimos sueltos se asignan determinísticamente
para que Σ importe = pool_mes exactamente.
```

### 6.3 Estados del Reparto

**Endpoint:** `GET /v1/admin/reparto/{periodo}`

Devuelve el desglose completo de un periodo:

```json
{
  "periodo": "2026-06",
  "pool_total_centimos": 538920,
  "repartos": [
    {
      "usuario_id": "0e8b...uuid",
      "importe_centimos": 142,
      "peso_contribucion": 0.00263,
      "estado": "pagado",
      "stripe_transfer_id": "tr_...",
      "creado_en": "2026-07-01T02:00:00Z"
    },
    {
      "usuario_id": "c1a2...uuid",
      "importe_centimos": 89,
      "peso_contribucion": 0.00165,
      "estado": "pendiente",
      "creado_en": "2026-07-01T02:00:00Z"
    }
  ],
  "totales": {
    "pagados": 7340,
    "pendientes": 1780,
    "fallidos": 0
  }
}
```

**Interpretación:**

- **estado**: `pagado` = Stripe confirmó el transfer. `pendiente` = encolado. `fallido` = reintentar.
- **peso_contribucion**: Qué porcentaje del pool recibe este usuario.
- Si `estado='pendiente'` después de 2 días, hay problema en Stripe Connect.

### 6.4 Checklist Mensual

Ejecuta esto **el 1º o 2º del mes** (cuando haya repartos pendientes):

- [ ] **Dry-run**: Ejecuta con `"dry_run": true` y revisa números.
- [ ] **Validación**: Suma de importes = pool exacto; peso de usuarios razonable.
- [ ] **Ejecución real**: Con `"dry_run": false`.
- [ ] **Monitoreo**: Al día siguiente, verifica que `estado='pagado'` para todos.
- [ ] **Log**: Registra resultado en acta interna; guardar para auditoría.

---

## 7. Validación de Cargas y Cumplimiento

### 7.1 Rechazar Contribuciones sin Consentimiento

**La base de datos ya lo hace automáticamente** mediante el trigger `trg_contrib_consent_valido`:

```sql
BEFORE INSERT ON contribuciones
WHEN NEW.consentimiento_id NOT IN (
  SELECT id FROM consentimientos
  WHERE usuario_id = NEW.usuario_id
    AND revocado_en IS NULL
    AND proposito = 'venta_datos_agregados'
)
BEGIN
  SELECT RAISE(ABORT, 'Contribución sin consentimiento activo del usuario');
END;
```

**Qué significa:**

- Si un usuario intenta subir contribuciones **sin consentimiento activo**, la BD aborta la inserción.
- Como admin, no necesitas validar esto manualmente; la BD lo garantiza.

### 7.2 Inspeccionar Consentimientos Sospechosos

**Caso:** Auditoría interna requiere revisar si los consentimientos fueron genuinos.

**Endpoint:** `GET /v1/admin/consentimientos?usuario_id={uuid}`

```json
{
  "items": [
    {
      "id": "c1a2...uuid",
      "usuario_id": "0e8b...uuid",
      "proposito": "venta_datos_agregados",
      "politica_version": "2026-06-01",
      "texto_hash": "abc123def456...",
      "metodo": "web_checkbox",
      "otorgado_en": "2026-06-15T10:00:00Z",
      "revocado_en": null,
      "ip_hash": "9f86d081884c7d6d9ffd4c4f...",
      "user_agent": "Mozilla/5.0..."
    }
  ]
}
```

**Auditoría del consentimiento:**

- ✅ **texto_hash**: Coincide con versión vigente de política (guardar comprobante).
- ✅ **metodo**: `web_checkbox` = aceptó manualmente; no es pre-marcado.
- ✅ **ip_hash**: Hash seguro de la IP (no la IP en claro).
- ✅ **otorgado_en**: Fecha plausible (no masivo en horas raras).
- ⚠️ Si hay mil consentimientos en 1 segundo = fraude. Investigar.

---

## 8. Escaladas y Alertas

### 8.1 Escenarios de Riesgo

| Escenario | Acción |
|-----------|--------|
| **Mil consentimientos desde la misma IP en 1 hora.** | Bloquear IP; anular consentimientos. Notificar a seguridad. |
| **Agencia intenta descargar datos individuales (no agregados).** | Rechazar; rescindir contrato. Log de seguridad. |
| **Usuario reporta: "No di consentimiento para venta."** | Verificar logs; borrar consentimiento falso. Investigar la app. |
| **Reporte de datos especiales (salud, religión, etc.) en contribuciones.** | Anular reporte si lo hay. Revisar validación de categorías. |
| **Agencia no baja datos tras 1 año de contrato vencido.** | Contactar; citar RGPD art. 17 (supresión). Forzar baja si no coopera. |

### 8.2 Escalar a DPO

**El DPO debe ser notificado si:**

- Brecha de datos o incidente de seguridad.
- Solicitud de acceso de autoridad (AEPD, juez).
- Cambio significativo en el tratamiento (nueva categoría de datos, nuevo uso).
- Riesgo alto en DPIA.
- Reclamación de usuario sobre privacidad.

---

## 9. Plantillas y Protocolo de Respuesta

### 9.1 Email: Consentimiento Verificado

```
Asunto: Tu consentimiento para venta de datos agregados — Confirmación

Hola,

Hemos registrado tu aceptación de compartir tus datos (agregados y anonimizados) 
con agencias de marketing. Puedes revocar este consentimiento en cualquier momento 
desde tu perfil.

Detalles:
- Otorgado: 2026-06-19 a las 10:00 (UTC)
- Propósito: Venta de datos agregados y anonimizados
- Versión de política: 2026-06-01

Revócalo aquí: [enlace a tu perfil]

Preguntas: support@plataforma.es

---
Equipo de Privacidad
```

### 9.2 Email: Derecho Ejercido (Supresión)

```
Asunto: Tu solicitud de supresión ha sido procesada

Hola,

Hemos dado de baja tu cuenta como solicitaste. Tus datos seudónimos han sido 
eliminados de nuestros sistemas. Los reportes agregados que ya vendimos contienen 
datos anonimizados (sin tu identificación) y no se pueden "retirar" 
retroactivamente — esto es conforme a la ley.

Detalles:
- Solicitud recibida: 2026-06-19
- Procesada: 2026-06-20
- Datos eliminados: perfil, consentimientos, historial de contribuciones

Preguntas: support@plataforma.es

---
Equipo de Privacidad
```

---

## 10. Checklist de Tareas Mensuales

- [ ] **KYC**: Revisar agencias pendientes; aprobar/rechazar en máximo 7 días.
- [ ] **Logs**: Auditar accesos admin; buscar anomalías (búsquedas sospechosas, bulk updates).
- [ ] **Métricas**: Revisar KPIs; alertar si ratios cambian significativamente.
- [ ] **Derechos**: Procesar solicitudes pendientes; asegurar < 30 días.
- [ ] **Reparto**: Ejecutar el cron del 1-2 de mes; verificar transfers.
- [ ] **Retención**: Verificar que logs de >5 años se archivan.
- [ ] **Política**: Si cambió versión, obtener nuevos consentimientos de usuarios existentes.

---

## 11. Contacto y Escalada

- **Preguntas sobre cumplimiento:** DPO@plataforma.es
- **Incidentes de seguridad:** security@plataforma.es (urgente)
- **Soporte técnico:** tech-support@plataforma.es
- **Consulta externa:** Abogado especializado en RGPD (contacto en ISO 27001)
