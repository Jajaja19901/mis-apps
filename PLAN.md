# PLAN — App de gestión para Carmen Delia (jardinera autónoma)

> **Naturaleza de esta app (LEER PRIMERO):** NO es un embudo de venta ni una landing pública.
> Es una **herramienta interna personal y 100% offline** para una sola usuaria (Carmen Delia).
> No hay visitantes, no hay captación, no hay registro de terceros. Por eso varias reglas del
> estudio se reinterpretan (ver "Adaptación de la filosofía del estudio"). El "dueño" y el
> "usuario" son la misma persona: Carmen Delia. No hay datos personales de terceros recogidos por
> formulario público; los datos de clientes los introduce ella misma como agenda privada local.
>
> Aun así se entrega **un solo `index.html` autocontenido** (CSS y JS inline) que funciona abierto
> con doble clic. Para ser instalable como PWA real con `service-worker` y `manifest.json`
> externos hace falta servir por HTTPS; en `file://` funciona como web offline normal. Por eso el
> SW y el manifest se **embeben** (manifest como Blob URL, SW opcional) y se entrega además, como
> extra documentado, la posibilidad de los dos archivos sueltos. La entrega principal es el HTML.

---

## 0. Adaptación de la filosofía del estudio a este caso

| Regla del estudio | Cómo aplica aquí |
|---|---|
| Un solo HTML autocontenido | SÍ. `apps/carmen-delia-jardineria.html`. CSS + JS inline. |
| Sin registro de usuarios finales | SÍ. No hay usuarios finales; solo Carmen Delia. |
| Panel de admin con `ADMIN_PASSWORD` en `#/admin` | **Reinterpretado:** toda la app es "el panel". Se añade un **bloqueo opcional por PIN** (`APP_PIN` en CONFIG, vacío por defecto = sin bloqueo) en `#/clientes` y datos sensibles. Si está vacío, no se pide nada. Esto cubre el espíritu (proteger datos privados del dueño) sin estorbar el uso diario. |
| Sin cookies de tracking / sin RGPD | SÍ. Cero red, cero analítica, cero cookies. |
| Consentimiento + política de privacidad por formularios | **NO aplica formulario público.** Los datos de clientes son una agenda privada local de la propietaria. Aun así, en `#/mas` se incluye una nota de "Aviso de datos" recordando que los datos de sus clientes están solo en su dispositivo y que ella es responsable de tratarlos (placeholder de titular). No hay casilla de consentimiento de visitante porque no hay visitante. |
| Embudo de venta / conversión | **NO aplica.** Es productividad interna. La "acción principal" de cada pantalla es la tarea de gestión, no una venta. |
| Firma del estudio en el pie | SÍ. En `#/mas`: "Diseñado por Incuba tu Negocio · por Jaime M. M." (CONFIG: STUDIO_BRAND, STUDIO_AUTHOR, STUDIO_URL). |
| Imágenes subidas por el dueño | SÍ. Las fotos las captura/sube Carmen Delia desde la cámara o galería; arranque con estado vacío. |
| Instalable (PWA) | SÍ. Manifest embebido + metas Apple + favicon SVG (logo hoja). Botón "Instalar app". |
| Sin librerías | SÍ. Vanilla JS/CSS. IndexedDB nativo para fotos. |
| Contenido real, sin lorem | SÍ. Textos reales en español. Estados vacíos con copy útil. |

---

## 1. CONFIG (caja de configuración arriba del JS)

```js
const CONFIG = {
  OWNER_NAME: "Carmen Delia",            // titular; editable
  APP_TITLE: "Jardín · Gestión",         // nombre interno de la app
  APP_PIN: "",                            // PIN opcional (4-6 dígitos). "" = sin bloqueo
  CURRENCY: "€",
  WEEK_STARTS_MONDAY: true,
  PHOTO_MAX_PX: 1200,                     // lado mayor tras compresión
  PHOTO_QUALITY: 0.8,                     // JPEG 0.8
  REMINDER_HOUR: 8,                       // hora recordatorio diario (0-23)
  STUDIO_BRAND: "Incuba tu Negocio",
  STUDIO_AUTHOR: "Jaime M. M.",
  STUDIO_URL: "#"
};
```

> **DATO QUE FALTA:** el briefing dice "Carmen Delia" como negocio/persona; se usa tal cual como
> titular (NO es inventado, viene del briefing). No hay logo aportado → emblema SVG de hoja.

