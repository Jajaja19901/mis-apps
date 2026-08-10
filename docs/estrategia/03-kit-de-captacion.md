# Kit de captación — los primeros 10 clientes

**Fecha:** 2026-08-10 · **Método:** skills `prospecting` + `cold-email`, adaptadas a España y a venta local.
**Para qué sirve:** esto no es teoría. Es lo que abres el lunes por la mañana para ponerte a trabajar.

---

## 1. Sacar la lista (2 horas, una vez)

**Objetivo:** 50 logopedas con consulta propia en UNA provincia.

### De dónde salen

| Fuente | Cómo | Qué sacas |
|---|---|---|
| **Google Maps** | Busca "logopeda [ciudad]" y baja hasta el final | Nombre, teléfono, web (o su ausencia), reseñas |
| **Colegio profesional** | Cada comunidad tiene su colegio de logopedas con buscador de colegiados | Nombre y municipio, ya filtrados y verificados |
| **Doctoralia** | Filtra por logopedia + provincia | Nombre, especialidad, si tiene web |
| **Instagram** | `#logopeda[ciudad]` | Los que ya se mueven en redes: entienden antes el valor |

### La tabla

Una hoja de cálculo. Estas columnas y ninguna más:

| Nombre | Consulta | Ciudad | Teléfono | Web | Estado web | Puntuación | Estado | Fecha contacto | Notas |
|---|---|---|---|---|---|---|---|---|---|

**Estado web:** `no tiene` · `vieja` · `no se ve en móvil` · `bien`
**Estado:** `pendiente` → `web construida` → `contactado` → `respondió` → `llamada` → `cliente` / `no`

### Cómo puntuar (0-5). Solo trabajas los de 4 y 5

| Punto | Criterio |
|---|---|
| +2 | **No tiene web** o la tiene rota |
| +1 | Tiene web pero **no se ve bien en el móvil** *(ábrela en tu teléfono: si hay que hacer zoom, punto)* |
| +1 | Tiene **reseñas en Google** — le importa su presencia online |
| +1 | **Consulta propia**, no empleado de un centro grande *(un empleado no decide ni paga)* |
| −2 | Web moderna y buena — **no la necesita, no le molestes** |

**Descarta sin piedad los de 3 o menos.** Es mejor contactar con 10 buenos que con 50 regulares:
el tiempo que ahorras filtrando lo inviertes en construirles la web, que es lo que cierra la venta.

---

## 2. Construir antes de vender

**La regla:** no escribes a nadie sin tener su web hecha.

Es lo que hace que esto funcione y no sea otro mensaje comercial más. Todos los logopedas de esa
provincia han recibido cinco mensajes de "¿te hago una web?" este año. Ninguno ha recibido
**una web ya hecha**.

### Qué usas de cada uno

**Sí (es público):** nombre de la consulta, dirección, teléfono, horario, servicios que anuncia,
reseñas de Google *(citadas, no copiadas)*, ciudad.

**No:** fotos suyas o de su local que no tengas derecho a usar · su logo si no está publicado ·
datos de pacientes · nada inventado sobre él.
→ Donde falte algo, **arte SVG generado y estados vacíos**, como manda la filosofía de la fábrica.

### Cómo lanzarlo

```
Créame una app para la consulta de logopedia "[NOMBRE]" en [CIUDAD].
Objetivo: que los padres pidan cita.
Servicios que anuncia: [copiados de su ficha de Google]
Teléfono: [el suyo público]
Es una web de muestra para enseñársela: sin logo inventado, con placeholders donde falten fotos.
```

Y antes de enviar nada:

```bash
node tools/verificar-app.mjs apps/logopeda-[nombre].html
```

**Si no sale `✅ APTO`, no se envía.** Enseñar una web con un botón roto es peor que no escribir.

### Dónde la alojas

Enlace directo y **no indexable** (`noindex`), uno por persona. No la subas a un sitio donde la
encuentre cualquiera: es suya, no tuya, y esa es justo la sensación que quieres transmitir.

---

## 3. El mensaje

### WhatsApp / SMS *(el que mejor funciona — es donde vive este cliente)*

> Buenos días, Marta. Soy Jaime, de Incuba tu Negocio.
>
> He visto que su consulta de [CIUDAD] no tiene web y **le he hecho una** para enseñarle cómo
> quedaría. Se puede tocar desde el móvil: [enlace]
>
> Si le gusta, se la dejo puesta a su nombre. Si no, la borro y no le molesto más.

Cuatro cosas y ninguna más: quién eres, qué has visto, qué le das, cómo salir fácil.

**Por qué está escrito así:**
- **"Le he hecho una"** — en pasado. Ya existe. No es una propuesta, es un hecho.
- **Enlace en el segundo renglón.** La curiosidad es lo único que tienes; no la entierres.
- **"La borro y no le molesto más"** — le das la salida antes de que la busque. Baja la guardia.
- **Sin precio.** El precio se habla cuando ya ha visto que le gusta.
- **De usted.** Gremio sanitario, primer contacto. Ya tutearás cuando él tutee.

### Email *(cuando no hay móvil)*

**Asunto:** `Le he hecho una web a su consulta` — literal. Sin emojis, sin "propuesta", sin "colaboración".

> Buenos días, Marta:
>
> Me llamo Jaime y hago webs para consultas de logopedia.
>
> Vi que [NOMBRE CONSULTA] no tiene web, así que **le he hecho una** para que vea cómo quedaría.
> Está aquí y funciona: [enlace]
>
> Tiene su teléfono, sus servicios y un formulario para que los padres pidan cita sin llamarla.
>
> Si le encaja, se la dejo puesta a su nombre por 250 €. Si no, dígamelo y la borro hoy mismo.
>
> Un saludo,
> Jaime · Incuba tu Negocio · [teléfono]

