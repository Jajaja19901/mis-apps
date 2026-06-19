# Informe Legal — Marco Jurídico para APP de Cesión Voluntaria de Datos con Reparto de Ganancias

**Agente 1 — Investigación Legal**
Fecha: 19 de junio de 2026
Modelo de negocio analizado: plataforma que recaba datos personales con consentimiento explícito del usuario y le reparte una parte de los ingresos cuando dichos datos se monetizan con terceros (data brokers / anunciantes).
Marco normativo analizado: RGPD (UE 2016/679), LO 3/2018 (LOPDGDD), LSSI-CE (Ley 34/2002), Directiva 2019/770, Directiva ePrivacy, Dictamen EDPB 8/2024.

---

## 1. BASE JURÍDICA: ¿Puede el consentimiento ser "libre" si se paga por los datos?

### El problema del art. 7.4 RGPD y el Considerando 43

El artículo 7.4 del RGPD establece que al valorar si el consentimiento es libre se tendrá en cuenta si la ejecución de un contrato o la prestación de un servicio **está condicionada al consentimiento** para el tratamiento de datos que no es necesario para esa ejecución. El Considerando 43 añade que el consentimiento **no se presumirá libremente prestado** cuando exista un desequilibrio claro de poder entre el interesado y el responsable del tratamiento.

### Dictamen EDPB 8/2024 sobre modelos "Consent or Pay"

El Comité Europeo de Protección de Datos (EDPB/CEPD) publicó en abril de 2024 su **Dictamen 08/2024** sobre la validez del consentimiento en modelos de consentimiento o pago implementados por grandes plataformas. Sus conclusiones principales:

- Un modelo donde el usuario "cede sus datos O paga dinero" solo es válido si existe una **tercera alternativa equivalente** — una opción gratuita que implique tratamiento mínimo o nulo de datos personales para publicidad comportamental.
- El EDPB afirma que ofrecer únicamente la dicotomía "paga o consiente" **no garantiza un consentimiento libre** porque el usuario no tiene una alternativa real sin perjuicio económico.
- En el modelo **inverso** (el usuario cede datos y RECIBE dinero), la lógica es diferente: el usuario es el beneficiario activo y la cesión es voluntaria e iniciada por él. Sin embargo, el EDPB exige igualmente que el consentimiento sea granular, revocable sin penalización futura para datos no cedidos, y que el usuario tenga plena comprensión de para qué y a quién se ceden sus datos.

### Conclusión para el modelo de reparto de ganancias

La base jurídica adecuada es el **consentimiento explícito** (art. 6.1.a RGPD), con las siguientes condiciones para que sea válido:
- Cada finalidad de tratamiento y cada categoría de datos tiene su propia casilla (granularidad).
- La revocación del consentimiento no implica perder los pagos ya recibidos ni generar penalizaciones.
- El usuario puede participar en la plataforma sin ceder todas las categorías de datos (selección parcial).
- El desequilibrio de poder es menor porque el usuario es el oferente activo, pero debe quedar acreditado que la plataforma no impone condiciones de acceso vinculadas a la cesión de datos sensibles.

**Fuentes:**
- EDPB Dictamen 08/2024 (Consent or Pay): https://www.edpb.europa.eu/news/news/2024/edpb-consent-or-pay-models-should-offer-real-choice_es
- RGPD Considerando 43 y art. 7.4: https://gdpr-info.eu/recitals/no-43/
- EDPB Guidelines 05/2020 sobre consentimiento: https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_es.pdf

---

## 2. ROL DEL TITULAR DE LA APP

La plataforma actúa como **responsable del tratamiento** (art. 4.7 RGPD): determina los fines y medios del tratamiento de los datos de los usuarios.

Cuando comparte datos con terceros (anunciantes, data brokers, compradores de datos):
- Los terceros que reciben los datos y determinan para qué los usan son **corresponsables o responsables independientes**.
- Si la plataforma solo facilita el canal técnico de transmisión siguiendo instrucciones del tercero, podría ser **encargada del tratamiento** (art. 28 RGPD) para esa fase, pero la realidad es que suele ser corresponsable.
- En cualquier caso, se requiere un **contrato de encargado de tratamiento** (art. 28) o un **acuerdo de corresponsabilidad** (art. 26) con cada tercero que reciba datos.