---

## 2. CRITERIOS DE ACEPTACIÓN (verificables con sí/no pulsando)

> Numerados. Cada uno se puede comprobar en un navegador con un clic. El QA (agente 10) los ejecuta.

### Navegación y arranque
1. Al abrir el archivo, se ve la pestaña **Agenda** con la semana actual y el día de hoy resaltado.
2. La barra inferior muestra exactamente 4 pestañas: **Agenda · Clientes · Pendientes · Más**.
3. Al pulsar cada pestaña inferior cambia la vista y la pestaña activa queda marcada visualmente.
4. En las 4 pestañas existe un **botón flotante "+"** visible en la esquina inferior derecha.
5. Si `APP_PIN` está vacío, NO se pide PIN al entrar (uso directo).
6. Si `APP_PIN` tiene valor, al ir a `#/clientes` aparece la pantalla de PIN y, con PIN correcto, entra; con PIN incorrecto muestra "PIN incorrecto" y NO entra.

### Clientes
7. En **Clientes** vacío, se ve un estado vacío con texto "Aún no tienes clientes" y un botón para añadir el primero.
8. Al pulsar "+" en Clientes se abre el formulario de **nuevo cliente** con los campos: nombre (obligatorio), dirección, teléfono, portón/acceso, mascotas, día de pago, frecuencia, notas.
9. Al guardar un cliente sin nombre, aparece aviso "El nombre es obligatorio" y NO se guarda.
10. Al guardar un cliente con nombre, vuelve a la lista y el cliente aparece en ella.
11. Al escribir en el buscador de Clientes, la lista filtra por nombre/dirección en tiempo real; si no hay coincidencias muestra "Sin resultados".
12. Al pulsar un cliente de la lista se abre su **ficha** con sus datos y su historial de trabajos.
13. En la ficha, si hay dirección, el botón **"Cómo llegar"** abre un enlace de Google Maps (`https://maps.google.com/?q=...`).
14. En la ficha, si hay teléfono, el botón **"Llamar"** usa `tel:` y el botón **"WhatsApp"** usa `https://wa.me/...`.
15. En la ficha se puede **Editar** (reabre el formulario con datos cargados) y **Eliminar** (pide confirmación; tras confirmar el cliente desaparece de la lista).

### Trabajos
16. Desde la ficha de un cliente, el botón **"Nuevo trabajo"** abre el formulario de trabajo (fecha, estado, importe, descripción).
17. Un trabajo nuevo se crea con estado **Pendiente** por defecto y aparece en el historial del cliente.
18. En la ficha del trabajo se puede cambiar el estado entre **Pendiente / En curso / Hecho** y el cambio persiste tras recargar.
19. En la ficha del trabajo se pueden añadir tareas al **checklist**; al marcarlas como hechas se tachan y el contador "X/Y" se actualiza.
20. En la ficha del trabajo, marcar **"Cobrado"** cambia el estado de cobro y queda reflejado (etiqueta "Cobrado").
21. Tras recargar la página, todos los trabajos, estados, checklist e importes siguen ahí (persistencia localStorage).

### Fotos
22. En la ficha del trabajo, el botón **"Añadir foto"** abre el selector de cámara/galería (`<input type="file" accept="image/*" capture>`).
23. Tras elegir/capturar una foto, esta se muestra como miniatura en el trabajo (guardada como Blob en IndexedDB).
24. Cada foto puede etiquetarse como **Antes** o **Después**; en la vista comparativa se muestran lado a lado.
25. El botón **"Compartir"** de una foto intenta `navigator.share`; si no está disponible, ofrece **descargar** la imagen (fallback) sin romper.
26. Al eliminar una foto, desaparece de la miniatura y del comparador.

### Agenda
27. En **Agenda** se ven los 7 días de la semana (lunes a domingo) con el día de hoy resaltado.
28. Los botones **"‹ Semana anterior"** y **"Semana siguiente ›"** cambian el rango mostrado y el título de fechas se actualiza.
29. Cada día muestra las **visitas previstas** según la frecuencia de los clientes y los trabajos con fecha ese día.
30. El botón **"Hoy"** vuelve a la semana actual desde cualquier semana.

