# Política de Privacidad — Plantilla

> **DESCARGO:** Esta plantilla es orientativa y NO constituye asesoramiento jurídico.
> Debe ser completada con los datos reales y revisada por un abogado antes de publicarla.
>
> Versión 1.0 — 2026-06-19

---

# POLÍTICA DE PRIVACIDAD DE {{NOMBRE_EMPRESA_PLATAFORMA}}

*Última actualización: {{FECHA_ÚLTIMA_ACTUALIZACIÓN}}*

---

## 1. RESPONSABLE DEL TRATAMIENTO

El responsable del tratamiento de sus datos personales es:

- **Razón social:** {{NOMBRE_EMPRESA_PLATAFORMA}}
- **CIF:** {{CIF_PLATAFORMA}}
- **Domicilio:** {{DOMICILIO_PLATAFORMA}}
- **Correo electrónico de contacto:** {{EMAIL_CONTACTO}}
- **Correo electrónico de privacidad / DPD:** {{EMAIL_PRIVACIDAD}}
- **Teléfono:** {{TELEFONO_CONTACTO}}

{{#SI_HAY_DPD}}
**Delegado de Protección de Datos (DPD/DPO):** {{NOMBRE_DPD}}, contactable en {{EMAIL_DPD}}.
{{/SI_HAY_DPD}}

---

## 2. DATOS QUE RECOGEMOS Y POR QUÉ

Tratamos sus datos para las siguientes finalidades, con la base jurídica indicada:

### 2.1 Gestión del registro y uso del servicio
- **Datos:** correo electrónico, contraseña (en hash), datos de perfil opcionales,
  datos de uso de la aplicación (navegación, funciones usadas, timestamps).
- **Base jurídica:** ejecución del contrato de servicio (art. 6.1.b RGPD).
- **Plazo de conservación:** durante la vigencia de la cuenta + {{PLAZO_POST_BAJA}} años
  tras la baja, para atender posibles reclamaciones.

### 2.2 Programa de datos compartidos (SOLO si usted ha dado su consentimiento)
- **Datos incluidos en reportes:** {{LISTA_CATEGORIAS_DATOS_ANONIMIZADOS}}.
- **Datos EXCLUIDOS siempre:** nombre, apellidos, DNI/NIE, email, teléfono, dirección,
  y cualquier otro dato que le identifique directamente.
- **Base jurídica:** consentimiento explícito y separado (art. 6.1.a RGPD).
- **Proceso:** sus datos de uso se agregan junto con los de al menos 49 otros usuarios
  (k-anonimato k ≥ 50) antes de ser incluidos en cualquier reporte. Los reportes no
  contienen datos personales.
- **Destinatarios:** empresas y agencias compradoras de reportes estadísticos anónimos.
  Estas empresas no reciben ningún dato que le identifique.
- **Plazo:** mientras mantenga el consentimiento activo.
- **Puede retirar este consentimiento en cualquier momento** desde Mi Perfil → Privacidad,
  sin que ello afecte al uso del servicio ni a los datos ya anonimizados en reportes previos.

### 2.3 Gestión de pagos y facturación
- **Datos:** datos de pago (gestionados directamente por Stripe; {{NOMBRE_EMPRESA_PLATAFORMA}}
  no almacena datos de tarjeta en claro), dirección de facturación, historial de transacciones.
- **Base jurídica:** ejecución del contrato y cumplimiento de obligación legal (fiscal/contable).
- **Plazo de conservación:** {{PLAZO_CONSERVACION_FISCAL}} años (obligación fiscal y mercantil).

### 2.4 Comunicaciones del servicio (avisos, cambios, soporte)
- **Datos:** correo electrónico.
- **Base jurídica:** ejecución del contrato / interés legítimo (art. 6.1.f RGPD).
- **No enviamos publicidad de terceros sin su consentimiento previo.**

### 2.5 Seguridad y prevención de fraude
- **Datos:** logs de acceso (IP, timestamp, acción), registros de autenticación.
- **Base jurídica:** interés legítimo (art. 6.1.f RGPD) en mantener la seguridad del servicio.
- **Plazo:** {{PLAZO_CONSERVACION_LOGS}} meses / años según tipo de log.

---

## 3. DESTINATARIOS DE SUS DATOS

Sus datos personales pueden ser comunicados a:

| Destinatario | Finalidad | País | Base de transferencia |
|---|---|---|---|
| **Stripe, Inc.** | Procesamiento de pagos | EE.UU. | SCC (Decisión CE 2021/914) + DPA firmado |
| **Cloudflare, Inc.** | CDN, seguridad web, DNS | EE.UU. | SCC (Decisión CE 2021/914) + DPA firmado |
| **{{PROVEEDOR_HOSTING}}** | Alojamiento de servidores | {{PAIS_HOSTING}} | {{BASE_TRANSFERENCIA_HOSTING}} |
| **{{PROVEEDOR_EMAIL}}** | Envío de emails transaccionales | {{PAIS_EMAIL}} | {{BASE_TRANSFERENCIA_EMAIL}} |

**Las agencias compradoras de reportes** NO son destinatarias de sus datos personales:
reciben únicamente estadísticas anónimas que no le identifican.

---

## 4. SUS DERECHOS

Como interesado, puede ejercer en cualquier momento los siguientes derechos:

- **Acceso (art. 15 RGPD):** obtener confirmación de si tratamos sus datos y una copia de ellos.
- **Rectificación (art. 16):** corregir datos inexactos o incompletos.
- **Supresión / "derecho al olvido" (art. 17):** solicitar la eliminación de sus datos
  cuando, entre otros, el consentimiento sea la base y lo retire. Nota: los reportes
  estadísticos anónimos ya generados no son datos personales y no pueden suprimirse.
- **Limitación del tratamiento (art. 18):** en ciertos supuestos, solicitar que dejemos
  de tratar sus datos temporalmente.
- **Portabilidad (art. 20):** recibir sus datos en formato estructurado, de uso común
  y lectura mecánica, cuando el tratamiento se base en consentimiento o contrato.
- **Oposición (art. 21):** oponerse al tratamiento basado en interés legítimo.
- **No ser objeto de decisiones automatizadas (art. 22):** no tomar decisiones que le
  afecten significativamente basadas exclusivamente en tratamiento automatizado.

**Cómo ejercerlos:** por escrito a {{EMAIL_PRIVACIDAD}} o a través del portal en
{{URL_PORTAL_DERECHOS}}, adjuntando copia de su DNI/NIE u otro documento identificativo.
Responderemos en el plazo de **1 mes** (prorrogable 2 meses adicionales en casos complejos).

**Derecho a reclamar ante la AEPD:** si considera que sus derechos no han sido atendidos,
puede presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).

---

## 5. SEGURIDAD DE LOS DATOS

Aplicamos medidas técnicas y organizativas adecuadas para proteger sus datos frente a acceso
no autorizado, pérdida, destrucción o alteración, incluyendo: cifrado en tránsito (TLS 1.2+),
cifrado en reposo, control de acceso por roles, seudonimización de datos de uso, y auditorías
periódicas de seguridad.

---

## 6. MENORES DE EDAD

El servicio no está dirigido a menores de {{EDAD_MINIMA}} años. No recogemos conscientemente
datos de menores. Si tiene conocimiento de que un menor nos ha proporcionado datos, contáctenos
en {{EMAIL_PRIVACIDAD}} para proceder a su eliminación.

---

## 7. CAMBIOS EN ESTA POLÍTICA

Cuando realicemos cambios sustanciales, le notificaremos por email y/o mediante un aviso
prominente en la aplicación, y —si los cambios afectan al consentimiento de venta—
solicitaremos su consentimiento de nuevo.

---

## 8. FISCALIDAD DE LOS PAGOS DEL PROGRAMA DE DATOS

Los importes que reciba por su participación en el programa de datos compartidos pueden
estar sujetos a tributación en el IRPF como rendimiento del capital mobiliario u otra
categoría. {{NOMBRE_EMPRESA_PLATAFORMA}} no practica retención fiscal salvo que sea
legalmente obligatorio. Le recomendamos consultar con su asesor fiscal sobre sus
obligaciones de declaración.

---

## 9. CONTACTO

Para cualquier consulta sobre esta política:
**{{EMAIL_PRIVACIDAD}}** | **{{TELEFONO_CONTACTO}}**
