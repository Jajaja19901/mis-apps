# Texto de Consentimiento para Venta de Datos Agregados Anónimos

> **DESCARGO:** Este documento es orientativo y NO constituye asesoramiento jurídico.
> Debe ser revisado por un abogado especializado en privacidad antes de su uso en producción.
>
> Versión: **1.0**
> Fecha de versión: **2026-06-19**
> ID de versión (para logs): **CONSENT-VENTA-v1.0-20260619**

---

## TEXTO EXACTO DEL OPT-IN SEPARADO PARA LA VENTA DE DATOS

> Esta sección es **INDEPENDIENTE** del consentimiento para el uso del servicio.
> Rechazarla no impide usar la aplicación.

---

### INTERFAZ (lo que ve el usuario — formulario de consentimiento)

---

**[ ] Quiero participar en el programa de datos compartidos y recibir mi parte de los ingresos**

*(Casilla desmarcada por defecto. El usuario debe marcarla activamente.)*

**Al marcar esta casilla, acepto de forma expresa y libre que {{NOMBRE_EMPRESA_PLATAFORMA}}
incluya mis datos de uso de la aplicación en reportes estadísticos anonimizados que serán
vendidos a empresas y agencias. A cambio, recibiré el {{PORCENTAJE_USUARIO}} % de los
ingresos generados por mis datos, acumulados en mi saldo mensual.**

**Entiendo que:**

1. Mis datos se transforman en estadísticas anónimas antes de ser compartidos. Las empresas
   que compran los reportes **nunca reciben mis datos personales ni ningún dato que permita
   identificarme directamente o indirectamente.** Se aplica un umbral mínimo de 50 usuarios
   por cada grupo estadístico (k-anonimato ≥ 50).

2. Este consentimiento es **completamente voluntario** y separado de mi registro en el
   servicio. Puedo rechazarlo ahora y seguir usando la app con normalidad, o aceptarlo y
   retirarlo en cualquier momento desde **Mi Perfil → Privacidad → Programa de datos**,
   con efecto desde ese momento (los reportes ya vendidos no son recuperables, al ser anónimos).

3. Los ingresos generados por mis datos se abonarán en **[método de pago: {{METODO_PAGO}}]**
   cuando mi saldo acumulado supere **{{UMBRAL_PAGO}} €**. Podría existir obligación fiscal
   de declarar estos ingresos en mi IRPF; soy responsable de consultarlo con mi asesor fiscal.

4. Los datos de uso que se incluyen en los reportes son: {{LISTA_CATEGORIAS_DATOS}}.
   **No se incluyen en ningún caso:** nombre, apellidos, DNI/NIE, email, teléfono, dirección
   postal, ni ningún otro dato que me identifique.

5. El responsable del tratamiento es **{{NOMBRE_EMPRESA_PLATAFORMA}}** (CIF: {{CIF_PLATAFORMA}},
   {{EMAIL_PRIVACIDAD}}). Puedo ejercer mis derechos de acceso, rectificación, supresión,
   limitación, portabilidad y oposición escribiendo a {{EMAIL_PRIVACIDAD}} o a través del
   portal de derechos en {{URL_PORTAL_DERECHOS}}. También puedo reclamar ante la AEPD
   (www.aepd.es) si considera que no se han atendido correctamente.

6. Puedo consultar el detalle completo en la [Política de Privacidad]({{URL_POLITICA_PRIVACIDAD}}).

---

**Botón de confirmación:** `[Activar programa y ganar con mis datos]`

*(El botón solo se activa cuando la casilla está marcada. No puede enviarse el formulario
sin marcar activamente la casilla.)*

---

**Confirmación por email (doble opt-in):**

Tras marcar la casilla y pulsar el botón, el usuario recibe un email a su dirección registrada
con el siguiente asunto y cuerpo:

> **Asunto:** Confirma tu participación en el programa de datos — {{NOMBRE_EMPRESA_PLATAFORMA}}
>
> Hola {{NOMBRE_USUARIO}},
>
> Has solicitado participar en el programa de datos compartidos de {{NOMBRE_EMPRESA_PLATAFORMA}}.
> Para confirmar tu consentimiento, pulsa el siguiente enlace:
>
> [CONFIRMAR MI PARTICIPACIÓN]({{URL_CONFIRMACION_DOBLE_OPTIN}})
>
> Este enlace caduca en 48 horas.
>
> Si no has sido tú, ignora este email: no se activará ningún cambio.
>
> — El equipo de {{NOMBRE_EMPRESA_PLATAFORMA}}

---

### REGISTRO DE CONSENTIMIENTO (lo que se guarda en base de datos)

Cada consentimiento debe generar un registro inmutable con al menos:

| Campo | Valor registrado |
|---|---|
| `user_id` | ID interno del usuario (seudonimizado) |
| `tipo_consentimiento` | `VENTA_DATOS_AGREGADOS` |
| `version_texto` | `CONSENT-VENTA-v1.0-20260619` |
| `accion` | `OTORGADO` / `RETIRADO` |
| `timestamp_utc` | Fecha y hora UTC exacta del evento |
| `ip_hash` | Hash SHA-256 de la IP (no se guarda la IP en claro) |
| `canal` | `WEB` / `APP_IOS` / `APP_ANDROID` |
| `doble_optin_confirmado` | `true` / `false` |
| `timestamp_doble_optin_utc` | Fecha y hora UTC de la confirmación por email |

El consentimiento solo se activa cuando `doble_optin_confirmado = true`.

---

### PROCEDIMIENTO DE RETIRADA DEL CONSENTIMIENTO

Cuando el usuario retira el consentimiento desde **Mi Perfil → Privacidad → Programa de datos**:

1. Se registra el evento `RETIRADO` con timestamp en el log de consentimientos.
2. Los datos futuros del usuario **dejan de incluirse** en nuevos reportes desde ese momento.
3. Los reportes ya vendidos (anónimos) **no se modifican retroactivamente** — son datos
   estadísticos anónimos, no personales.
4. Se envía email de confirmación al usuario acusando recibo de la retirada.
5. Si el usuario tiene saldo pendiente, se procesa el pago conforme a las condiciones.

---

### HISTORIAL DE VERSIONES DEL TEXTO

| Versión | Fecha | Cambios principales |
|---|---|---|
| 1.0 | 2026-06-19 | Versión inicial |

*Cada nueva versión requiere obtener nuevo consentimiento activo de los usuarios existentes.*