### Pendientes
31. En **Pendientes** hay dos listas separadas: **Materiales a comprar** y **Cosas por hacer**.
32. El "+" de Pendientes permite añadir un ítem eligiendo a qué lista va; el ítem aparece en su lista.
33. Al marcar un ítem como hecho/comprado, se tacha y baja al grupo de completados (o se marca visualmente); el cambio persiste tras recargar.
34. Se puede eliminar un ítem pendiente.

### Cobros
35. En **Más → Cobros** se ve el resumen del mes actual con **total cobrado** y **total pendiente** calculados desde los trabajos.
36. Los botones de mes anterior/siguiente cambian el periodo y recalculan los totales.

### Datos / Backup
37. En **Más → Datos**, el botón **"Exportar JSON"** descarga un archivo `.json` con todos los datos de texto (clientes, trabajos, pendientes) SIN las fotos.
38. El botón **"Importar JSON"** permite seleccionar un archivo y, tras confirmar, repuebla los datos (los clientes importados aparecen en la lista).
39. El botón **"Eliminar fotos antiguas"** pide confirmación y borra de IndexedDB las fotos de trabajos marcados como Hecho con más de N meses (N configurable en el diálogo), liberando espacio.

### PWA / Instalación
40. Existe un botón **"Instalar app"** en Más; en navegadores compatibles dispara el prompt de instalación; donde no, muestra instrucciones de "Añadir a pantalla de inicio".
41. La firma "Diseñado por Incuba tu Negocio · por Jaime M. M." aparece en el pie de **Más**.

---

## 3. ALCANCE

### Entra en v1
- 4 pestañas (Agenda, Clientes, Pendientes, Más) con router hash.
- CRUD de clientes con ficha completa y acciones de contacto (llamar/WhatsApp/Maps).
- CRUD de trabajos por cliente: estado, fechas, checklist, importe, cobrado.
- Fotos: captura/galería, compresión a 1200px JPEG 0.8, almacenamiento Blob en IndexedDB, etiqueta antes/después, comparador, compartir/descargar, borrado.
- Agenda semanal con navegación y cálculo de próximas visitas por frecuencia.
- Pendientes (materiales + tareas) con marcar hecho.
- Cobros: resumen mensual cobrado/pendiente.
- Backup: exportar/importar JSON (sin fotos), limpieza de fotos antiguas.
- PWA: manifest embebido, metas Apple, favicon SVG, botón instalar.
- PIN opcional de bloqueo.

### NO entra en v1 (anótese como futuras mejoras)
- Sincronización en la nube / multidispositivo (es offline puro).
- Cobro real con tarjeta (no hay backend; los cobros se registran manualmente).
- Backup de fotos dentro del JSON (las fotos son Blobs pesados; se excluyen a propósito).
- Notificaciones push reales del recordatorio (sin SW activo en `file://` no hay push; el "recordatorio diario" se resuelve como **aviso in-app** al abrir la app si hay pendientes — ver §6.5).
- Gestión de varios usuarios/empleados.
- Facturación legal con numeración fiscal.

---

## 4. MAPA DE PANTALLAS (rutas hash)

| Ruta | Pantalla | Pestaña activa |
|---|---|---|
| `#/` o `#/agenda` | Agenda semanal | Agenda |
| `#/clientes` | Lista + buscador de clientes | Clientes |
| `#/cliente/:id` | Ficha de cliente + historial trabajos | Clientes |
| `#/cliente/nuevo` | Formulario nuevo cliente | Clientes |
| `#/cliente/:id/editar` | Formulario editar cliente | Clientes |
| `#/cliente/:id/trabajo/nuevo` | Formulario nuevo trabajo | Clientes |
| `#/trabajo/:id` | Ficha de trabajo (estado, checklist, fotos, cobro) | Clientes |
| `#/trabajo/:id/comparar` | Comparador antes/después | Clientes |
| `#/pendientes` | Materiales + tareas | Pendientes |
| `#/mas` | Menú: Cobros, Datos/Backup, Instalar, PIN, Aviso de datos, firma | Más |
| `#/cobros` | Resumen mensual cobrado/pendiente | Más |
| `#/datos` | Exportar/importar/limpiar fotos | Más |
| `#/pin` | Pantalla de desbloqueo (solo si `APP_PIN` definido) | — |

Ruta desconocida → redirige a `#/agenda`.

---

## 5. FLUJOS PASO A PASO

