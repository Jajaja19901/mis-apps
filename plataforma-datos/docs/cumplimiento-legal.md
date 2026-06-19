# Checklist de Cumplimiento Legal — Plataforma B2B de Datos Agregados Anónimos (España)

> **DESCARGO:** Este documento es orientativo y NO constituye asesoramiento jurídico.
> Elaborado por un asesor de cumplimiento. Consulte con abogado especializado en privacidad
> y un DPO certificado antes de operar comercialmente.
>
> Versión 1.0 — 2026-06-19

---

## BLOQUE 1 — BASE JURÍDICA Y CONSENTIMIENTO (RGPD art. 6, 7)

- [ ] **1.1** La base jurídica para recoger y tratar datos es el **consentimiento explícito**
  (art. 6.1.a RGPD), separado por finalidad: (a) uso del servicio, (b) venta de datos
  agregados/anonimizados. Ambos consentimientos son independientes; rechazar (b) no impide
  usar el servicio.

- [ ] **1.2** El consentimiento cumple los cinco requisitos del art. 7 RGPD: **libre, específico,
  informado, inequívoco y separado para la venta**. No hay casillas pre-marcadas ni bundling.

- [ ] **1.3** Se implementa **doble opt-in** (confirmación por email) para el consentimiento de
  venta (b): genera prueba fehaciente del momento, IP, versión del texto y acción del usuario.

- [ ] **1.4** Retirar el consentimiento es **tan fácil como darlo** (art. 7.3 RGPD): un botón
  prominente en el perfil del usuario, sin pasos adicionales ni penalizaciones. Al retirar (b),
  los datos futuros dejan de incluirse en los reportes desde ese momento.

- [ ] **1.5** Se conserva el **registro de consentimientos** (timestamp, versión de texto,
  canal, IP anonimizada) para acreditar el consentimiento ante la AEPD si fuese requerido.

- [ ] **1.6** Cada vez que el texto del consentimiento cambia, se obtiene **nuevo consentimiento
  activo** de los usuarios existentes (no basta con notificar).

---

## BLOQUE 2 — ANONIMIZACIÓN Y K-ANONIMATO

- [ ] **2.1** Los reportes vendidos a agencias son **estrictamente anónimos** (Considerando 26
  RGPD): una vez anonimizados, el RGPD no aplica a esos datos. La anonimización es irreversible
  y se ha documentado técnicamente el proceso.

- [ ] **2.2** Se aplica **k-anonimato con k ≥ 50**: ningún registro en un reporte identifica
  a menos de 50 individuos. El módulo `src/k-anonimato.mjs` implementa y tests validan esto.

- [ ] **2.3** Se verifica adicionalmente contra **l-diversity** o **t-closeness** para atributos
  sensibles (evitar ataques de homogeneidad). ⚠ A confirmar con experto en privacidad técnica.

- [ ] **2.4** Las agencias reciben **solo el agregado final** (CSV/JSON sin microdatos). No se
  les da acceso a la base de datos ni a datos individuales, ni siquiera seudónimos.

- [ ] **2.5** El contrato con agencias incluye **prohibición expresa de reidentificación** y
  auditoría del uso. Ver `contratos/contrato-agencia-cliente.md`.

- [ ] **2.6** Se documentan las técnicas de anonimización aplicadas (generalización, supresión,
  perturbación si aplica) en el Registro de Actividades de Tratamiento.

---

## BLOQUE 3 — REGISTRO DE ACTIVIDADES DE TRATAMIENTO (RAT) (art. 30 RGPD)

> **Importante:** Desde el RGPD (mayo 2018) **NO existe el antiguo "registro de ficheros"
> en la AEPD**. La obligación es mantener un **RAT interno**, en papel o soporte electrónico,
> que la autoridad puede solicitar en cualquier momento. No se "inscribe" nada en la AEPD.

- [ ] **3.1** Se dispone de un **RAT interno** con al menos: nombre y datos del responsable,
  finalidades del tratamiento, descripción de categorías de interesados y datos, destinatarios,
  transferencias a terceros países, plazos de supresión y descripción técnica de seguridad.