**Obligaciones como responsable:**
1. Registrar todas las actividades de tratamiento (art. 30 RGPD).
2. Implementar medidas técnicas y organizativas apropiadas (art. 25 — privacidad por diseño).
3. Informar a los usuarios antes de recoger sus datos (arts. 13-14).
4. Responder a los derechos de los interesados (arts. 15-22).
5. Notificar brechas de seguridad a la AEPD en 72 horas (art. 33) y a los afectados si hay alto riesgo (art. 34).

---

## 3. CONSENTIMIENTO GRANULAR: REQUISITOS DE VALIDEZ

Según el RGPD (art. 4.11, arts. 6.1.a y 7) y las **Directrices EDPB 05/2020**, el consentimiento válido debe ser:

| Requisito | Explicación práctica para el modelo |
|-----------|--------------------------------------|
| **Libre** | El usuario puede participar sin ceder todas las categorías; la revocación no genera penalización futura |
| **Informado** | Antes de marcar la casilla, el usuario lee qué datos, para qué finalidad, quiénes son los destinatarios y qué retribución obtiene |
| **Específico** | Una casilla separada por cada finalidad y categoría de datos; no vale un consentimiento global |
| **Inequívoco** | Acción afirmativa positiva (checkbox sin marcar por defecto); no vale inacción ni casilla premarcada |
| **Separable** | El usuario puede aceptar unos tratamientos y rechazar otros sin perder el acceso a la plataforma |
| **Revocable** | Posibilidad de retirar el consentimiento en cualquier momento con la misma facilidad con que se dio (art. 7.3 RGPD); los tratamientos previos al retiro siguen siendo lícitos |
| **Registrado** | La plataforma debe conservar prueba de cuándo y cómo se otorgó cada consentimiento (quién, cuándo, qué versión del formulario, IP/timestamp) |

**Fuente:** EDPB Guidelines 05/2020: https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_es.pdf

---

## 4. DATOS DE CATEGORÍA ESPECIAL (art. 9 RGPD)

El artículo 9 RGPD prohíbe por defecto el tratamiento de:
- Origen racial o étnico
- Opiniones políticas
- Convicciones religiosas o filosóficas
- Afiliación sindical
- Datos genéticos
- Datos biométricos para identificar unívocamente a personas
- Datos relativos a la salud
- Vida sexual u orientación sexual

### Condiciones para monetizarlos

Solo es lícito tratarlos para cederlos a terceros si **concurren simultáneamente**:
1. **Consentimiento explícito** del interesado para esa finalidad concreta (art. 9.2.a RGPD). En España, el art. 9.1 LOPDGDD añade que el solo consentimiento **no basta** para datos cuya finalidad principal sea identificar ideología, afiliación sindical, religión u orientación sexual — se requiere base adicional.
2. La cesión no puede usarse para tomar decisiones discriminatorias (scoring laboral, acceso a crédito, seguros con datos de salud no declarados, etc.).
3. DPIA obligatoria antes de iniciar el tratamiento.

### Recomendación para el MVP

**No incluir en la v1** categorías especiales (salud, ideología, biometría). Si en el futuro se añaden, hacerlo solo bajo consentimiento explícito por finalidad específica, con DPIA previa y con mecanismos de borrado selectivo.

**Fuente:** art. 9 RGPD: https://www.privacy-regulation.eu/es/9.htm | AEPD FAQ bases legitimación datos especiales: https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/5-bases-legitimadoras-del-tratamiento/FAQ-0215-cuales-son-las-bases-de-legitimacion-para-el-tratamiento-de-las-categorias-especiales-de-datos

---

## 5. INFORMACIÓN OBLIGATORIA ANTES DE RECOGER DATOS (arts. 13-14 RGPD)

Cuando los datos se recaban directamente del usuario (art. 13), la plataforma debe informar de:

1. **Identidad y datos de contacto** del responsable del tratamiento (denominación, CIF, dirección, email).
2. **Datos de contacto del DPO** (si existe).
3. **Finalidades del tratamiento** y la base jurídica (consentimiento, art. 6.1.a).
4. **Intereses legítimos** perseguidos (si aplica art. 6.1.f — en este modelo no aplica, usar consentimiento).
5. **Destinatarios o categorías de destinatarios** de los datos: identificar a qué tipo de compradores/clientes se cederán los datos (anunciantes, empresas de estudios de mercado, etc.). Si son destinatarios concretos identificables, listarlos; si no, categorías.
6. **Transferencias internacionales**: si datos van fuera del EEE, indicar el mecanismo (decisión de adecuación, cláusulas contractuales tipo, etc.).
7. **Plazos de conservación** de cada categoría de datos.
8. **Existencia de decisiones automatizadas** y perfilado (art. 22), con lógica aplicada e importancia y consecuencias previstas.
9. **Derechos del interesado**: acceso, rectificación, supresión, oposición, limitación, portabilidad, revocación del consentimiento, reclamación ante la AEPD.
10. **Derecho a retirar el consentimiento** en cualquier momento sin que ello afecte a la licitud del tratamiento anterior.
11. **Información sobre el reparto económico**: cuánto y cuándo recibirá el usuario, qué ocurre con los datos si revoca el consentimiento.