### 5.1 Crear cliente
1. Pestaña **Clientes** → pulsar **"+"** → ruta `#/cliente/nuevo`.
2. Pantalla muestra campos. Validación: **nombre** no vacío (trim). Si vacío al pulsar "Guardar" → mensaje inline "El nombre es obligatorio", foco al campo, NO avanza.
3. Teléfono: opcional; si se rellena, se normaliza para `tel:`/`wa.me` (quitar espacios; si no empieza por `+`, anteponer prefijo configurable, por defecto `+34`).
4. Frecuencia: select con opciones **Semanal / Quincenal / Mensual / Puntual** + campo "día preferido" (lunes…domingo) usado por la agenda.
5. Pulsar **"Guardar"** → crea registro, navega a `#/cliente/:id` (ficha del nuevo).

### 5.2 Crear y gestionar trabajo
1. En `#/cliente/:id` → botón **"Nuevo trabajo"** → `#/cliente/:id/trabajo/nuevo`.
2. Campos: fecha (default hoy), descripción, importe (número ≥0, opcional), estado (default Pendiente).
3. Guardar → navega a `#/trabajo/:id`.
4. En la ficha de trabajo:
   - **Estado**: 3 botones segmentados Pendiente/En curso/Hecho → al pulsar, actualiza y persiste.
   - **Checklist**: campo "Añadir tarea" + botón; cada tarea con checkbox; contador "hechas/total".
   - **Fotos**: botón "Añadir foto" (ver 5.3). Cada foto con selector Antes/Después y botones Compartir/Eliminar.
   - **Cobro**: campo importe + toggle "Cobrado". Al activar Cobrado se guarda `cobrado:true` y fecha de cobro.
   - **Comparar**: botón → `#/trabajo/:id/comparar` (muestra primera "antes" vs primera "después").

### 5.3 Añadir foto (con compresión)
1. Botón "Añadir foto" → `<input type="file" accept="image/*" capture="environment">`.
2. Al seleccionar: leer archivo → `createImageBitmap`/`<img>` → dibujar en `<canvas>` escalando a lado mayor `PHOTO_MAX_PX` → `canvas.toBlob('image/jpeg', PHOTO_QUALITY)`.
3. Guardar Blob en IndexedDB (store `photos`), registrar metadato en localStorage del trabajo (id de foto, tag, fecha).
4. Mostrar miniatura usando `URL.createObjectURL(blob)` (revocar al desmontar).
5. Validación: si el archivo no es imagen → aviso "Solo imágenes". Si falla la lectura → aviso, no rompe.

### 5.4 Compartir foto
1. Botón "Compartir" → si `navigator.canShare && navigator.share` con archivo → `navigator.share({files:[file]})`.
2. Si no soportado → crear enlace de descarga (`a.download`) y forzar clic → la imagen se descarga.

### 5.5 Backup
1. `#/datos` → **Exportar JSON**: serializa `{clientes, trabajos, pendientes, meta, version}` (sin fotos) → descarga `jardin-backup-AAAA-MM-DD.json`.
2. **Importar JSON**: input file → parsea → valida que tenga `version` y claves esperadas → confirma "Esto reemplazará tus datos actuales ¿seguro?" → escribe en localStorage → recarga vistas.
3. **Eliminar fotos antiguas**: diálogo "Borrar fotos de trabajos hechos hace más de [3] meses" → confirma → recorre trabajos Hecho con `fecha < hoy-Nmeses`, borra sus fotos de IndexedDB y sus metadatos.

### 5.6 PIN (si configurado)
1. Si `APP_PIN!==""` y la sesión no está desbloqueada (flag en memoria, NO en storage persistente), al navegar a `#/clientes`/`#/cliente/*`/`#/cobros`/`#/datos` → redirige a `#/pin`.
2. Pantalla PIN: input numérico + "Entrar". Correcto → set flag desbloqueado en memoria → vuelve a ruta pedida. Incorrecto → "PIN incorrecto".

---

## 6. INVENTARIO DE CONTROLES POR PANTALLA

### 6.1 Barra inferior (global, en todas las vistas con tab)
- Botón **Agenda** → `location.hash='#/agenda'`.
- Botón **Clientes** → `#/clientes`.
- Botón **Pendientes** → `#/pendientes`.
- Botón **Más** → `#/mas`.
- La activa recibe clase `.active`.

