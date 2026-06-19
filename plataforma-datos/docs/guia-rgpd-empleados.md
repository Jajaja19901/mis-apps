# Guía de Cumplimiento RGPD para Empleados — Plataforma de Datos *consent-first*

**Versión:** 1.0 · **Fecha:** 2026-06-19 · **Audiencia:** Todo el equipo

Esta guía resume los principios RGPD que rigen la plataforma y qué **NUNCA se puede hacer**.

---

## 1. La Filosofía: Consent-First

Nuestra plataforma se construyó sobre **consentimiento explícito y revocable**:

1. **No importamos bases de datos externas.** Solo entra dato que una persona aceptó expresamente compartir.
2. **El consentimiento es específico.** Separado por finalidad (usar la app ≠ vender datos).
3. **El consentimiento es revocable.** Un botón en el perfil, sin pasos adicionales.
4. **Los datos se agregan antes de vender.** Nunca un tercero ve a la persona individual.
5. **k-anonimato ≥ 50.** Imposible identificar a menos de 50 personas en un reporte.

---

## 2. Principios Clave del RGPD (Resumidos)

### 2.1 Licitud, Lealtad y Transparencia (art. 5.1.a)

- ✅ **Hacer:** Recoger datos cuando hay consentimiento explícito (art. 6.1.a).
- ✅ **Hacer:** Informar al usuario qué datos se recogen, por qué y quién los recibirá.
- ❌ **Nunca:** Engañar, ocultar o usar datos para finalidad distinta a la declarada.

### 2.2 Minimización (art. 5.1.c)

- ✅ **Hacer:** Recoger solo los datos necesarios para la finalidad.
- ❌ **Nunca:** "Recoger todo por si acaso"; solo `banda_edad`, `region`, `genero`, categoría.

### 2.3 Exactitud (art. 5.1.d)

- ✅ **Hacer:** Generalizar datos (banda de edad, no fecha de nacimiento).
- ❌ **Nunca:** Guardar edad exacta, dirección completa, teléfono, nombre real.

### 2.4 Confidencialidad e Integridad (art. 5.1.f)

- ✅ **Hacer:** Encriptar datos en reposo (AES-256) y en tránsito (HTTPS).
- ✅ **Hacer:** Restringir acceso por rol (solo quien lo necesita).
- ❌ **Nunca:** Compartir credenciales, logs con PII, o escribir datos en logs.

### 2.5 Rendición de Cuentas (art. 5.2)

- ✅ **Hacer:** Registrar **todos** los eventos sensibles en auditoría (`logs_auditoria`).
- ✅ **Hacer:** Conservar registros 5 años.
- ❌ **Nunca:** Borrar logs, desactivar auditoría, o no registrar accesos a PII.

---

## 3. Datos PROHIBIDOS por Ley (Art. 9 RGPD)

**El art. 9 del RGPD prohibe procesar "categorías especiales"** (salvo excepciones muy tasadas):

**PROHIBIDO RECOGER O PROCESAR:**

- ❌ Origen racial o étnico.
- ❌ Opiniones políticas.
- ❌ Creencias religiosas o filosóficas.
- ❌ Afiliación sindical.
- ❌ Datos genéticos.
- ❌ Datos biométricos (huellas, iris).
- ❌ Datos relativos a la salud.
- ❌ Datos sobre vida sexual u orientación sexual.

**Incluso inferidos indirectamente:**

Si un usuario marca `"categoría: educación_sanitaria"` + `"region: Bilbao"`, y esto permite inferir su condición médica → **PROHIBIDO**. Rechazar tal categoría.

**Nuestra solución:** La tabla `categorias_permitidas` tiene `CHECK (es_especial = 0)` → la base de datos **rechaza cualquier intento de meter categorías especiales**.

---

## 4. Las 5 Líneas Rojas (NO Negociables)

### Línea Roja 1: No Vender o Usar Datos sin Consentimiento Activo

- ❌ **NUNCA:** Usar datos para marketing de propios servicios sin consentimiento separado.
- ❌ **NUNCA:** Vender datos a terceros que no hayan firmado el contrato de confidencialidad.
- ✅ **Hacer:** Verificar `consentimientos.revocado_en IS NULL` antes de cualquier uso.

**Qué pasa técnicamente:**
```sql
-- El trigger lo garantiza:
BEFORE INSERT ON contribuciones
WHEN NEW.consentimiento_id NOT IN (
  SELECT id FROM consentimientos
  WHERE usuario_id = NEW.usuario_id
    AND revocado_en IS NULL
    AND proposito = 'venta_datos_agregados'
)
BEGIN
  SELECT RAISE(ABORT, 'Contribución sin consentimiento activo');
END;
```