Esta información debe darse **en el momento de recabar los datos**, en lenguaje claro y sencillo, de forma concisa y accesible. Se recomienda un modelo por capas (resumen + detalle en política de privacidad ampliada).

**Fuente:** AEPD Guía modelo cláusula informativa: https://www.aepd.es/guias/guia-modelo-clausula-informativa.pdf | AEPD derecho de información: https://www.aepd.es/en/rights-and-duties/know-your-rights/right-information

---

## 6. DERECHOS DEL INTERESADO OBLIGATORIOS

Todos los derechos deben poder ejercerse de forma sencilla, gratuita y sin obstáculos. El responsable dispone de **1 mes** para responder, prorrogable 2 meses más si la complejidad lo justifica (notificando la prórroga al interesado). Fuente: arts. 15-22 RGPD; confirmado por AEPD: https://www.aepd.es/preguntas-frecuentes/1-tus-derechos/2-tus-derechos-de-proteccion-de-datos/FAQ-0105-que-derechos-reconoce-el-rgpd-a-los-afectados

| Derecho | Base legal | Implementación en la app |
|---------|-----------|--------------------------|
| **Acceso** (art. 15) | RGPD art. 15 | Panel personal: "Descarga mis datos" — exporta JSON/CSV de todos los datos almacenados |
| **Rectificación** (art. 16) | RGPD art. 16 | Panel personal: formulario de edición de perfil con guardado confirmado |
| **Supresión / Derecho al olvido** (art. 17) | RGPD art. 17 | Botón "Eliminar mi cuenta y todos mis datos" — borrado efectivo en 30 días (incluyendo notificación a terceros que recibieron datos) |
| **Oposición** (art. 21) | RGPD art. 21 | Cada consentimiento granular puede desactivarse; también "Detener todos los tratamientos" sin borrar la cuenta |
| **Limitación del tratamiento** (art. 18) | RGPD art. 18 | Opción "Pausar cesión de mis datos" — datos se conservan pero no se ceden mientras está pausado |
| **Portabilidad** (art. 20) | RGPD art. 20 — aplica solo a tratamientos basados en consentimiento o contrato | Exportación en formato estándar (JSON, CSV) de todos los datos facilitados activamente por el usuario |
| **Revocación del consentimiento** (art. 7.3) | RGPD art. 7.3 | Interruptor (toggle) por categoría de datos en el panel de preferencias; efectivo inmediatamente |
| **No ser objeto de decisiones automatizadas** (art. 22) | RGPD art. 22 | Si se usa perfilado para asignar precio/remuneración, el usuario tiene derecho a: información sobre la lógica, intervención humana, impugnación de la decisión |
| **Reclamación ante AEPD** | RGPD art. 77 | Enlace a https://www.aepd.es en la política de privacidad y en la respuesta a cualquier solicitud de derechos |

---

## 7. TRANSFERENCIAS A TERCEROS Y A TERCEROS PAÍSES

### Transferencias nacionales / dentro del EEE

Para cada cesión de datos a terceros se necesita:
- Que el consentimiento del usuario haya cubierto explícitamente esa categoría de destinatario.
- Contrato de encargado del tratamiento (art. 28) si el tercero trata datos por cuenta de la plataforma, o acuerdo de corresponsabilidad (art. 26) si determina fines propios.
- Los usuarios deben poder ver la lista actualizada de destinatarios en la política de privacidad.

### Transferencias fuera del EEE (art. 44-49 RGPD)

Si los datos se ceden a empresas fuera de la UE/EEE:
- Se necesita que el país destinatario tenga **decisión de adecuación** de la Comisión Europea (ej.: UK, Japón, Israel, EE.UU. bajo el EU-US Data Privacy Framework) o en su defecto usar **Cláusulas Contractuales Tipo** (SCCs) actualizadas de 2021.
- Informar al usuario en el momento de recoger los datos de que sus datos pueden ir fuera del EEE y de las garantías aplicables.
- Llevar registro de las transferencias internacionales.

**Fuente:** Comisión Europea — reglas transferencias internacionales: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/what-rules-apply-if-my-organisation-transfers-data-outside-eu_es