- [ ] **3.2** El RAT diferencia al menos **tres actividades**: (a) gestión de usuarios/servicio,
  (b) generación y venta de reportes anónimos, (c) gestión de pagos y contabilidad.

- [ ] **3.3** El RAT se mantiene actualizado cuando cambia el tratamiento. Es un documento vivo.

---

## BLOQUE 4 — DPO / DPD (art. 37 RGPD, art. 34 LOPDGDD)

> El art. 37.1.b RGPD exige DPD cuando el responsable lleva a cabo "de forma habitual y
> sistemática, observación a gran escala de interesados". La AEPD ha interpretado esto de
> forma amplia para tratamientos comerciales de datos a escala.

- [ ] **4.1** Analizar si la plataforma supera el umbral de "gran escala": **si el número de
  usuarios es relevante (miles+) y el tratamiento es el núcleo del negocio**, la designación
  de DPD es obligatoria o muy recomendable. ⚠ Confirmar con abogado/DPO.

- [ ] **4.2** Si se designa DPD: **notificar a la AEPD** (art. 37.7 RGPD) a través del portal
  de la AEPD (sede.agpd.gob.es). Esto SÍ se comunica externamente, a diferencia del RAT.

- [ ] **4.3** El DPD debe ser independiente, tener acceso a la dirección, no recibir instrucciones
  sobre sus funciones y tener recursos suficientes (art. 38 RGPD).

- [ ] **4.4** Si no se designa DPD, documentar la decisión razonada y guardarla en el RAT.

---

## BLOQUE 5 — EIPD / DPIA Y CONSULTA PREVIA (art. 35, 36 RGPD)

- [ ] **5.1** Realizar una **Evaluación de Impacto (DPIA)** antes de iniciar el tratamiento.
  La DPIA es **muy probablemente obligatoria** aquí: tratamiento a gran escala de datos de
  comportamiento + transferencia comercial a terceros entra en los supuestos de la lista
  de la AEPD (Resolución AEPD de 2019, actualizada).

- [ ] **5.2** La DPIA debe incluir: descripción del tratamiento y sus finalidades, evaluación
  de necesidad y proporcionalidad, evaluación de riesgos para los interesados, medidas
  previstas para afrontar los riesgos.

- [ ] **5.3** Si tras la DPIA los riesgos residuales son **altos y no mitigables**, se debe
  realizar **consulta previa a la AEPD** (art. 36) antes de procesar. La AEPD tiene 8 semanas
  para responder (prorrogables a 14).

- [ ] **5.4** La DPIA se revisa cada vez que el tratamiento cambia significativamente.

---

## BLOQUE 6 — MINIMIZACIÓN, CATEGORÍAS ESPECIALES Y SEUDONIMIZACIÓN (art. 5, 9, C.26)

- [ ] **6.1** **Minimización** (art. 5.1.c): solo se recogen los datos estrictamente necesarios
  para la finalidad. Revisar cada campo del esquema `db/schema.sql` y eliminar lo superfluo.

- [ ] **6.2** **Categorías especiales** (art. 9): verificar que ningún dato recogido o inferido
  revela origen racial, salud, orientación sexual, religión, opiniones políticas, etc. Si algún
  dato pudiera inferirse, aplicar supresión o generalización antes del reporte. ⚠ Revisar con DPO.

- [ ] **6.3** **Seudonimización ≠ anonimización** (C.26 RGPD): los datos internos antes de
  agregar son seudónimos (el RGPD sigue aplicando); solo el reporte final agregado es anónimo.
  Aplicar controles de acceso estrictos a la capa seudónima interna.

- [ ] **6.4** Los datos seudónimos internos se almacenan en base de datos cifrada (AES-256
  o equivalente) y las claves de pseudonimización se gestionan separadas de los datos.

---

## BLOQUE 7 — DERECHOS DE LOS INTERESADOS (art. 15-22 RGPD)

- [ ] **7.1** Canal habilitado (email + formulario web) para ejercer derechos: **acceso (15),
  rectificación (16), supresión/olvido (17), limitación (18), portabilidad (20), oposición (21)**.