### 6.2 FAB "+" (contextual según pestaña)
- En Agenda → abre nuevo trabajo rápido (elige cliente) o nuevo cliente (menú de 2 opciones).
- En Clientes → `#/cliente/nuevo`.
- En Pendientes → abre diálogo "nuevo pendiente" (tipo material/tarea + texto).
- En Más → oculto (no FAB en Más).

### 6.3 Agenda (`#/agenda`)
- **‹ / ›**: cambia `weekOffset` ±1, re-render.
- **Hoy**: `weekOffset=0`, re-render.
- Cada tarjeta de visita → al pulsar abre `#/cliente/:id` (si es por frecuencia) o `#/trabajo/:id` (si es trabajo concreto).

### 6.4 Clientes (`#/clientes`)
- **Buscador** (input): `oninput` filtra array por `nombre` y `direccion` (case-insensitive, sin acentos).
- **Tarjeta cliente** → `#/cliente/:id`.
- **FAB +** → `#/cliente/nuevo`.
- Estado vacío: botón **"Añadir primer cliente"** → `#/cliente/nuevo`.

### 6.5 Ficha cliente (`#/cliente/:id`)
- **‹ Volver** → `#/clientes`.
- **Llamar** (`tel:`), **WhatsApp** (`wa.me`), **Cómo llegar** (`maps.google.com/?q=`) — solo visibles si hay dato.
- **Editar** → `#/cliente/:id/editar`.
- **Eliminar** → confirm → borra cliente + sus trabajos + fotos asociadas → `#/clientes`.
- **Nuevo trabajo** → `#/cliente/:id/trabajo/nuevo`.
- Lista de trabajos → cada uno a `#/trabajo/:id`.

### 6.6 Formulario cliente (nuevo/editar)
- Campos: `nombre*`, `direccion`, `telefono`, `acceso` (portón/código), `mascotas`, `diaPago`, `frecuencia` (select), `diaPreferido` (select), `notas` (textarea).
- **Guardar** → valida nombre → crea/actualiza → navega a ficha.
- **Cancelar** → vuelve atrás sin guardar.

### 6.7 Ficha trabajo (`#/trabajo/:id`)
- **Volver** → ficha cliente.
- **Estado** (3 botones segmentados) → set estado.
- **Importe** (input number) + **Cobrado** (toggle) → set cobro.
- **Checklist**: input + "Añadir" → push tarea; checkbox por tarea → toggle hecho; "x" → borra tarea.
- **Añadir foto** → input file (ver 5.3).
- Por foto: select **Antes/Después**, **Compartir**, **Eliminar**.
- **Comparar** → `#/trabajo/:id/comparar`.
- **Eliminar trabajo** → confirm → borra trabajo + fotos.

### 6.8 Pendientes (`#/pendientes`)
- Dos secciones: **Materiales** / **Tareas**.
- Por ítem: checkbox (hecho/comprado) → toggle; "x" → borra.
- **FAB +** → diálogo: tipo (radio material/tarea) + texto + "Añadir".

### 6.9 Más (`#/mas`)
- Enlaces: **Cobros** (`#/cobros`), **Datos y copias** (`#/datos`).
- **PIN**: toggle/campo para fijar o quitar PIN (se guarda en localStorage `meta.pin`; CONFIG es el valor inicial por defecto).
- **Instalar app** → `deferredPrompt.prompt()` o instrucciones.
- **Recordatorio diario** (toggle): si ON, al abrir la app después de `REMINDER_HOUR` y si hay pendientes/visitas hoy, muestra un banner "Tienes X visitas y Y pendientes hoy".
- Sección **Aviso de datos** (texto fijo).
- **Firma del estudio** en el pie.

### 6.10 Cobros (`#/cobros`)
- **‹ / ›** mes → cambia `monthOffset`, recalcula.
- Muestra: total **Cobrado**, total **Pendiente**, nº trabajos, lista de trabajos del mes con su importe y estado.

### 6.11 Datos (`#/datos`)
- **Exportar JSON**, **Importar JSON** (input file), **Eliminar fotos antiguas** (input meses + confirmar).

### 6.12 PIN (`#/pin`)
- Input PIN + **Entrar**. Mensaje de error inline.

---

## 7. MODELO DE DATOS

### localStorage (claves)
- `jd_clientes` → `Cliente[]`
- `jd_trabajos` → `Trabajo[]`
- `jd_pendientes` → `Pendiente[]`
- `jd_meta` → `Meta` (config persistida por el usuario)