### El único seguimiento — a los 4 días

> Buenos días Marta, ¿pudo verla? Si no le interesa dígamelo y la borro, sin problema.

**Uno. No dos, no cinco.** En un gremio pequeño donde todos se conocen, insistir te quema para
siempre. Y "dígame y la borro" consigue respuesta hasta de los que no quieren: la gente contesta
para cerrar un asunto abierto.

### Errores que matan el mensaje

❌ "Espero que se encuentre bien" · ❌ "Le escribo para presentarle nuestros servicios" ·
❌ Hablar de ti antes que de él · ❌ Adjuntar un PDF · ❌ "¿Tiene 15 minutos esta semana?" ·
❌ Tecnicismos (*responsive*, *SEO*, *landing*) · ❌ Poner el precio antes de que vea la web.

---

## 4. La llamada (10 minutos)

Cuando responda "sí, me gusta", llama. No lo cierres por escrito: por teléfono se cierra el doble.

**1. Abrir (30 s)** — "Gracias por contestar. Antes de nada, ¿la vio en el móvil? ¿Qué le pareció?"
→ **Y te callas.** Lo que diga aquí es tu copy del año que viene. Apúntalo literal.

**2. Entender (3 min)** — Tres preguntas, en este orden:
- ¿Cómo le llegan hoy los pacientes nuevos?
- ¿Cuántos le entran al mes, más o menos?
- ¿Qué es lo que más tiempo le quita al día?

**3. Enseñar (3 min)** — Enseña **una sola cosa**: el formulario de cita.
*"Esto es lo que cambia: el padre rellena esto a las once de la noche y usted lo ve por la mañana,
sin llamadas mientras está en sesión."*

**4. Precio (1 min)** — Sin rodeos y sin pedir perdón:
*"Son 250 €. Es el precio de las primeras cinco consultas, porque estoy montando mi carpeta de
trabajos y a cambio le pido que me grabe un vídeo de un minuto contando qué tal. Después son 490 €."*

**5. Cerrar (2 min)** — *"Si quiere, reservamos con 100 € y en 7 días la tiene. El resto lo paga
cuando la vea terminada y le guste. Si el día 7 no está, le devuelvo la señal."*
→ **Y te callas otra vez.** El primero que habla, pierde.

### Respuestas a lo que te van a decir

| Te dice | Le dices |
|---|---|
| "Me lo tengo que pensar" | "Claro. ¿Qué es lo que le hace dudar?" *(y escuchas — la duda real siempre está detrás)* |
| "Es que ahora no es buen momento" | "Lo entiendo. Se la dejo puesta una semana más por si la quiere enseñar en casa, y le escribo el lunes." |
| "¿250 € por una web? ¿Dónde está el truco?" | "Ninguno. La construyo con un sistema automatizado que me quita el 80% del trabajo. Le cobro el trabajo que hago, no el que me ahorra la máquina." |
| "Mi sobrino sabe de esto" | "Perfecto, que la vea. Esta ya está hecha y funcionando — la de su sobrino, cuando la tenga, la compara y elige." |
| "¿Y luego quién me la mantiene?" | "Yo, por 39 € al mes, con el primer mes incluido. Y si no lo quiere, la web es suya igual y no deja de funcionar." |

---

## 5. El día que entregas (no te lo saltes)

Es el momento de máxima felicidad del cliente. **Todo lo que pidas hoy te lo da; dentro de un mes, no.**

- [ ] Enseñársela por videollamada, no por mensaje
- [ ] **Grabar el testimonio ahí mismo** — un minuto, con el móvil, sin guion:
      *"¿Cómo estabas antes y cómo estás ahora?"*
- [ ] **Pedir la reseña de Google** delante de ti, con el enlace ya preparado
- [ ] **Firmar el Plan Nido** (primer mes incluido)
- [ ] Pedir referidos: *"¿Conoces a alguien del gremio a quien le venga bien? Le hago la web a
      mitad de precio y a ti te regalo un mes."*
- [ ] Publicar el caso en tu web **ese mismo día**

---

## 6. Los números a vigilar

Una fila por semana. Si tardas más de cinco minutos, no lo vas a hacer.

| Semana | Webs hechas | Contactados | Respondieron | Llamadas | Cerrados | € |
|---|---|---|---|---|---|---|

**Qué es normal y qué no** *(referencias de venta local; ajústalas con tus datos reales)*:

| Métrica | Esperable | Si sale por debajo… |
|---|---|---|
| Responden | 20-40 % | El problema es el mensaje o la lista. Nunca la web. |
| Llamada tras responder | 50-70 % | Tardas demasiado en contestar. Responde en menos de 1 h. |
| Cierran tras la llamada | 30-50 % | El problema es el precio o la confianza → garantía y testimonios. |

**Con 30 contactados deberías sacar 3-4 clientes.** Si contactas con 30 y no cierras ninguno,
para y revisa — no sigas contactando con 30 más haciendo lo mismo.

---

## 7. La primera semana, día a día

| Día | Qué haces |
|---|---|
| **Lunes** | Poner tu WhatsApp real en la web. Sacar los 50 logopedas. Puntuar. |
| **Martes** | Construir las 5 primeras webs. Verificar cada una. |
| **Miércoles** | Construir 5 más. Subirlas con enlace privado. |
| **Jueves** | Enviar los 10 mensajes. **Por la mañana, entre 9:00 y 10:00.** |
| **Viernes** | Contestar. Llamar a los que respondan. |
| **Lunes siguiente** | El único seguimiento a los que no contestaron. Otras 10 webs. |

**Al final de la semana 2 deberías tener tu primer cliente.** Si no lo tienes, el problema está
en la lista o en el mensaje — no en el producto, que ya sabes que funciona.