- [ ] **7.2** Plazo de respuesta: **1 mes**, prorrogable 2 meses con notificación al interesado.

- [ ] **7.3** Derecho de **supresión (art. 17)**: elimina datos seudónimos internos del usuario.
  Los reportes anónimos ya generados y vendidos NO son datos personales (C.26) y no se pueden
  "borrar retroactivamente" del comprador — explicarlo al usuario en la política de privacidad.

- [ ] **7.4** Derecho de **portabilidad (art. 20)**: exportar en formato estructurado (JSON/CSV)
  los datos del perfil y el historial de consentimientos.

- [ ] **7.5** **Deber de información (art. 13)**: en el momento de recogida, informar de:
  identidad del responsable, finalidades y base jurídica, destinatarios (agencias anónimas),
  plazos de conservación, derechos, derecho a reclamar ante la AEPD.

---

## BLOQUE 8 — ENCARGADOS DE TRATAMIENTO Y TRANSFERENCIAS INTERNACIONALES (art. 28, 46)

- [ ] **8.1** Firmar **Acuerdo de Encargo de Tratamiento (DPA)** con **Cloudflare** (CDN/WAF)
  antes de activar el servicio. Cloudflare ofrece su DPA estándar en el panel. Verificar que
  las transferencias a EE.UU. se amparan en las **Cláusulas Contractuales Tipo (SCC)** de la
  Comisión Europea (Decisión 2021/914).

- [ ] **8.2** Firmar **DPA con Stripe** para el procesamiento de pagos. Stripe ofrece su DPA
  online. Verificar cobertura SCC para transferencias a EE.UU.

- [ ] **8.3** Registrar todos los encargados en el RAT con la base de transferencia aplicable.

- [ ] **8.4** Las **agencias compradoras** de reportes anónimos NO son encargadas de tratamiento
  (reciben datos ya anónimos, fuera del ámbito RGPD); son terceros receptores. El contrato
  mercantil estándar es suficiente, más la cláusula anti-reidentificación.

- [ ] **8.5** Si alguna agencia procesara datos personales que la plataforma le entregara
  (lo que NO ocurre aquí), sería encargada y requeriría DPA. No mezclar escenarios.

---

## BLOQUE 9 — KYC DE AGENCIAS Y AML (Ley 10/2010)

- [ ] **9.1** La Ley 10/2010 de prevención del blanqueo de capitales aplica a los **sujetos
  obligados** listados en su art. 2 (entidades financieras, aseguradoras, notarios, etc.).
  Una plataforma SaaS B2B de datos **no es sujeto obligado** salvo que gestione fondos de
  clientes o preste servicios de pago como actividad principal. ⚠ Confirmar con abogado.

- [ ] **9.2** Stripe, como entidad de pago regulada, aplica su propio KYC/AML sobre los
  pagos procesados. La plataforma NO necesita duplicar controles AML sobre los pagos si
  usa Stripe como procesador; sí debe colaborar con Stripe ante requerimientos.

- [ ] **9.3** Implementar **KYC básico de negocio** para las agencias: verificación de CIF,
  razón social, datos de contacto y persona responsable antes de activar el acceso a reportes.
  Esto es buena práctica comercial aunque no sea obligación AML directa.

---

## BLOQUE 10 — RETENCIÓN Y SUPRESIÓN DE DATOS (art. 5.1.e)

- [ ] **10.1** **Logs de auditoría / transacciones** (quién compró qué reporte, cuándo, precio):
  conservar **5 años** (prescripción general de obligaciones mercantiles, art. 943 Cco y Ley
  de Auditoría). Base: interés legítimo/obligación legal.

- [ ] **10.2** **Documentación contable y fiscal** (facturas, recibos, registros IVA):
  conservar **4 años** (Ley 58/2003 General Tributaria, art. 66) o **6 años** (Código de
  Comercio art. 30). Se recomienda el plazo más largo (6 años) para cubrir ambas normas.

- [ ] **10.3** **Registros AML** (si la plataforma fuera sujeto obligado — ver 9.1):
  **10 años** (art. 25 Ley 10/2010). Solo si aplica.