---

## 8. COOKIES Y LSSI (art. 22.2 LSSI-CE)

El artículo 22.2 de la Ley 34/2002 (LSSI-CE) regula el uso de cookies en España, complementado por el RGPD para cookies que tratan datos personales.

### Requisitos obligatorios del banner de cookies

1. **Consentimiento previo e informado** para todas las cookies no estrictamente técnicas/necesarias.
2. **Botón de rechazar** al mismo nivel y con igual visibilidad que el de aceptar (la AEPD ha sancionado banners donde rechazar es más difícil).
3. **Ninguna cookie no técnica activa por defecto** antes del consentimiento.
4. **Información mínima en primera capa**: qué son las cookies, para qué se usan, posibilidad de rechazar.
5. **Segunda capa**: detalle de cada cookie o categoría, con checkbox independiente por categoría.
6. **Duración del consentimiento**: máximo 24 meses, tras los cuales debe volver a solicitarse.
7. **Posibilidad de retirar o cambiar preferencias en cualquier momento** (enlace accesible permanente).

### Tipos de cookies en la plataforma de datos

- Cookies técnicas/sesión: no requieren consentimiento (login, carrito de preferencias).
- Cookies analíticas propias: requieren consentimiento; no pueden incluirse en el consentimiento de cesión de datos si son para un fin distinto.
- Cookies de terceros para perfilado: consentimiento independiente y explícito; deben identificar a cada tercero.

**Fuente:** Regulación cookies España LSSI: https://forlopd.es/regulacion-del-uso-de-cookies-en-espana-lssi-y-obligaciones/ | AEPD guía cookies.

---

## 9. MENORES: EDAD DE CONSENTIMIENTO EN ESPAÑA

El artículo 7 de la LOPDGDD establece que:
- Los menores de **14 años** no pueden consentir por sí mismos el tratamiento de sus datos; se necesita el consentimiento de los titulares de la patria potestad o tutela.
- Los mayores de 14 años pueden consentir directamente.
- El RGPD (art. 8) fija 16 años como edad por defecto, pero permite a los Estados bajarla hasta 13; España usa **14 años**.

### Medidas obligatorias en la app

- En el registro: casilla "Soy mayor de 14 años" (declaración activa). Para un servicio de reparto de ganancias económicas, considerar exigir mayor de 18 años por implicaciones contractuales (los contratos con menores de 18 requieren representante legal en España — CC arts. 1263 y ss.).
- Verificación de edad razonable: al menos declaración activa; para un MVP, suficiente; si escala, valorar métodos de verificación más robustos.
- No recoger datos de categoría especial de menores en ningún caso.

**Fuente:** LOPDGDD art. 7: https://www.iberley.es/legislacion/articulo-7-ley-organica-proteccion-datos-personales-garantia-derechos-digitales-lopdgdd

---

## 10. REGISTRO DE ACTIVIDADES, DPO Y EVALUACIÓN DE IMPACTO (DPIA/EIPD)

### Registro de Actividades de Tratamiento (art. 30 RGPD)

**Obligatorio** para casi todas las organizaciones (salvo empresas con menos de 250 empleados cuyos tratamientos no sean de riesgo, lo que no aplica aquí). Para una plataforma de datos personales: **siempre obligatorio**.

Contenido mínimo del registro:
- Nombre y datos de contacto del responsable (y DPO si existe).
- Finalidades del tratamiento.
- Categorías de interesados y datos.
- Categorías de destinatarios.
- Transferencias internacionales y garantías.
- Plazos de supresión previstos.
- Descripción general de medidas de seguridad.

### Delegado de Protección de Datos (DPO)

El DPO es **obligatorio** cuando el tratamiento principal de la organización incluye (art. 37 RGPD):
- Observación sistemática a gran escala de personas (sí aplica cuando la plataforma escala).
- Tratamiento a gran escala de categorías especiales de datos.

Para el MVP (volumen inicial bajo): el DPO puede no ser obligatorio, pero es **altamente recomendable** designar uno (puede ser externo) dado el modelo de negocio. En cuanto la plataforma supere umbrales de escala o incluya datos sensibles, **se vuelve obligatorio**.

**Fuente:** AEPD — designación DPO: https://www.aepd.es/en/rights-and-duties/fulfill-your-duties/measures-compliance/data-protection-officer

### Evaluación de Impacto en Protección de Datos — EIPD / DPIA (art. 35 RGPD)

