# 📜 Normativa europea y española sobre IA + obligaciones web

> Fecha del informe: 15/08/2026. Redactado para la fábrica de apps (embudos + formulario
> de leads + panel de admin). Sirve para decidir qué tenemos que cambiar en las plantillas.

## TL;DR (lo urgente en 6 líneas)
1. **Ya está en vigor** el Reglamento (UE) 2024/1689 (**AI Act**). Las obligaciones que nos
   afectan **entraron el 2 de agosto de 2026** (transparencia + autoridades sancionadoras).
2. **AESIA** (A Coruña) es quien sanciona en España. Multas hasta **35 M€ o 7 %** de facturación
   por prácticas prohibidas; hasta **15 M€ o 3 %** por incumplir la transparencia del art. 50.
3. Lo que hacemos aquí (embudos + leads) está en **riesgo limitado**. No es alto riesgo, pero
   sí tiene obligaciones: **avisar cuando algo lo hace una IA** y **marcar el contenido sintético**.
4. Si la app **usa un chatbot** o **genera texto/imagen en cliente con IA en tiempo real**, hay
   que ponerlo en pantalla desde el primer momento. El pie de página no basta.
5. El **RGPD y la LSSI** siguen siendo la parte más peligrosa en la práctica: formulario con
   casilla de consentimiento (sin marcar), política de privacidad y aviso legal específicos.
6. La **alfabetización en IA (art. 4)** obliga desde 2025 al dueño y a todo el que use IA en
   la empresa. No es un certificado oficial, pero hay que **poder demostrar** que sabe usarla.

---

## 1. Marco legal aplicable en España

| Norma | Qué regula | Fecha clave |
|---|---|---|
| **Reglamento (UE) 2024/1689 – AI Act** | Uso, comercialización y despliegue de sistemas de IA en la UE. Aplicación **directa**, no hay que trasponerla. | En vigor: 1 ago 2024. Obligaciones art. 4: 2 feb 2025. Art. 50 transparencia + supervisión: **2 ago 2026**. Alto riesgo Anexo III: aplazado a **2 dic 2027**. |
| **Proyecto Ley Orgánica española de gobernanza de IA** | Complementa el AI Act (autoridad, procedimiento sancionador, régimen de multas). No lo sustituye. | Aprobado en Consejo de Ministros el 26 may 2026, en tramitación parlamentaria. |
| **RGPD (UE 2016/679)** + **LOPDGDD (LO 3/2018)** | Datos personales: base legal, consentimiento, derechos ARSOPL, DPO, brechas. | En vigor. |
| **LSSI-CE (Ley 34/2002)** | Comercio electrónico, cookies (art. 22.2), comunicaciones comerciales, aviso legal obligatorio. | En vigor. |
| **Ley 11/2023 (EAA – accesibilidad)** | Accesibilidad de webs y apps de empresas B2C con ≥10 empleados o ≥2 M€ facturación. | Exigible desde **28 jun 2025**. |
| **NIS2 (Directiva UE 2022/2555)** | Ciberseguridad de sectores esenciales/importantes. **Solo afecta si eres uno de esos sectores.** | Traspuesta y en vigor en 2025. |

**Autoridades sancionadoras**
- **AESIA** — IA (sede A Coruña, primera de la UE).
- **AEPD** — datos personales y cookies.
- **Autoridades de consumo** (autonómicas + Ministerio) — comercio electrónico y publicidad.

---

## 2. AI Act — sólo lo que nos afecta

### 2.1 Riesgo, o por qué no somos "alto riesgo"
El AI Act clasifica los sistemas de IA en 4 niveles:
- **Inaceptable** (prohibido): puntuación social, manipulación subliminal, biometría remota…
- **Alto** (Anexo III): selección de personal, scoring crediticio, educación, sanidad, justicia,
  infraestructuras críticas. **Ninguna de nuestras apps entra aquí.**
- **Riesgo limitado** (art. 50): chatbots, generación/manipulación de contenido, deepfakes,
  categorización biométrica, reconocimiento de emociones. **Aquí sí caemos**.
- **Riesgo mínimo**: el resto (filtros de spam, autocomplete…). Buenas prácticas voluntarias.

### 2.2 Artículo 4 — alfabetización en IA (en vigor desde 2 feb 2025)
Cualquier empresa —**autónomos incluidos**, sin umbral de tamaño— que **use** IA para trabajar
tiene que garantizar que su plantilla tiene un nivel razonable de conocimiento sobre IA:
qué es, riesgos, límites y buen uso. Se aplica al que **despliega** IA, no sólo al que la crea.