- [ ] **10.4** **Datos de perfil y consentimientos de usuarios**: mientras el usuario esté
  activo + plazo de prescripción de posibles reclamaciones (generalmente 3-5 años tras baja).
  Después, suprimir o anonimizar definitivamente.

- [ ] **10.5** Cada categoría de dato tiene su finalidad, plazo y responsable documentados
  en el RAT. No conservar datos "por si acaso".

---

## BLOQUE 11 — FISCALIDAD DEL REPARTO A USUARIOS (remitir a gestor fiscal)

> ⚠ Área fiscal: remitir SIEMPRE a gestor/asesor fiscal. Lo siguiente es orientativo.

- [ ] **11.1** El 30 % que recibe el usuario por sus datos podría calificarse como **rendimiento
  del capital mobiliario** o **rendimiento de actividad económica** (si el usuario actúa de
  forma habitual/organizada), sujeto a IRPF. ⚠ Confirmar con gestor.

- [ ] **11.2** Si la plataforma abona más de **300 €/año por usuario**, podría estar obligada
  a presentar el **modelo 347** (operaciones con terceros) o, si se califica como rendimiento
  del trabajo/actividad, practicar **retención a cuenta**. ⚠ Confirmar umbral y modelo exacto
  con gestor fiscal.

- [ ] **11.3** Generar y conservar justificante de cada pago a usuario (importe, fecha, concepto)
  para facilitar la declaración y acreditar ante Hacienda.

- [ ] **11.4** Los usuarios deben ser informados de su posible obligación de declarar estos
  ingresos en su IRPF (incluirlo en la política de privacidad o en las FAQs).

---

## BLOQUE 12 — LSSI-CE Y COOKIES

- [ ] **12.1** Publicar **Aviso Legal** accesible desde todas las páginas (Ley 34/2002, art. 10):
  razón social, NIF, domicilio, datos registrales, email de contacto. Ver plantilla en
  `contratos/aviso-legal.md`.

- [ ] **12.2** Publicar **Política de Privacidad** completa (art. 13 RGPD + LOPDGDD).
  Ver plantilla en `contratos/politica-privacidad.md`.

- [ ] **12.3** Si se usan cookies no esenciales (analítica, marketing): **banner de cookies**
  ANTES de cargarlas, con posibilidad de rechazar categoría a categoría. Las cookies de sesión
  y seguridad son exentas (AEPD, Guía de Cookies 2023).

- [ ] **12.4** No enviar **comunicaciones comerciales** sin consentimiento previo y expreso
  (art. 21 LSSI-CE). El consentimiento de uso del servicio no cubre comunicaciones de marketing.

---

## A CONFIRMAR CON ABOGADO / DPO

Los siguientes puntos requieren criterio jurídico especializado y NO deben decidirse solo
con este checklist:

1. **Obligatoriedad del DPD**: depende de la escala real del tratamiento y la interpretación
   actualizada de la AEPD. Obtener opinión jurídica formal antes de decidir no designarlo.
2. **Categorías especiales inferidas**: si los datos de comportamiento permiten inferir salud
   o ideología, el art. 9 RGPD requiere consentimiento explícito adicional o una excepción
   tasada.
3. **Calificación fiscal del reparto**: el régimen de retenciones e información fiscal del
   30 % pagado a usuarios debe ser validado por gestor fiscal con los modelos concretos.
4. **Plazos de conservación definitivos**: los indicados son orientativos; el gestor legal
   y fiscal debe fijar los plazos exactos atando cada dato a su finalidad.
5. **Suficiencia técnica del k-anonimato k≥50**: aunque es un umbral robusto, la AEPD no
   ha publicado un umbral oficial. Documentar la elección técnica y, si el volumen crece,
   revisar con experto en privacidad diferencial.
6. **DPIA y consulta previa**: la obligatoriedad debe ser evaluada formalmente. Si hay dudas,
   realizar la DPIA y si el riesgo residual es alto, consultar a la AEPD antes de operar.
7. **Aplicabilidad de Ley 10/2010 (AML)**: confirmar con abogado si el modelo de negocio
   concreto cae dentro de los sujetos obligados.