**OBLIGATORIA** para este modelo de negocio porque concurren los criterios del art. 35.3 y de la lista AEPD (listas-dpia-es-35-4.pdf):
- **Perfilado a gran escala** (evaluación sistemática de aspectos personales mediante tratamiento automatizado).
- **Cesión de datos a terceros** como elemento central del modelo de negocio.
- **Tratamiento innovador**: modelo sin precedente consolidado (usuario recibe pago directo).
- Datos de comportamiento, hábitos de compra, geolocalización → perfil exhaustivo del individuo.

Contenido mínimo de la DPIA:
1. Descripción sistemática del tratamiento y sus finalidades.
2. Evaluación de la necesidad y proporcionalidad.
3. Evaluación de riesgos para derechos y libertades.
4. Medidas previstas para afrontar los riesgos.
5. Consulta previa a la AEPD si los riesgos residuales son altos (art. 36).

**La DPIA debe completarse ANTES de iniciar el tratamiento.**

**Fuente:** AEPD EIPD preguntas frecuentes: https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/10-evaluacion-de-impacto | Lista AEPD tratamientos que requieren DPIA: https://www.aepd.es/documento/listas-dpia-es-35-4.pdf

---

## 11. RIESGOS LEGALES CONCRETOS Y MITIGACIÓN

| Riesgo | Descripción | Mitigación |
|--------|-------------|------------|
| **Consentimiento inválido** | Si los formularios no son lo suficientemente granulares o el acceso está condicionado a aceptar todo | Consentimiento por finalidad, opt-in por defecto desactivado, alternativa de acceso parcial |
| **Carácter "libre" cuestionable** | La remuneración económica puede interpretarse como coacción indirecta | Diseñar para que el usuario pueda usar la plataforma sin ceder datos (con funciones reducidas), remuneración ligada a la libre cesión |
| **Datos de categoría especial no solicitados** | Inferencia de datos sensibles a partir de datos ordinarios (perfil de compra → salud, religión) | Prohibición contractual a los compradores de inferir categorías especiales; auditoría técnica de los perfiles vendidos |
| **Terceros incumplidores** | Un comprador de datos los reutiliza fuera de la finalidad consentida | Contratos con obligaciones específicas de uso, auditorías, responsabilidad contractual y posibilidad de resolución |
| **Transferencias fuera del EEE** | Datos acaban en servidores de EE.UU. o Asia sin garantías | Verificar ubicación de los servidores de los compradores; exigir SCCs o verificar que el receptor está en país adecuado |
| **Menores** | Un menor de 14 años (o 18) crea cuenta | Declaración activa de edad en registro; en la versión escalada, verificación real |
| **Falta de DPIA** | La AEPD puede sancionar si se empieza el tratamiento sin haber hecho la evaluación de impacto | Completar la DPIA antes del lanzamiento; documentarla y actualizarla |
| **Perfil discriminatorio** | Los datos cedidos permiten tomar decisiones discriminatorias (empleo, crédito, seguro) | Prohibición expresa en los contratos con compradores; limitación de uso final declarado en el consentimiento |
| **Brecha de seguridad** | Datos robados o expuestos | Cifrado en tránsito (TLS 1.3) y en reposo, hash de datos sensibles, notificación a AEPD en 72h y a usuarios si hay riesgo alto |
| **Sanciones AEPD** | Multas de hasta 20 M€ o 4% del volumen de negocio mundial (art. 83 RGPD) | Cumplimiento desde el diseño (privacy by design), DPIA previa, documentación de cumplimiento |

**Directiva 2019/770 (transpuesta en España por RDL 7/2021):** reconoce que los datos personales pueden ser contraprestación en un contrato de contenidos/servicios digitales, equiparando al consumidor que paga con datos al que paga con dinero. Esto implica que el usuario tiene **derechos de garantía del consumidor** (resolución del contrato, corrección) si el servicio no cumple. Añade una capa de protección extra: hay que asegurar que la plataforma cumple lo prometido en cuanto a remuneración y destino de los datos.

**Fuente:** Transposición Directiva 2019/770 en España: https://www.osborneclarke.com/insights/implementation-spain-directives-digital-content-services-contracts-sale-goods | InDret análisis: https://indret.com/mercado-digital-y-proteccion-del-consumidor-a-proposito-de-la-directiva-770-2019-y-su-transposicion-al-ordenamiento-juridico-espanol/

---

## ENTREGABLE A: LISTA DE OBLIGACIONES LEGALES CONCRETAS (CHECKLIST MVP)

### Antes del lanzamiento