### IndexedDB
- DB `jardin_db`, versión 1.
- Object store **`photos`**, keyPath `id`. Registro: `{ id:string, trabajoId:string, blob:Blob, tag:"antes"|"despues"|"sin", fecha:number }`.

### Tipos

```ts
Cliente = {
  id: string,            // "c_" + Date.now().toString(36) + rnd
  nombre: string,        // obligatorio
  direccion: string,     // ""
  telefono: string,      // "" (guardado tal cual; normalizado al usar)
  acceso: string,        // portón/código/llave; ""
  mascotas: string,      // "" (texto libre: "Perro grande suelto")
  diaPago: string,       // "" texto libre o día del mes
  frecuencia: "semanal"|"quincenal"|"mensual"|"puntual",
  diaPreferido: ""|"lun"|"mar"|"mie"|"jue"|"vie"|"sab"|"dom",
  notas: string,         // ""
  creado: number,        // Date.now()
  ultimaVisita: number|null  // se actualiza al marcar trabajo Hecho
}

Trabajo = {
  id: string,            // "t_" + ...
  clienteId: string,
  fecha: number,         // timestamp del día del trabajo
  descripcion: string,
  estado: "pendiente"|"curso"|"hecho",
  checklist: [{ id:string, texto:string, hecho:boolean }],
  importe: number,       // 0 si no aplica
  cobrado: boolean,
  fechaCobro: number|null,
  fotos: [{ id:string, tag:"antes"|"despues"|"sin", fecha:number }], // metadatos; Blob en IndexedDB
  creado: number
}

Pendiente = {
  id: string,            // "p_" + ...
  tipo: "material"|"tarea",
  texto: string,
  hecho: boolean,        // hecho/comprado
  creado: number
}

Meta = {
  pin: string,           // "" si no hay
  recordatorio: boolean, // toggle recordatorio diario
  prefijoTel: string,    // "+34" por defecto
  version: 1
}
```

### Generación de IDs
`function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }`
Prefijos: clientes `c_`, trabajos `t_`, fotos `f_`, pendientes `p_`, tareas `k_`.

### Export JSON (forma)
```json
{ "version": 1, "exportado": "2026-06-17T10:00:00Z",
  "clientes": [...], "trabajos": [...], "pendientes": [...], "meta": {...} }
```
Las fotos NO se incluyen (solo metadatos dentro de cada trabajo).

---

## 8. ALGORITMO DE AGENDA SEMANAL

**Objetivo:** dado un `weekOffset`, mostrar lunes→domingo de esa semana con (a) trabajos con fecha
en ese rango y (b) "visitas previstas" por frecuencia de cada cliente.

### Cálculo del rango de semana
```
hoy = new Date(); hoy.setHours(0,0,0,0)
diaSemana = (hoy.getDay()+6)%7        // 0=lunes ... 6=domingo (WEEK_STARTS_MONDAY)
lunesActual = hoy - diaSemana días
inicio = lunesActual + (weekOffset*7) días
fin = inicio + 6 días
```

### Para cada día D del rango (7 días)
1. **Trabajos del día:** `trabajos` cuyo `fecha` cae en D (mismo día natural). Cualquier estado; los Hechos se muestran atenuados.
2. **Visitas previstas por frecuencia:** para cada cliente con `frecuencia != "puntual"`:
   - Determinar si "toca" ese día según frecuencia y `diaPreferido`:
     - **semanal**: toca si `diaPreferido` coincide con el día de la semana de D (si no hay diaPreferido, no se proyecta — se anota como "sin día asignado" en una lista aparte de la agenda).
     - **quincenal**: toca si coincide `diaPreferido` Y el número de semana ISO de D es par respecto a una semana base (base = semana de `cliente.creado`); fórmula: `((semanaISO(D) - semanaISO(creado)) mod 2)===0`.
     - **mensual**: toca si coincide `diaPreferido` Y es la **primera ocurrencia** de ese día de la semana dentro del mes de D (o, si `diaPago`/regla mensual define día del mes, ese día). Por defecto: primera semana del mes.
   - Si "toca" y NO existe ya un trabajo de ese cliente ese día (para no duplicar), se añade una tarjeta "Visita prevista — {cliente}" enlazando a `#/cliente/:id` con botón rápido "Crear trabajo".
3. Orden dentro del día: trabajos primero (por hora/orden de creación), luego visitas previstas.