- No exige un certificado oficial ni un número de horas.
- Debe ser **proporcional** al puesto y al riesgo del sistema.
- Hay que **poder demostrarlo**: guardar registro de la formación (curso, fecha, contenidos,
  asistentes) por si AESIA lo pide.
- Se puede bonificar por **FUNDAE**.

**Aplicado a nosotros:** el dueño de la fábrica (Jaime) y cualquier persona que edite prompts
o supervise la generación de las apps entra dentro. Basta con una formación básica documentada
(curso online + acta interna) y una política de uso interno.

### 2.3 Artículo 50 — transparencia (obligatorio desde 2 ago 2026)
Estas son las obligaciones que **sí tocan las apps** que fabricamos:

**a) Chatbots y sistemas conversacionales.** Antes de la primera interacción, el usuario tiene
que saber que habla con una IA. El aviso debe ser **claro, perceptible y previo**, no puede
esconderse en el aviso legal ni en los términos.
- Ejemplo válido: banner o burbuja de bienvenida — *"Hola, soy un asistente virtual (IA).
  Puedo equivocarme; para casos delicados te pasaremos con una persona."*

**b) Contenido sintético (imagen, audio, vídeo, texto generado/manipulado por IA).**
- El **proveedor** del modelo debe marcar el contenido en **formato legible por máquina**
  (marcas de agua, metadatos, C2PA…). Régimen transitorio: modelos previos al 2 ago 2026
  tienen hasta el **2 dic 2026** para adaptarse.
- El **usuario que despliega** (nosotros/los dueños) debe **etiquetar visiblemente** el
  contenido cuando sea **deepfake** (imagen/audio/vídeo que reproduce personas u hechos
  reales de forma realista) o **texto informativo de interés público** sin revisión humana.
- **Excepciones**: contenido claramente artístico, satírico o creativo, y contenido con
  **revisión editorial humana** con responsabilidad conocida. La excepción **no aplica a
  deepfakes** (esos siempre se etiquetan).
- El aviso debe estar **sobre el propio contenido** (overlay, texto adjunto "Generado con IA",
  icono UE de contenido sintético) o **al inicio**. Un párrafo en el pie de página **no vale**.

**c) Reconocimiento de emociones / categorización biométrica.** Requiere avisar antes de
usarlo. En nuestras apps **no usamos esto** → no aplica.

### 2.4 Sanciones (AI Act + proyecto español)
- Prácticas prohibidas: hasta **35 M€ o 7 %** del volumen de negocio anual.
- Incumplir obligaciones (alto riesgo, transparencia): hasta **15 M€ o 3 %**.
- Información falsa a la autoridad: hasta **7,5 M€ o 1 %**.
- Para pymes/autónomos se aplica **la cifra menor** entre el porcentaje y el importe fijo,
  con atenuantes por corrección voluntaria y pronto pago.

---

## 3. RGPD + LSSI — lo que un formulario web debe tener sí o sí

Aunque no toque directamente a la IA, es donde más multas cae la AEPD. En cada app con
formulario (leads, reservas, contacto) hay que garantizar:

1. **Base legal explícita** para el tratamiento (normalmente **consentimiento** para leads).
2. **Casilla de consentimiento sin marcar por defecto** — imprescindible para poder enviar.
   Rechazado: consentimiento tácito, "por seguir navegando" o silencio.
3. **Información básica de protección de datos junto al formulario**:
   *"Responsable: [nombre]. Finalidad: contactarte para presupuesto. Legitimación:
    tu consentimiento. Destinatarios: no se ceden datos. Derechos: acceder, rectificar,
    suprimir y otros, escribiendo a [email]. Más info en Política de Privacidad."*
4. **Política de Privacidad y Aviso Legal específicos** (no genéricos), enlazados en el pie.
   El titular real, NIF, domicilio, contacto y —si es sociedad— datos registrales.
5. **Cookies (art. 22.2 LSSI)**: si la web usa cookies o técnicas equivalentes que no sean
   estrictamente técnicas (analítica, publicidad, redes), hay que **banner con Aceptar y
   Rechazar al mismo nivel** (mismo color/tamaño), según guía **AEPD**. Sin actuación del
   usuario → NO se cargan las no técnicas.
6. **Comunicaciones comerciales por email/SMS/WhatsApp**: la LSSI las prohíbe salvo que haya
   **consentimiento previo** expreso o **relación contractual previa** con productos similares.
7. **Registro de la actividad** (log del envío, sello temporal, IP) por si hay reclamación.

Nuestras plantillas ya cumplen 1, 2 y 4. **Nos falta afinar el 3** (poner el bloque completo
junto al formulario, no sólo la casilla) y añadir cookies si algún día ponemos analítica.

---