- [ ] **L-01** Completar y documentar la DPIA/EIPD antes de iniciar cualquier tratamiento de datos.
- [ ] **L-02** Designar responsable de tratamiento (persona jurídica o física) e inscribir en AEPD si aplica.
- [ ] **L-03** Valorar nombramiento de DPO externo (recomendado aunque no obligatorio en MVP).
- [ ] **L-04** Crear el Registro de Actividades de Tratamiento (art. 30 RGPD) con todos los tratamientos.
- [ ] **L-05** Redactar la Política de Privacidad con todos los elementos de los arts. 13-14 RGPD.
- [ ] **L-06** Redactar el Aviso Legal (LSSI art. 10: identificación del prestador, domicilio, email, número de registro mercantil si aplica).
- [ ] **L-07** Redactar la Política de Cookies con categorías y checkbox por categoría.
- [ ] **L-08** Redactar los Términos y Condiciones del servicio de cesión de datos y reparto de ganancias.
- [ ] **L-09** Preparar contratos-tipo para los compradores de datos (encargados o corresponsables, con obligaciones de uso, prohibición de inferir categorías especiales, destrucción certificada).
- [ ] **L-10** Implementar mecanismo de verificación de edad en el registro (declaración activa de 18 años para evitar complejidades contractuales con menores).

### En el registro y onboarding

- [ ] **L-11** Formulario de consentimiento granular (una casilla por finalidad, todas desactivadas por defecto).
- [ ] **L-12** Información de los arts. 13-14 presentada antes de que el usuario marque ninguna casilla.
- [ ] **L-13** Consentimiento de política de privacidad separado del consentimiento de cesión de datos.
- [ ] **L-14** Casilla de verificación de mayoría de edad (18 años recomendado para la v1 por implicaciones contractuales).
- [ ] **L-15** Registro de cada consentimiento otorgado: timestamp, versión del formulario, IP o identificador de sesión.

### En el uso continuado

- [ ] **L-16** Panel de preferencias de privacidad: el usuario puede revocar/modificar cada consentimiento en cualquier momento.
- [ ] **L-17** Panel de datos: exportación de todos los datos del usuario (portabilidad, art. 20).
- [ ] **L-18** Función de borrado de cuenta: elimina todos los datos del usuario y notifica a los terceros que los recibieron.
- [ ] **L-19** Historial de consentimientos: el usuario ve qué consintió, cuándo, y a quién se cedieron sus datos.
- [ ] **L-20** Canal de ejercicio de derechos (email o formulario) con respuesta garantizada en 1 mes.
- [ ] **L-21** Proceso de notificación de brechas: a la AEPD en 72h y a usuarios afectados si riesgo alto.

### Seguridad técnica

- [ ] **L-22** Cifrado TLS 1.3 para todas las comunicaciones.
- [ ] **L-23** Cifrado en reposo de datos sensibles.
- [ ] **L-24** Acceso a datos de usuarios restringido por roles, con logs de auditoría.
- [ ] **L-25** Procedimiento de gestión de incidentes documentado.

---

## ENTREGABLE B: PLANTILLA DE CONSENTIMIENTO GRANULAR

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUTORIZACIÓN DE CESIÓN DE DATOS Y PARTICIPACIÓN EN EL REPARTO DE GANANCIAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

¿Qué es esto? Tú decides qué datos compartes con empresas asociadas.
Cada vez que tus datos se usen, recibes una parte de los ingresos.
Puedes marcar solo lo que quieras. Puedes cambiar tu elección en cualquier momento desde tu perfil.

──────────────────────────────────────────────────────────────
BLOQUE 1 — Datos de perfil sociodemográfico
──────────────────────────────────────────────────────────────
Datos: edad, género, nivel de estudios, ocupación, código postal.
Finalidad: segmentación de audiencias para estudios de mercado y publicidad dirigida.
Destinatarios: empresas de investigación de mercado y agencias de publicidad (ver lista en política de privacidad).
Retribución estimada: entre X€ y Y€ al mes según demanda.
Conservación: mientras mantengas el consentimiento activo + 30 días para procesamiento de pagos.

[ ] Acepto compartir mis datos de perfil sociodemográfico

──────────────────────────────────────────────────────────────
BLOQUE 2 — Hábitos de compra y consumo
──────────────────────────────────────────────────────────────
Datos: categorías de productos que compras, frecuencia de compra, rangos de gasto, marcas preferidas (tú los declaras o conectas tus recibos voluntariamente).
Finalidad: análisis de tendencias de consumo para empresas de retail y gran consumo.
Destinatarios: empresas de gran consumo y análisis de tendencias (ver lista en política de privacidad).
Retribución estimada: entre X€ y Y€ al mes.
Conservación: mientras mantengas el consentimiento activo + 30 días.