### Día de hoy
Se resalta la columna/tarjeta cuyo D === hoy (solo cuando `weekOffset===0`).

### Próximas visitas (resumen superior de Agenda)
Lista compacta de las siguientes 5 visitas previstas a partir de hoy (recorriendo días hacia delante hasta 30 días, aplicando la misma regla "toca").

> Nota de robustez: el cálculo es determinista y no usa red. Si un cliente no tiene `diaPreferido`,
> nunca se proyecta (se evita inventar visitas). Esto se documenta para que UX muestre un aviso
> "Asigna un día preferido para verlo en la agenda".

---

## 9. SUPUESTOS

1. Un solo dispositivo, una sola usuaria; sin concurrencia.
2. El recordatorio "diario" se implementa como **aviso in-app al abrir** (no push real en `file://`).
3. Prefijo telefónico por defecto `+34` (España) — editable en Meta.
4. La compresión usa `<canvas>`+`toBlob`; si el navegador no soporta `toBlob` con jpeg, fallback a `toDataURL` y conversión a Blob.
5. IndexedDB disponible (todos los navegadores modernos); si falla, las fotos se avisan como no disponibles y el resto de la app funciona.
6. Cobros = registro manual; no hay pasarela de pago.
7. La frecuencia "quincenal/mensual" usa la fecha de alta del cliente como ancla; es una previsión orientativa, no una cita fija.
8. PIN es disuasorio local (no cifra datos); se documenta como tal.

---

## 10. DATOS QUE FALTAN (placeholders usados)

| Dato | Estado | Placeholder usado |
|---|---|---|
| Nombre titular | Dado en briefing | "Carmen Delia" |
| Logo / marca | No aportado | Emblema SVG (hoja) + texto "Jardín · Gestión" |
| Teléfono propio del negocio | No aplica (app interna) | — |
| Prefijo país | No aportado | `+34` (editable) |
| Color de marca | "verde natural + neutros" (briefing) | verde `#3f7d52` aprox + neutros |
| Titular para aviso de datos | No aportado | "[Carmen Delia]" placeholder |

---

## 11. TESTS DE ACEPTACIÓN EJECUTABLES (embeber en el HTML)

> El constructor debe pegar este bloque en el HTML final y usar EXACTAMENTE estos selectores/IDs.
> Convención de IDs obligatoria para los demás agentes:
> - Pestañas: `#tab-agenda #tab-clientes #tab-pendientes #tab-mas`
> - FAB: `#fab`
> - Buscador clientes: `#cli-buscar`
> - Form cliente: `#form-cliente`, campo nombre `#cli-nombre`, tel `#cli-tel`, dirección `#cli-dir`,
>   frecuencia `#cli-frec`, día preferido `#cli-dia`, guardar `#cli-guardar`.
> - Estado vacío clientes: texto "Aún no tienes clientes".
> - Form trabajo: `#form-trabajo`, importe `#tr-importe`, guardar `#tr-guardar`.
> - Estado trabajo: botones `#est-pendiente #est-curso #est-hecho`.
> - Checklist: input `#chk-input`, botón `#chk-add`.
> - Cobrado: `#tr-cobrado`.
> - Pendientes: FAB abre diálogo con `#pend-tipo-material #pend-tipo-tarea`, texto `#pend-texto`, add `#pend-add`.
> - Agenda nav: `#wk-prev #wk-next #wk-hoy`.
> - Cobros nav: `#mes-prev #mes-next`.
> - Datos: `#btn-export #btn-import #btn-limpiar-fotos`.
> - PIN: form `#form-pin`, campo `#pin-input`.