## 4. Accesibilidad (Ley 11/2023 / EAA) — a partir de 28 jun 2025
Obliga a que las webs/apps B2C sean accesibles conforme a **WCAG 2.1 nivel AA**. La ley
tiene una **excepción para microempresas** (< 10 empleados y < 2 M€) que ofrezcan servicios,
salvo en el sector público. En la mayoría de nuestros clientes (peluqueros, gimnasios de
barrio…) no será exigible por ley, pero seguimos aplicándolo por calidad y porque el
`ingeniero-accesibilidad` ya lo revisa (contraste, foco, labels, teclado).

---

## 5. Cómo aplica a las apps de esta fábrica (peluquería, embudos, catálogos…)

### 5.1 ¿Somos "proveedor" o "responsable de despliegue" de IA?
Las apps que entregamos **no son sistemas de IA**: son HTML/CSS/JS estático con `localStorage`.
Lo que hacemos con IA es **generarlas** (usando Claude). En jerga del AI Act:
- **La IA es de OpenAI/Anthropic** — ellos son los proveedores.
- **Nosotros somos "deployers"** que usamos IA para **producir contenido** (textos, imágenes SVG).
- El **dueño del negocio** que recibe la app **no** despliega ninguna IA hacia sus clientes finales
  (salvo que le enchufemos un chatbot, cosa que hoy **no hacemos**).

Consecuencia práctica:
- El **texto** de la app (copys) está **revisado editorialmente** por Claude + el usuario
  → **cae en la excepción** de revisión humana. **No es obligatorio etiquetarlo**.
- Las **imágenes SVG placeholder** que dibujamos por código **no son "contenido generado por IA"**
  en el sentido del art. 50: son gráficos vectoriales creados con reglas, no salidas de un
  modelo generativo (no salen de Midjourney/DALL·E/SD).
- Si en el futuro incrustamos imágenes de **stock generadas con IA** (por ejemplo, Midjourney)
  como "foto real de local o servicio", sí habría que etiquetarlas, **especialmente si
  parecen fotografías** (riesgo de deepfake).

### 5.2 Cambios concretos que sí toca aplicar

**A. Plantilla base de app — sección de aviso IA en el pie**
Añadir un aviso corto (una línea) en la sección legal:
> *"Los textos e ilustraciones de esta web han sido asistidos por herramientas de IA
>  bajo revisión humana."*

Esto **no es obligatorio** por art. 50 (queda amparado por la excepción de revisión editorial),
pero es **buena práctica** y ayuda si un día AESIA pregunta.

**B. Si añadimos chatbot IA a una app** (funcionalidad futura)
- Mensaje de bienvenida **explícito**: *"Soy un asistente virtual (IA), no una persona"*.
- Botón visible para **hablar con humano** (o WhatsApp del dueño).
- **No** almacenar la conversación sin consentimiento; si se guarda, política de privacidad
  actualizada y base legal declarada.

**C. Si añadimos generación de imágenes/vídeos IA en la app**
- Watermark visible en la imagen: *"Generado con IA"* o el icono UE de contenido sintético.
- Metadatos C2PA cuando el proveedor los soporte (OpenAI/Google ya los meten).
- **Si es un deepfake** (foto realista de persona/local): **etiquetado siempre**, sin excepción.

**D. Formulario de leads — bloque legal (mejorar plantilla)**
Reemplazar la casilla actual por el bloque completo. Propuesta de HTML mínimo:
```html
<label class="consent">
  <input type="checkbox" required>
  He leído y acepto la <a href="#/privacidad">Política de Privacidad</a>
  y el <a href="#/aviso-legal">Aviso Legal</a>.
</label>
<p class="rgpd-mini">
  Responsable: <strong>{{TITULAR}}</strong>. Finalidad: contactarte para atender tu
  solicitud. Legitimación: tu consentimiento. No cedemos datos a terceros.
  Derechos: acceso, rectificación, supresión y otros, escribiendo a
  <a href="mailto:{{EMAIL}}">{{EMAIL}}</a>.
</p>
```

**E. Alta de política de privacidad y aviso legal (dos secciones nuevas en cada app)**
El generador ya crea placeholders para "Política de Privacidad y Aviso Legal". Hay que
asegurarse de que las plantillas incluyen **todos** los campos que exige la LSSI (art. 10):
titular, NIF, domicilio, email de contacto y, si aplica, datos registrales, colegio
profesional, etc.

**F. Alfabetización IA (documento interno, no va en las apps)**
Un archivo `docs/FORMACION-IA.md` con:
- Curso hecho (título, fecha, horas, alumnado: Jaime + colaboradores).
- Política interna: qué se puede pedir a la IA y qué no (datos personales, PII…).
- Revisión editorial: quién valida antes de entregar.
- Registro por cada app entregada de que ha pasado revisión humana.