[ ] Acepto compartir mis hábitos de compra y consumo

──────────────────────────────────────────────────────────────
BLOQUE 3 — Datos de navegación y comportamiento digital
──────────────────────────────────────────────────────────────
Datos: categorías de sitios web visitados (no URLs exactas), frecuencia de uso de apps, tiempo en pantalla por categoría (solo en dispositivos donde instales la app voluntariamente).
Finalidad: perfilado de intereses digitales para publicidad contextual.
Destinatarios: plataformas de publicidad programática (ver lista en política de privacidad).
Retribución estimada: entre X€ y Y€ al mes.
Conservación: mientras mantengas el consentimiento activo + 30 días.

[ ] Acepto compartir mis datos de navegación y comportamiento digital

──────────────────────────────────────────────────────────────
BLOQUE 4 — Ubicación (geolocalización)
──────────────────────────────────────────────────────────────
Datos: ciudad de residencia habitual, zonas que frecuentas (nivel barrio/distrito, no dirección exacta), tipo de establecimientos que visitas.
Finalidad: análisis de movilidad y audiencias locales para retailers y hostelería.
Destinatarios: empresas de retail local y análisis de afluencia (ver lista en política de privacidad).
Retribución estimada: entre X€ y Y€ al mes.
Conservación: mientras mantengas el consentimiento activo + 30 días.

[ ] Acepto compartir mis datos de ubicación (nivel ciudad/zona)

──────────────────────────────────────────────────────────────
BLOQUE 5 — Opiniones y valoraciones
──────────────────────────────────────────────────────────────
Datos: respuestas a encuestas y sondeos de opinión sobre productos, servicios y marcas que tú elijas contestar voluntariamente.
Finalidad: investigación de mercado cualitativa para empresas.
Destinatarios: empresas de investigación de mercado y marcas contratantes (ver lista en política de privacidad).
Retribución estimada: entre X€ y Y€ por encuesta completada.
Conservación: las respuestas se conservan 12 meses para análisis de tendencias; después, solo en forma anonimizada.

[ ] Acepto participar en encuestas de opinión y que mis respuestas se compartan con fines de investigación

──────────────────────────────────────────────────────────────
AVISO IMPORTANTE:
• Puedes marcar 0 bloques, 1, o todos — la plataforma seguirá funcionando en todos los casos.
• Puedes cambiar tus elecciones en cualquier momento desde "Mi perfil → Privacidad y consentimientos".
• Retirar un consentimiento no cancela los pagos ya ganados ni implica ninguna penalización.
• No recopilamos ni vendemos datos sobre salud, creencias, origen étnico, opiniones políticas ni orientación sexual.
• Para ejercer tus derechos (acceso, borrado, portabilidad...) escribe a: privacidad@[DOMINIO].com
• Si no estás de acuerdo con cómo tratamos tus datos, puedes reclamar ante la AEPD: https://www.aepd.es

He leído la Política de Privacidad y el Aviso Legal.
[ENLACE POLÍTICA DE PRIVACIDAD] [ENLACE AVISO LEGAL]

[ ] Acepto la Política de Privacidad y el Aviso Legal *(obligatorio para registrarse)*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## ENTREGABLE C: DERECHOS DEL USUARIO — IMPLEMENTACIÓN EN LA APP