```html
<script type="application/json" id="acceptance-tests">
[
  { "name": "Arranca en Agenda con 4 pestañas", "steps": [
    { "goto": "#/" },
    { "expect": "Agenda" },
    { "expectVisible": "#tab-clientes" },
    { "expectVisible": "#tab-pendientes" },
    { "expectVisible": "#tab-mas" },
    { "expectVisible": "#fab" }
  ]},
  { "name": "Clientes vacio muestra estado vacio", "steps": [
    { "goto": "#/clientes" },
    { "expect": "Aún no tienes clientes" }
  ]},
  { "name": "Nuevo cliente valida nombre obligatorio", "steps": [
    { "goto": "#/cliente/nuevo" },
    { "click": "#cli-guardar" },
    { "expect": "El nombre es obligatorio" }
  ]},
  { "name": "Crea cliente y aparece en la lista", "steps": [
    { "goto": "#/cliente/nuevo" },
    { "fill": { "sel": "#cli-nombre", "value": "María Jardín" } },
    { "fill": { "sel": "#cli-dir", "value": "Calle Olivo 4" } },
    { "click": "#cli-guardar" },
    { "goto": "#/clientes" },
    { "expect": "María Jardín" }
  ]},
  { "name": "Buscador filtra clientes", "steps": [
    { "goto": "#/clientes" },
    { "fill": { "sel": "#cli-buscar", "value": "zzzznoexiste" } },
    { "expect": "Sin resultados" },
    { "fill": { "sel": "#cli-buscar", "value": "María" } },
    { "expect": "María Jardín" }
  ]},
  { "name": "Crea trabajo y cambia estado a Hecho persistente", "steps": [
    { "goto": "#/clientes" },
    { "clickText": "María Jardín" },
    { "clickText": "Nuevo trabajo" },
    { "fill": { "sel": "#tr-importe", "value": "45" } },
    { "click": "#tr-guardar" },
    { "click": "#est-hecho" },
    { "reload": true },
    { "expect": "Hecho" }
  ]},
  { "name": "Checklist suma tareas", "steps": [
    { "clickText": "María Jardín" },
    { "clickText": "Ver trabajo" },
    { "fill": { "sel": "#chk-input", "value": "Podar seto" } },
    { "click": "#chk-add" },
    { "expect": "Podar seto" }
  ]},
  { "name": "Pendientes anade material", "steps": [
    { "goto": "#/pendientes" },
    { "click": "#fab" },
    { "check": "#pend-tipo-material" },
    { "fill": { "sel": "#pend-texto", "value": "Comprar abono" } },
    { "click": "#pend-add" },
    { "expect": "Comprar abono" }
  ]},
  { "name": "Agenda navega semanas y vuelve a hoy", "steps": [
    { "goto": "#/agenda" },
    { "click": "#wk-next" },
    { "click": "#wk-hoy" },
    { "expectHash": "#/agenda" }
  ]},
  { "name": "Cobros muestra resumen del mes", "steps": [
    { "goto": "#/cobros" },
    { "expect": "Cobrado" },
    { "expect": "Pendiente" }
  ]},
  { "name": "Datos ofrece exportar e importar", "steps": [
    { "goto": "#/datos" },
    { "expectVisible": "#btn-export" },
    { "expectVisible": "#btn-import" },
    { "expectVisible": "#btn-limpiar-fotos" }
  ]},
  { "name": "Mas muestra firma del estudio", "steps": [
    { "goto": "#/mas" },
    { "expect": "Incuba tu Negocio" },
    { "expect": "Jaime M. M." }
  ]}
]
</script>
```

> Nota para QA: los tests de fotos (cámara) NO se automatizan con clic real (requieren archivo
> nativo); se verifican manualmente. Los criterios 22-26 quedan como verificación manual + los
> selectores existen (`#tr-foto-input`, `#foto-compartir`, `#foto-eliminar`).

---

## 12. RESUMEN PARA LOS SIGUIENTES AGENTES

- **Marca:** verde natural (briefing). Base `#3f7d52`, fondos neutros claros, system-ui. App interna, look limpio tipo herramienta, no landing.
- **UX:** mobile-first 6", tabs inferiores fijas, FAB contextual, microanimaciones suaves, estados vacíos con copy útil, confirmaciones en borrados.
- **Copy:** español natural, tono práctico de uso diario ("Hoy toca…", "Sin cobrar"), cero lorem.
- **Frontend:** una sola HTML, router hash, vistas inyectadas en `#app`, sin librerías.
- **Datos:** localStorage (texto) + IndexedDB (fotos Blob), CRUD según §6/§7, export/import JSON.
- **Seguridad:** escapar todo texto de usuario al pintar (XSS), no usar `innerHTML` con datos sin escapar; PIN disuasorio.
- **Rendimiento:** comprimir fotos antes de guardar; usar `objectURL` y revocar; render por vista.
- **Accesibilidad:** roles de tab, foco gestionado al cambiar de vista, labels en inputs, contraste AA, `prefers-reduced-motion`.
- **QA:** ejecutar §11 + verificación manual de fotos; comprobar persistencia tras recarga.