### Línea Roja 2: No Reidentificar a Personas

- ❌ **NUNCA:** Intentar volver a identificar a una persona de un reporte agregado.
- ❌ **NUNCA:** Cruzar reportes con otras fuentes para inferir identidad.
- ❌ **NUNCA:** Compartir con agencias información que permita reidentificación.
- ✅ **Hacer:** El contrato con agencias incluye cláusula anti-reidentificación (verificar cumplimiento).

**Sanciones:** La AEPD puede multar hasta **20 millones €** o 4 % de ingresos globales.

### Línea Roja 3: No Copiar Datos de Una App a Otra

- ❌ **NUNCA:** Heredar base de datos de usuario de un proyecto anterior.
- ❌ **NUNCA:** "Reusar" datos sin nuevo consentimiento.
- ✅ **Hacer:** Cada app nace **como isla**; solo del consentimiento expreso del usuario **en esa app**.

**Por qué:** Cada usuario en una app es un seudónimo distinto; no hay forma legal de mezclarlos sin duplicar consentimientos.

### Línea Roja 4: No Procesar Datos Fuera del Ámbito Legal

- ❌ **NUNCA:** Procesar datos de menores sin consentimiento de tutores (art. 8).
- ❌ **NUNCA:** Transferir datos a terceros países sin SCC (Cláusulas Contractuales Tipo).
- ❌ **NUNCA:** Almacenar datos más allá del plazo de retención.
- ✅ **Hacer:** Verificar edad; aplicar SCC de la Comisión Europea; ejecutar políticas de supresión.

### Línea Roja 5: No Esconder Datos o Incidentes

- ❌ **NUNCA:** Borrar logs de auditoría o esconder accesos a datos.
- ❌ **NUNCA:** Silenciar una brecha de datos ("ya está resuelta, sin reportar").
- ✅ **Hacer:** Notificar al DPO/abogado en < 24h si hay incidente. La AEPD debe ser informada < 72h.

---

## 5. Consentimiento: El Corazón Legal

### 5.1 Características de un Consentimiento Válido (Art. 7)

- ✅ **Libre:** Sin presión, no pre-marcado, no bundled con otras finalidades.
- ✅ **Específico:** Para cada propósito (usar app ≠ vender datos).
- ✅ **Informado:** El usuario entiende qué pasa con sus datos.
- ✅ **Inequívoco:** Una acción clara (checkbox, doble opt-in, firma).
- ✅ **Documentado:** Se guarda `texto_hash` de lo que aceptó.

### 5.2 Consentimiento en la Plataforma

**Tabla `consentimientos` (append-only):**

```json
{
  "id": "c1a2...uuid",
  "usuario_id": "0e8b...uuid",
  "proposito": "venta_datos_agregados",
  "politica_version": "2026-06-01",
  "texto_hash": "SHA-256(texto_mostrado)",
  "metodo": "web_checkbox",
  "otorgado_en": "2026-06-19T10:00:00Z",
  "revocado_en": null
}
```

**Qué significa cada campo:**

- **proposito**: Por qué se recoge el consentimiento (no es negociable; solo `venta_datos_agregados`).
- **politica_version**: Versión exacta de la política de privacidad aceptada.
- **texto_hash**: Hash SHA-256 del **texto exacto** mostrado al usuario. Si cambias el texto, necesitas nuevo consentimiento.
- **metodo**: Cómo se obtuvo (`web_checkbox`, `double_opt_in_email`, etc.).
- **otorgado_en**: Timestamp exacto.
- **revocado_en**: Cuándo se revocó (NULL si está activo).

### 5.3 Cuándo Pedir Nuevo Consentimiento

- ✅ **Nuevo usuario**: First time = nuevo consentimiento.
- ✅ **Cambio de política**: El texto de privacidad cambió → pedir nuevo consentimiento a todos.
- ✅ **Nueva finalidad**: Quieres usar datos para publicidad → nuevo consentimiento (separado).
- ❌ **No es suficiente**: Enviar email diciendo "hemos actualizado la política". Necesita **acción explícita** del usuario.

---

## 6. Datos Personales vs. Anónimos

### 6.1 Durante el Proceso (RGPD Aplica)

Mientras están en la BD interna (seudónimos), el **RGPD sigue aplicando**:

- ✅ Derecho de acceso (art. 15).
- ✅ Derecho de supresión (art. 17).
- ✅ Derecho de portabilidad (art. 20).
- ✅ Limitación de uso.