| Derecho | Cómo se ejerce en la app | Plazo de respuesta |
|---------|--------------------------|-------------------|
| **Acceso** (art. 15) | Botón "Exportar mis datos" en Mi Perfil → Privacidad. Descarga instantánea en JSON o CSV de todos los datos almacenados y a quién se han cedido. | Inmediato (automatizado) |
| **Rectificación** (art. 16) | Formulario de edición de perfil en Mi Perfil → Mis datos. Los cambios se reflejan en futuros envíos a terceros; los ya cedidos no pueden recuperarse (se notifica al usuario). | Inmediato (automatizado) |
| **Supresión / Derecho al olvido** (art. 17) | Botón "Eliminar mi cuenta" en Mi Perfil → Privacidad → Zona peligrosa. Borrado completo en 30 días naturales; se notifica a los terceros que hayan recibido datos para que los eliminen de sus sistemas. | 30 días naturales |
| **Oposición** (art. 21) | Interruptores (toggles) por bloque de datos en Mi Perfil → Consentimientos. Se puede desactivar cualquier bloque en tiempo real. | Inmediato |
| **Limitación del tratamiento** (art. 18) | Opción "Pausar todos mis consentimientos temporalmente" en Mi Perfil → Privacidad. Los datos no se eliminan pero no se ceden mientras está activado. | Inmediato |
| **Portabilidad** (art. 20) | Igual que Acceso: exportación en formato estándar (JSON, CSV) de todos los datos facilitados activamente. | Inmediato (automatizado) |
| **Revocación del consentimiento** (art. 7.3) | Cualquier toggle de consentimiento granular puede desactivarse en cualquier momento. No genera coste ni penalización. | Inmediato |
| **No decisiones automatizadas** (art. 22) | Si se usa perfilado para calcular la remuneración, el usuario puede: ver la lógica aplicada (botón "¿Cómo se calcula mi retribución?"), solicitar revisión humana por email a privacidad@[DOMINIO].com, e impugnar la valoración. | 1 mes |
| **Reclamación ante AEPD** (art. 77) | Enlace directo a https://www.aepd.es en el pie de todas las páginas legales y en la respuesta a cualquier solicitud de derechos. | N/A (redirige a AEPD) |

---

## FUENTES PRINCIPALES CONSULTADAS

- EDPB Dictamen 08/2024 sobre Consent or Pay (ES): https://www.edpb.europa.eu/news/news/2024/edpb-consent-or-pay-models-should-offer-real-choice_es
- EDPB Dictamen 08/2024 (PDF ES): https://www.edpb.europa.eu/system/files/2024-11/edpb_opinion_202408_consentorpay_es.pdf
- EDPB Directrices 05/2020 sobre consentimiento (ES): https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_es.pdf
- AEPD — Derecho de información: https://www.aepd.es/en/rights-and-duties/know-your-rights/right-information
- AEPD — FAQ consentimiento: https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/5-bases-legitimadoras-del-tratamiento/FAQ-0211-segun-el-rgpd-como-debe-solicitarse-el-consentimiento-de-los-interesados-para-tratar-sus-datos-personales
- AEPD — FAQ derechos del interesado: https://www.aepd.es/preguntas-frecuentes/1-tus-derechos/2-tus-derechos-de-proteccion-de-datos/FAQ-0105-que-derechos-reconoce-el-rgpd-a-los-afectados
- AEPD — FAQ DPO: https://www.aepd.es/preguntas-frecuentes/4-dpd/1-delegado-de-proteccion-de-datos/FAQ-0402-cuando-se-debe-nombrar-un-dpd
- AEPD — EIPD preguntas frecuentes: https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/10-evaluacion-de-impacto
- AEPD — Lista tratamientos que requieren DPIA: https://www.aepd.es/documento/listas-dpia-es-35-4.pdf
- AEPD — Guía cláusula informativa: https://www.aepd.es/guias/guia-modelo-clausula-informativa.pdf
- RGPD art. 9 (datos especiales): https://www.privacy-regulation.eu/es/9.htm
- LOPDGDD art. 7 (menores): https://www.iberley.es/legislacion/articulo-7-ley-organica-proteccion-datos-personales-garantia-derechos-digitales-lopdgdd
- Directiva 2019/770 transposición España (RDL 7/2021): https://www.osborneclarke.com/insights/implementation-spain-directives-digital-content-services-contracts-sale-goods
- Análisis Directiva 2019/770 — InDret: https://indret.com/mercado-digital-y-proteccion-del-consumidor-a-proposito-de-la-directiva-770-2019-y-su-transposicion-al-ordenamiento-juridico-espanol/
- Comisión Europea — transferencias internacionales: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/what-rules-apply-if-my-organisation-transfers-data-outside-eu_es
- LSSI cookies — regulación España: https://forlopd.es/regulacion-del-uso-de-cookies-en-espana-lssi-y-obligaciones/
- Rayon y Cajal Abogados — Pay or Consent: https://www.ramonycajalabogados.com/es/noticias/modelos-pay-or-consent-el-cepd-exige-alternativas-gratuitas-y-un-consentimiento-libre-y-sin
- Privacydriver — destinatarios y encargados: https://privacydriver.com/es/informacion-sobre-destinatarios-encargados-del-tratamiento-c623

---

*Informe elaborado con base en normativa vigente a junio de 2026. Este documento tiene carácter orientativo y no sustituye el asesoramiento jurídico profesional. Ante la AEPD o en procedimientos sancionadores, debe complementarse con dictamen de abogado especialista en protección de datos.*