---

## 6. Checklist para el `qa-verificador` (agente 10)

Añadir estas comprobaciones al Agente QA antes de dar el visto bueno:

- [ ] Formulario de captación: casilla de consentimiento **sin marcar por defecto**.
- [ ] Bloque de información RGPD junto al formulario (responsable, finalidad, derechos).
- [ ] Enlaces a **Política de Privacidad** y **Aviso Legal** visibles en el pie.
- [ ] Aviso legal del titular con NIF, domicilio, email (si es placeholder, marcado como tal).
- [ ] Aviso discreto en el pie: "Contenidos asistidos por IA con revisión humana".
- [ ] Si hay chatbot: aviso "IA, no persona" antes del primer mensaje del usuario.
- [ ] Si hay imágenes que parecen fotos reales generadas por IA: watermark visible.
- [ ] Si hay cookies no técnicas: banner con Aceptar/Rechazar al mismo nivel.

---

## 7. Fuentes consultadas (agosto 2026)

- Comisión Europea — [Reglamento (UE) 2024/1689 (AI Act)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- Plataforma ONE (Gob. España) — [El Reglamento europeo de IA avanza: nuevas obligaciones](https://one.gob.es/es/contenidos/el-reglamento-europeo-de-inteligencia-artificial-avanza-nuevas-obligaciones-para)
- Legiscope — [Guía Reglamento de IA 2026](https://www.legiscope.com/blog/reglamento-inteligencia-artificial-guia.html)
- Secuone.ai — [Calendario del AI Act en España](https://secuone.ai/calendario-aplicacion-ai-act-espana-fechas-clave/)
- Sphyrna Solutions — [AI Act 2026: guía para empresas](https://sphyrnasolutions.com/blog/regulacion-ia/reglamento-ia-ue-ai-act-guia-empresas-2026)
- Illusion Studio — [Nueva Ley de IA en España 2026](https://www.illusionstudio.es/nueva-ley-ia-espana-empresas)
- Genai Sapiens — [Ley de IA en España 2026: qué hay aprobado](https://www.genaisapiens.com/blog/ley-inteligencia-artificial-espana/)
- Copilot Gestoría — [Multas de hasta 35 millones desde agosto](https://copilotgestoria.com/blog/ley-inteligencia-artificial-2026-multas-35-millones-obligaciones-empresas-guia-gestorias)
- Happy Automating — [AI Act 2026: qué debe hacer tu pyme](https://happyautomating.com/blog/ai-act-pymes-agosto-2026)
- Alberto Pampin — [Nueva Ley de IA en España — guía práctica](https://www.albertopampin.es/blog/nueva-ley-de-inteligencia-artificial-en-espana-2026-guia-practica/)
- Economist & Jurist — [Art. 50 activa la transparencia el 2 de agosto](https://www.economistjurist.es/articulos-juridicos-destacados/ai-act-el-articulo-50-activa-la-transparencia-obligatoria-de-la-ia-el-2-de-agosto/)
- KI-Kennzeichnen — [Marcado IA según art. 50](https://ki-kennzeichnen.de/es/ratgeber)
- PwC España — [RIA exige etiquetado explícito de contenido IA](https://www.pwc.es/es/newlaw-pulse/legaltech/ria-exige-etiquetado-explicito-contenido-generado-ia.html)
- Varkia — [Art. 4 AI Act: formación IA obligatoria](https://varkia.es/blog/articulo-4-ai-act-formacion-ia-obligatoria-pymes-2026)
- Trust AI — [¿Qué formación en IA obliga el AI Act?](https://trustai.es/blog/formacion-ia-obligatoria-ai-act)
- Domina Internet — [Textos legales obligatorios web 2026 (RGPD/LSSI)](https://dominainternet.com/blog/textos-legales-obligatorios-web/)
- Certix — [LSSI: guía completa](https://certix.es/noticias/normativa/lssice-ley-servicios-sociedad-informacion-guia-completa/)
- ForLOPD — [Regulación de cookies en España](https://forlopd.es/regulacion-del-uso-de-cookies-en-espana-lssi-y-obligaciones/)
- Eruga — [Obligaciones legales web 2026: NIS2, RGPD, LOPDGDD, EAA y AI Act](https://www.eruga.es/obligaciones-legales-web-empresa-2026/)

> **Aviso**: este documento es un **resumen técnico**, no un dictamen jurídico. Para
> casos concretos (chatbot con IA de terceros, tratamiento de biometría, sector regulado…)
> conviene una consulta con abogado especializado en protección de datos e IA.