### 6.2 Una Vez Agregados (RGPD NO Aplica)

El reporte final entregado a agencias es **estrictamente anónimo** (Considerando 26 RGPD):

- ✅ Ninguna fila identifica a < 50 personas (k-anonimato).
- ✅ Se eliminan identificadores directos (nombre, email, IP).
- ✅ Se generalizan cuasi-identificadores (región, banda de edad).
- ✅ Se aplica supresión si una celda tiene < 50 personas.

**Consecuencia:** El agregado ya vendido **no es dato personal**; la agencia no es sujeto de RGPD respecto a él.

**Pero:** La plataforma **sigue siendo responsable** de garantizar la anonimización (es parte del procesamiento inicial).

---

## 7. Derechos de los Usuarios (Arts. 15-22 RGPD)

### 7.1 Derecho de Acceso (Art. 15)

- **Qué es:** El usuario puede pedir copia de todos sus datos.
- **Plazo:** Responder en 1 mes.
- **Cómo se implementa:** Endpoint `GET /v1/yo` (reautenticado) devuelve JSON con perfil, consentimientos, contribuciones, repartos.

### 7.2 Derecho de Supresión / Olvido (Art. 17)

- **Qué es:** "Bórrrenme de vuestros sistemas."
- **Plazo:** 1 mes.
- **Cómo se implementa:** Endpoint `DELETE /v1/yo` (reautenticado) marca usuario como `estado='baja'` y borra en cascada.
- **Excepción:** Los reportes **ya entregados son anónimos**; no se pueden "borrar retroactivamente" del comprador.

**Mensaje al usuario:**

> Tu cuenta se ha dado de baja. Hemos eliminado tu perfil y datos. Los reportes agregados que ya vendimos contienen datos anonimizados (sin tu identificación personal) — no podemos retirarlos de nuestros compradores, pero tampoco contienen nada tuyo identificable.

### 7.3 Derecho de Portabilidad (Art. 20)

- **Qué es:** "Quiero mis datos en formato portable (JSON/CSV) para llevarme a otro servicio."
- **Plazo:** 1 mes.
- **Cómo se implementa:** Endpoint `POST /v1/yo/portabilidad` (reautenticado) encola un ZIP con todos los datos; se entrega vía R2 con URL efímera.

### 7.4 Derecho a Limitar Procesamiento (Art. 18)

- **Qué es:** "Congelad el uso de mis datos mientras investigo."
- **Cómo:** Revocar consentimiento (ver sección 7.5).

### 7.5 Derecho a Oposición (Art. 21)

- **Qué es:** "No quiero que vendáis mis datos."
- **Cómo se implementa:** Endpoint `POST /v1/consentimientos/{id}/revocar` marca consentimiento como revocado.
- **Efecto:** Desde ese momento, nuevas contribuciones de ese usuario NO entran en futuros reportes. Las pasadas ya agregadas no se pueden "sacar".

---

## 8. Seudonimización: Cómo Funciona

### 8.1 El Seudónimo

Cada usuario recibe un **UUID v4 aleatorio** (`usuarios.id`):

```
0e8b4d9a-c2f1-4e7a-b3d2-8f9c5a1d2e3f
```

Este es su **identidad operativa**. Nadie fuera de la plataforma lo conoce.

### 8.2 Email Separado y Hasheado

```
email_hash = SHA-256('usuario@ejemplo.com' || PEPPER_PII)
```

- Se guarda el hash (no el email en claro).
- Se usa para login/dedupe.
- Si necesitamos enviarle algo, hay un `email_cifrado` adicional (AES-256).

### 8.3 Datos en Claro: NUNCA

❌ **NUNCA** guardes:
- Nombre real.
- Dirección completa.
- Teléfono.
- Fecha de nacimiento exacta.
- Número de ID / pasaporte.

✅ **Solo guardar:**
- Seudónimo (UUID).
- Email hasheado.
- Banda de edad (p. ej. "25-34").
- Región (provincia/CCAA).
- Género (F/M/X).
- Categoría de interes (de la lista blanca).

---

## 9. Retención y Supresión de Datos

### 9.1 Plazos Legales

| Dato | Plazo | Base |
|------|-------|------|
| **Logs de transacciones** | 5 años | Código de Comercio art. 30; prescripción de obligaciones |
| **Contabilidad / facturas** | 6 años | Ley General Tributaria art. 66 |
| **Logs de auditoría** | 5 años | RGPD art. 5.2 (responsabilidad proactiva) |
| **Datos de perfil (usuario activo)** | Mientras esté activo + 3-5 años después | RGPD art. 17 (supresión); prescripción de reclamaciones |
| **Email en el contacto** | Mínimo 1 mes si el usuario lo solicita | Portabilidad (art. 20) |

### 9.2 Política de Supresión

- **Automático:** Cron mensual archiva logs de > 5 años a almacenamiento frío.
- **Manual:** Admin puede forzar supresión de usuario si hay solicitud legal.
- **Verificación:** Auditar que efectivamente se borró (no solo "marcado como borrado").

---

## 10. Seguridad: Defensa en Profundidad

### 10.1 Capas de Protección

| Capa | Tecnología | Responsable |
|------|-----------|-------------|
| **Transporte** | TLS 1.3 (HTTPS) | Infraestructura / Cloudflare |
| **Reposo** | AES-256 (D1 cifrado) | Cloudflare D1 |
| **Acceso** | JWT + IP allowlist | w-admin, w-ingesta |
| **Auditoría** | Append-only logs | `logs_auditoria` table |
| **Secretos** | `wrangler secret` (nunca en repo) | CI/CD / DevOps |

### 10.2 Qué NO Hacer

- ❌ **NO** escribas passwords, tokens o secretos en logs.
- ❌ **NO** imprimas datos personales en la consola del navegador.
- ❌ **NO** compartas credenciales por email o Slack.
- ❌ **NO** dejes máquinas de desarrollo con datos reales sin bloqueo.
- ❌ **NO** comitees `.env` al repo.

---

## 11. Incidentes: Protocolo de Notificación

### 11.1 ¿Qué es un Incidente?

- Acceso no autorizado a datos.
- Borrado accidental de datos.
- Corrupción de datos.
- Cualquier cosa que comprometa confidencialidad, integridad o disponibilidad.

### 11.2 Qué Hacer

1. **PARAR inmediatamente** el sistema si es necesario (aislar el fallo).
2. **Notificar al DPO y al responsable de seguridad** en < 24 horas (email urgente).
3. **Documentar:** Qué pasó, cuándo, cuántos datos, quién tiene acceso.
4. **Evaluar:** ¿Es una brecha de datos? (datos sensibles expuestos).
5. **AEPD:** Si es brecha, notificar a la AEPD en < 72 horas.
6. **Usuarios:** Si el riesgo es alto, notificar a usuarios afectados.

**NO hagas:**
- ❌ Silenciar el incidente.
- ❌ Intentar "arreglarlo" sin documentar.
- ❌ Esperar más de 24h para avisar.

---

## 12. Preguntas Frecuentes Internas

**P: ¿Puedo ver el email de un usuario para marketing interno?**  
R: NO. Sin consentimiento separado para marketing, está prohibido. Solo para operativos (pagar, soporte).

**P: Un usuario solicita "exportad mis datos a otro servicio". ¿Puedo?**  
R: Sí, es su derecho de portabilidad (art. 20). Genera un ZIP con sus datos en formato abierto.

**P: ¿Puedo reusar el seudónimo de un usuario entre apps?**  
R: NO. Cada usuario en cada app tiene un UUID distinto. No los mezcles sin nuevo consentimiento.

**P: Una agencia pide "la lista de CIFs de todos los usuarios". ¿Se la doy?**  
R: NO. Jamás. Los reportes son agregados anónimos, no listas de personas. Rescindir contrato si insisten.

**P: ¿Puedo guardar la edad exacta del usuario en vez de la banda?**  
R: NO. Minimización (art. 5.1.c): solo banda de edad. Edad exacta es más dato del necesario.

**P: Un regidor local me pide "datos de padrones de su municipio". ¿Puedo?**  
R: NO. Eso sería procesar datos para finalidad distinta. Solo para venta de reportes agregados (consentimiento original).

---

## 13. Contacto: DPO y Equipo de Compliance

**Preguntas sobre privacidad:** dpo@plataforma.es  
**Incidentes:** security@plataforma.es (URGENTE)  
**Consulta legal:** legal@plataforma.es  
**Auditoría:** audit@plataforma.es

**Recuerda:** Si dudas, pregunta al DPO. Es mejor pecar de cauteloso que violar RGPD.

---

## 14. Resumen: Las 3 Reglas de Oro

1. **Sin consentimiento activo, no hay dato.** El trigger lo garantiza.
2. **Sin k-anonimato ≥ 50, no hay reporte.** La BD rechaza < 50.
3. **Sin auditoría, no hay defensa.** Todo se registra y se conserva 5 años.

**Vivir por estas reglas es vivir seguro.**
