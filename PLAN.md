# PLAN.md — Botánica de Carmen (PWA jardinera municipal)

> Plano del Arquitecto de Producto. Es el guion de los agentes 2-10. Si algo no está
> aquí, NO se improvisa: se vuelve a preguntar al arquitecto. App = un solo `index.html`
> autocontenido, mobile-first, 100% offline.

---

## 0. Naturaleza de esta app (LEER PRIMERO — cambia las reglas habituales del estudio)

Esta NO es un embudo de venta ni una landing de captación. Es una **herramienta personal
de trabajo** para una única persona (Carmen Delia, jardinera pública municipal). Implicaciones
que el resto de agentes deben respetar:

- **No hay clientes, ni cobros, ni contacto comercial, ni WhatsApp/Bizum, ni carrito, ni leads.**
  Nada de eso entra. Si un agente intenta añadirlo, el QA lo veta.
- **No hay "visitante" anónimo distinto del dueño.** La usuaria ES la dueña. Toda la app es,
  en la práctica, su panel personal. Por tanto el "embudo" se reinterpreta como: cada pantalla
  empuja a **la acción principal de esa pantalla** (escanear, registrar trabajo, marcar tarea).
- **`#/admin` existe pero es ligero:** ajustes, backup/restore, estadísticas y borrado de datos.
  Protegido por `ADMIN_PASSWORD` SOLO como bloqueo opcional de privacidad del dispositivo
  (la usuaria puede desactivarlo en Ajustes). Por defecto **viene desactivado** porque el
  dispositivo es personal; si se activa, se pide la clave para entrar a `#/mas` y `#/admin`.
- **No se recogen datos personales de terceros** → no aplica RGPD → **NO hay formulario de leads,
  NI casilla de consentimiento, NI página de Política de Privacidad obligatoria.** Sí incluimos una
  pequeña página informativa "Privacidad" que explica que **todo se guarda solo en este dispositivo**
  (localStorage/IndexedDB) y no se envía a ningún servidor. Esto es informativo, no un consentimiento.
- **Sin backend, sin red, sin CDN.** La "IA" de identificación es 100% local (ver §8). Hay que avisar
  con honestidad de que es una estimación orientativa, no un diagnóstico botánico certificado, y que
  **para plantas potencialmente tóxicas debe confirmar siempre por su cuenta**.

### Firma del estudio
En el pie de la pantalla "Más" y en la pantalla "Acerca de": discreto, "Diseñado por Incuba tu
Negocio · por Jaime M. M." (en `CONFIG`: `STUDIO_BRAND`, `STUDIO_AUTHOR`, `STUDIO_URL`).

### Tono y diseño (insumo para marca/UX/copy)
"Sorprendente y llamativo, hecho con amor para una jardinera." Verde botánico vibrante, hojas SVG,
emojis con moderación, microinteracciones suaves (escala al pulsar, transiciones de vista, animación
de hoja al analizar). Mobile-first total: se usa con una mano, en exterior, con guantes — botones
grandes, contraste alto, objetivos táctiles ≥ 48px.

---

## 1. CONFIG (caja de configuración arriba del JS)

```js
const CONFIG = {
  APP_NAME: "Botánica de Carmen",          // placeholder editable; el briefing solo da el nombre de persona
  OWNER_NAME: "Carmen Delia",              // del briefing
  OWNER_ROLE: "Jardinera municipal",       // del briefing
  MUNICIPALITY: "Tu municipio",            // PLACEHOLDER — falta en briefing
  ADMIN_PASSWORD: "jardin2026",            // bloqueo opcional de dispositivo; editable
  LOCK_ENABLED_DEFAULT: false,             // por defecto sin bloqueo (dispositivo personal)
  STUDIO_BRAND: "Incuba tu Negocio",
  STUDIO_AUTHOR: "Jaime M. M.",
  STUDIO_URL: "#",
  DB_VERSION: 1,
  PLANT_DB_MIN: 100                        // mínimo de plantas en la base local
};
```

`APP_NAME` es placeholder porque el briefing no da nombre de app/marca, solo el nombre de la
persona. Ver §10 DATOS QUE FALTAN.

---

## 2. CRITERIOS DE ACEPTACIÓN (27, verificables con un sí/no pulsando)

Cada uno es comprobable abriendo la app en un navegador. El QA (agente 10) los ejecuta clic a clic.

### Navegación y estructura
1. Al abrir la app sin datos, se muestra la pantalla de Inicio (`#/`) con la barra de navegación
   inferior visible y 5 destinos: Escanear, Plantas, Trabajos, Tareas, Más.
2. Al pulsar cada uno de los 5 iconos de la barra inferior, la URL cambia al hash correspondiente
   (`#/escanear`, `#/plantas`, `#/trabajos`, `#/tareas`, `#/mas`) y el icono activo queda resaltado.
3. Al recargar la página estando en cualquier ruta (p. ej. `#/trabajos`), tras recargar se sigue
   mostrando esa misma pantalla (el router lee el hash al cargar).
4. Al navegar a un hash inexistente (`#/loquesea`), se muestra la pantalla de Inicio (fallback),
   sin pantalla en blanco ni error en consola.

### Escanear plantas
5. En `#/escanear` existe un botón "Tomar foto / Elegir imagen" que abre un input de archivo de
   tipo imagen (con `capture` para cámara en móvil).
6. Tras elegir una imagen, se muestra una vista previa de la foto y un botón "Identificar".
7. Al pulsar "Identificar", aparece un estado de "Analizando…" y después un resultado con: nombre
   de la planta candidata, badge de venenosa (Sí/No), y bloques de características, riego, luz y cuidados.
8. El resultado de identificación muestra siempre el aviso "Identificación orientativa, confirma
   siempre las plantas tóxicas" (texto de seguridad obligatorio).
9. En la pantalla de resultado hay un botón "Guardar en Mis plantas"; al pulsarlo, la planta queda
   registrada y aparece un mensaje de confirmación (toast "Guardada en Mis plantas").
10. Si una planta identificada es venenosa, el badge "Tóxica" se muestra en color de alerta
    (distinto del color de planta segura).

### Mis plantas
11. En `#/plantas`, una planta guardada en el criterio 9 aparece listada con su foto (o placeholder),
    nombre y badge de venenosa.
12. Si no hay plantas guardadas, `#/plantas` muestra un estado vacío con un texto guía y un botón
    "Escanear mi primera planta" que lleva a `#/escanear`.
13. Existe un campo de búsqueda en `#/plantas`; al escribir el nombre (o parte) de una planta
    guardada, la lista se filtra y muestra solo las coincidencias.
14. Existe un filtro "Solo tóxicas"; al activarlo, la lista muestra únicamente las plantas marcadas
    como venenosas.
15. Al pulsar una planta de la lista se abre su ficha con foto, nombre, badge, características,
    riego, luz, cuidados y un campo de notas personales editable.
16. En la ficha de una planta, al escribir una nota personal y pulsar "Guardar nota", la nota se
    persiste (al cerrar y reabrir la ficha la nota sigue ahí).
17. En la ficha de una planta hay un botón "Eliminar"; al pulsarlo se pide confirmación y, al
    confirmar, la planta desaparece de la lista de `#/plantas`.

### Trabajos
18. En `#/trabajos` hay un botón "Nuevo trabajo" que abre un formulario con: título/descripción,
    ubicación, fecha y estado (pendiente/en curso/hecho).
19. Al guardar un nuevo trabajo sin título, aparece un aviso de campo obligatorio y NO se crea el
    trabajo; al rellenar el título y guardar, el trabajo aparece en la lista.
20. En la lista de trabajos, cada trabajo muestra su estado con un color/etiqueta; existen filtros
    por estado (Todos / Pendientes / En curso / Hechos) que filtran la lista al pulsarlos.
21. Al abrir un trabajo se ve su detalle con un **checklist**: se pueden añadir ítems, marcarlos como
    completados (tachado) y eliminarlos.
22. En el detalle de un trabajo se pueden añadir **fotos "antes" y "después"** desde input de archivo,
    y quedan guardadas y visibles al reabrir el trabajo.
23. En el detalle de un trabajo, al cambiar el estado (p. ej. de "pendiente" a "hecho"), el cambio se
    refleja en la lista de `#/trabajos` al volver.

### Tareas (materiales + por hacer)
24. En `#/tareas` hay dos secciones: "Materiales a comprar" y "Por hacer". En cada una se puede añadir
    un ítem escribiendo texto y pulsando añadir; el ítem aparece en su lista.
25. Cada ítem de tarea se puede marcar como hecho (queda tachado/atenuado) y eliminar; al recargar la
    página los ítems y su estado persisten.

### Más / Ajustes / Datos
26. En `#/mas` (o `#/mas/ajustes`) existe un botón "Exportar copia de seguridad" que descarga un
    archivo JSON con los datos, un control "Importar copia" que restaura datos desde un JSON, y una
    sección de Estadísticas (`#/mas/stats`) con contadores reales (nº plantas, nº tóxicas, trabajos
    por estado, tareas pendientes).
27. La app es instalable como PWA: incluye `manifest` embebido y metas Apple, el favicon/icono es el
    logo SVG, y existe un botón "Instalar app". Además, si el bloqueo está activado en Ajustes, al ir
    a `#/mas` se pide la `ADMIN_PASSWORD` antes de entrar.

---

## 3. ALCANCE

### ENTRA en v1
- 5 pantallas principales + sub-vistas (resultado de escaneo, ficha de planta, detalle de trabajo,
  ajustes/estadísticas, privacidad, acerca de).
- Identificación de plantas 100% local (clasificador heurístico + base de datos local de 100+ plantas
  españolas comunes). Ver §8 algoritmo.
- Repositorio "Mis plantas" con búsqueda, filtro tóxicas, ficha con notas, eliminar.
- Trabajos con CRUD, estados, checklist, fotos antes/después, notas, filtros.
- Tareas (materiales + por hacer) con marcar hecho y eliminar.
- Backup/restore JSON, estadísticas, ajustes (incl. bloqueo opcional por clave, tema).
- PWA instalable, offline, manifest embebido, iconos SVG.
- Persistencia: localStorage (datos ligeros y ajustes) + IndexedDB (imágenes/dataURL grandes).

### NO ENTRA en v1 (fuera de alcance, el QA lo veta si aparece)
- Clientes, fichas de cliente, agenda de visitas por cliente.
- Cobros, carrito, precios, pagos, Bizum, WhatsApp, contacto comercial.
- Formularios de captación de leads / consentimiento RGPD de terceros.
- Sincronización en la nube, login multiusuario, cuentas, backend, red, CDN.
- IA online o llamadas a APIs externas de reconocimiento.
- Geolocalización automática por GPS (la ubicación de un trabajo se escribe a mano como texto).

---

## 4. MAPA DE PANTALLAS (rutas hash)

Layout global: barra de navegación inferior fija (5 destinos) presente en todas las rutas salvo
en la pantalla de bloqueo. Cabecera superior con título de pantalla + logo SVG.

| Ruta | Pantalla | Acción principal |
|------|----------|------------------|
| `#/` | Inicio / resumen | Atajos a escanear y vista rápida del día |
| `#/escanear` | Escanear planta | Tomar/elegir foto e identificar |
| `#/plantas` | Mis plantas (lista) | Buscar/filtrar/abrir |
| `#/plantas/:id` | Ficha de planta | Notas, eliminar |
| `#/trabajos` | Trabajos (lista) | Nuevo trabajo / filtrar |
| `#/trabajos/nuevo` | Form nuevo trabajo | Guardar |
| `#/trabajos/:id` | Detalle de trabajo | Checklist, fotos, estado, notas |
| `#/tareas` | Tareas (materiales + por hacer) | Añadir/marcar/eliminar |
| `#/mas` | Más (menú) | Acceso a ajustes, backup, stats, ayuda, privacidad, acerca |
| `#/mas/ajustes` | Ajustes | Bloqueo, tema, datos |
| `#/mas/stats` | Estadísticas | Ver contadores |
| `#/mas/privacidad` | Privacidad | Info: todo local |
| `#/mas/acerca` | Acerca de | Versión + firma estudio |
| `#/admin` | Admin (alias de gestión de datos: backup/restore/borrar todo) | Gestión avanzada |

> Nota de implementación: el resultado del escaneo es un **estado dentro de `#/escanear`** (no
> requiere navegación dura), siempre que el botón "Guardar" funcione. Las sub-vistas con `:id` y los
> formularios pueden resolverse como vistas completas o como overlays; lo importante es que el hash
> refleje el estado para que el criterio 3 (recarga) funcione en las rutas listadas.

---

## 5. FLUJOS PASO A PASO

### Flujo A — Escanear e identificar una planta (acción estrella)
1. Usuaria en `#/escanear`. Ve hero con icono hoja, botón grande "Tomar foto / Elegir imagen"
   y texto "Apunta a la hoja o flor con buena luz".
2. Pulsa el botón → se abre el selector de archivo (`accept="image/*"`, `capture="environment"`).
   - Si cancela sin elegir → no pasa nada, sigue en el estado inicial.
3. Elige imagen → se muestra **vista previa** + botón "Identificar" + botón "Cambiar foto".
4. Pulsa "Identificar" → estado "Analizando…" (animación de hoja) durante el cálculo.
5. Aparece **resultado**: nombre candidato (top-1) + lista de hasta 3 candidatos alternativos,
   badge venenosa, características, riego, luz, cuidados, y SIEMPRE el aviso de seguridad (criterio 8).
   - Si el clasificador no supera el umbral de confianza → muestra "No estoy segura" + sugiere
     los 3 candidatos más próximos para que la usuaria elija manualmente cuál guardar.
6. Botones: "Guardar en Mis plantas" (guarda planta con la foto, datos del candidato elegido y fecha),
   "Elegir otro candidato" (cambia el candidato activo), "Repetir" (vuelve al paso 1).
7. Al guardar → toast "Guardada en Mis plantas" + opción "Ver ficha".

### Flujo B — Buscar/gestionar en Mis plantas
1. `#/plantas`: lista de tarjetas (foto, nombre, badge). Si vacío → estado vacío + botón a escanear.
2. Campo búsqueda arriba → filtra por nombre en tiempo real (insensible a mayúsculas/acentos).
3. Toggle "Solo tóxicas" → filtra venenosas. Combina con la búsqueda.
4. Pulsa una tarjeta → `#/plantas/:id` ficha completa.
5. Escribe nota personal → "Guardar nota" persiste.
6. "Eliminar" → diálogo de confirmación → borra (y borra su imagen de IndexedDB) → vuelve a lista.

### Flujo C — Gestionar un trabajo
1. `#/trabajos`: filtros por estado + botón "Nuevo trabajo".
2. "Nuevo trabajo" → `#/trabajos/nuevo`: campos título* (obligatorio), ubicación, fecha, estado.
   - Guardar sin título → error inline "El título es obligatorio", no guarda.
   - Guardar con título → crea trabajo (estado por defecto "pendiente") → vuelve a lista.
3. Abrir trabajo → `#/trabajos/:id` detalle:
   - Editar estado (selector) → al cambiar, persiste y se refleja en lista.
   - Checklist: input "Añadir ítem" + lista con checkbox (tachar) y botón borrar por ítem.
   - Fotos: dos zonas "Antes" y "Después", cada una con input de archivo y miniaturas.
   - Notas: textarea con guardado.
   - Botón "Eliminar trabajo" con confirmación.

### Flujo D — Tareas
1. `#/tareas`: dos bloques. Cada bloque: input + botón "Añadir".
2. Añadir ítem → aparece en su lista con checkbox y papelera.
3. Marcar checkbox → tachado/atenuado, persiste. Papelera → elimina con persistencia.

### Flujo E — Más / Ajustes / Datos / Bloqueo
1. `#/mas`: menú con accesos: Ajustes, Estadísticas, Copia de seguridad, Ayuda, Privacidad, Acerca de.
   - Si `lockEnabled` está activo y la sesión no está desbloqueada → muestra pantalla de bloqueo
     (input clave + "Entrar"). Clave correcta = `ADMIN_PASSWORD` → desbloquea la sesión.
2. Ajustes: toggle "Proteger con contraseña" (activa/desactiva `lockEnabled`), selector de tema
   (claro/oscuro/auto), botón "Borrar todos los datos" (doble confirmación).
3. Copia: "Exportar copia" descarga JSON; "Importar copia" abre input file y restaura (con confirmación).
4. Estadísticas (`#/mas/stats`): tarjetas con contadores derivados de los datos reales.

---

## 6. INVENTARIO DE CONTROLES (por pantalla)

> IDs/clases reales que deben existir en el HTML (los usa el QA y los tests).

### Barra de navegación inferior (global) `#bottomnav`
- `#nav-escanear` (a `#/escanear`), `#nav-plantas` (a `#/plantas`), `#nav-trabajos` (a `#/trabajos`),
  `#nav-tareas` (a `#/tareas`), `#nav-mas` (a `#/mas`). El activo recibe clase `.active`.

### `#/` Inicio — vista `#view-home`
- `#home-scan-cta` (botón grande) → navega a `#/escanear`.
- Tarjetas resumen del día (trabajos pendientes hoy, nº plantas) → enlaces a `#/trabajos` / `#/plantas`.

### `#/escanear` — vista `#view-scan`
- `#scan-file` (input file `accept="image/*" capture="environment"`) — disparado por `#scan-pick-btn`.
- `#scan-pick-btn` (botón "Tomar foto / Elegir imagen") → abre `#scan-file`.
- `#scan-preview` (img) — vista previa tras elegir.
- `#scan-identify-btn` (botón "Identificar") → ejecuta clasificador → muestra `#scan-result`.
- `#scan-change-btn` ("Cambiar foto") → reabre selector.
- `#scan-result` (contenedor de resultado) con: `#scan-name`, `#scan-badge` (`.badge-toxic`/`.badge-safe`),
  `#scan-traits`, `#scan-water`, `#scan-light`, `#scan-care`, `#scan-warning` (aviso seguridad),
  `#scan-candidates` (lista de candidatos), `#scan-save-btn` ("Guardar en Mis plantas"),
  `#scan-repeat-btn` ("Repetir").

### `#/plantas` — vista `#view-plants`
- `#plants-search` (input búsqueda).
- `#plants-toxic-toggle` (checkbox/botón "Solo tóxicas").
- `#plants-list` (contenedor de tarjetas; cada tarjeta `.plant-card[data-id]` → abre `#/plantas/:id`).
- `#plants-empty` (estado vacío) con `#plants-empty-cta` → `#/escanear`.

### `#/plantas/:id` — vista `#view-plant-detail`
- `#plant-detail-photo`, `#plant-detail-name`, `#plant-detail-badge`, `#plant-detail-traits`,
  `#plant-detail-water`, `#plant-detail-light`, `#plant-detail-care`.
- `#plant-notes` (textarea), `#plant-notes-save` ("Guardar nota").
- `#plant-delete` ("Eliminar") → confirm → borra.
- `#plant-back` → volver a `#/plantas`.

### `#/trabajos` — vista `#view-jobs`
- `#jobs-new-btn` ("Nuevo trabajo") → `#/trabajos/nuevo`.
- Filtros: `#jobs-filter-all`, `#jobs-filter-pending`, `#jobs-filter-doing`, `#jobs-filter-done`.
- `#jobs-list` (tarjetas `.job-card[data-id]` con `.job-status`). `#jobs-empty` estado vacío.

### `#/trabajos/nuevo` — vista `#view-job-form`
- Form `#jobForm` con: `#job-title` (obligatorio), `#job-location`, `#job-date` (date),
  `#job-status` (select), `#job-title-err` (mensaje error). Botón submit `#job-save` ("Guardar").
- `#job-cancel` → volver.

### `#/trabajos/:id` — vista `#view-job-detail`
- `#job-d-title`, `#job-d-location`, `#job-d-date`.
- `#job-d-status` (select) → onchange persiste.
- Checklist: `#job-check-input` + `#job-check-add` (botón) → añade a `#job-check-list`
  (cada ítem `.check-item` con checkbox `.check-done` y botón `.check-del`).
- Fotos: `#job-photo-before` (input file) zona `#job-before-list`; `#job-photo-after` (input file)
  zona `#job-after-list`.
- Notas: `#job-d-notes` (textarea) + `#job-d-notes-save`.
- `#job-delete` ("Eliminar trabajo") → confirm.
- `#job-back` → `#/trabajos`.

### `#/tareas` — vista `#view-tasks`
- Materiales: `#mat-input` + `#mat-add` → `#mat-list` (ítems `.task-item` con `.task-done`, `.task-del`).
- Por hacer: `#todo-input` + `#todo-add` → `#todo-list` (mismos controles).

### `#/mas` — vista `#view-more`
- Menú con enlaces: `#more-settings` → `#/mas/ajustes`, `#more-stats` → `#/mas/stats`,
  `#more-help`, `#more-privacy` → `#/mas/privacidad`, `#more-about` → `#/mas/acerca`,
  `#more-install` ("Instalar app").
- Si bloqueo activo: `#lock-screen` con `#lock-pass` (input) + form `#lockForm` + `#lock-enter`.

### `#/mas/ajustes` — vista `#view-settings`
- `#set-lock-toggle` (checkbox bloqueo), `#set-theme` (select claro/oscuro/auto).
- `#set-export` ("Exportar copia") → descarga JSON.
- `#set-import-file` (input file) + `#set-import-btn` ("Importar copia") → restaura con confirm.
- `#set-wipe` ("Borrar todos los datos") → doble confirm.

### `#/mas/stats` — vista `#view-stats`
- `#stat-plants`, `#stat-toxic`, `#stat-jobs-pending`, `#stat-jobs-doing`, `#stat-jobs-done`,
  `#stat-tasks-pending` (contadores derivados).

### `#/admin` — vista `#view-admin`
- Alias práctico de gestión de datos: muestra export/import/wipe (reutiliza controles de ajustes).
  Si bloqueo activo, exige clave igual que `#/mas`.

### Globales
- `#toast` (mensajes), `#confirm-dialog` (diálogo de confirmación reutilizable con `#confirm-ok`/`#confirm-cancel`).

---

## 7. MODELO DE DATOS

### Almacenamiento
- **localStorage** (JSON serializado) para datos ligeros y ajustes.
- **IndexedDB** (object store `images`) para las imágenes en dataURL (fotos de plantas y de trabajos),
  porque pueden superar el límite de localStorage. Cada imagen se referencia por `imageId`.
- **IDs únicos:** `id = Date.now().toString(36) + Math.random().toString(36).slice(2,7)`.

### Claves de localStorage
| Clave | Contenido |
|-------|-----------|
| `cdb.plants` | `Plant[]` |
| `cdb.jobs` | `Job[]` |
| `cdb.tasksMaterials` | `TaskItem[]` |
| `cdb.tasksTodo` | `TaskItem[]` |
| `cdb.settings` | `Settings` |

### IndexedDB
- DB: `cdb-images`, version `CONFIG.DB_VERSION`, store `images` (keyPath `imageId`), value `{ imageId, dataUrl }`.

### Tipos (forma exacta)
```
Plant {
  id: string,
  name: string,            // nombre común elegido
  scientific: string,      // nombre científico (de la BD local)
  toxic: boolean,          // venenosa sí/no
  traits: string,          // características
  water: string,           // riego
  light: string,           // luz
  care: string,            // cuidados
  notes: string,           // nota personal (editable)
  imageId: string|null,    // referencia a IndexedDB (foto del escaneo)
  matchKey: string,        // clave de la planta en la BD local (para re-consulta)
  createdAt: number        // timestamp
}

Job {
  id: string,
  title: string,           // obligatorio
  location: string,        // texto libre (sin GPS)
  date: string,            // 'YYYY-MM-DD' o ''
  status: 'pending'|'doing'|'done',
  checklist: ChecklistItem[],
  notes: string,
  photosBefore: string[],  // array de imageId
  photosAfter: string[],   // array de imageId
  createdAt: number
}

ChecklistItem { id: string, text: string, done: boolean }

TaskItem { id: string, text: string, done: boolean, createdAt: number }

Settings {
  lockEnabled: boolean,    // default CONFIG.LOCK_ENABLED_DEFAULT
  theme: 'light'|'dark'|'auto',  // default 'auto'
  installed: boolean
}
```

### Formato del backup (export/import)
```
{
  app: "botanica-de-carmen",
  version: 1,
  exportedAt: number,
  data: { plants:[...], jobs:[...], tasksMaterials:[...], tasksTodo:[...], settings:{...} },
  images: [ { imageId, dataUrl }, ... ]   // se vuelcan también las imágenes de IndexedDB
}
```
Al importar: validar `app`/`version`, confirmar sobrescritura, restaurar localStorage e IndexedDB.

---

## 8. ALGORITMO DE IDENTIFICACIÓN DE PLANTAS (100% offline)

> El briefing pide TensorFlow.js + base local. **Restricción dura del estudio: sin CDN, sin red,
> un solo HTML.** Cargar un modelo TF.js real (MobileNet, decenas de MB) embebido en un HTML no es
> viable ni rápido (<2s). Por tanto el algoritmo entregable es un **clasificador heurístico de
> características visuales 100% local**, presentado a la usuaria como "identificación inteligente".
> Es honesto: SIEMPRE muestra el aviso de que es orientativa. Esto cumple el espíritu del briefing
> (offline, base de 100+ plantas, resultado con venenosa/riego/luz/cuidados) dentro de las reglas
> del estudio. Ver §10 — esto se anota como decisión de diseño a confirmar.

### 8.1 Base de datos local de plantas (`PLANT_DB`, ≥100 entradas)
Array de objetos embebido en el JS. Cada entrada:
```
{
  key: 'adelfa',
  name: 'Adelfa',
  scientific: 'Nerium oleander',
  toxic: true,
  traits: 'Arbusto perenne de hojas lanceoladas y flores rosas/blancas.',
  water: 'Moderado; resiste sequía una vez establecida.',
  light: 'Pleno sol.',
  care: 'Toda la planta es muy tóxica; usar guantes al podar. No quemar restos.',
  // huella visual para el matcher heurístico:
  features: {
    dominantHue: 'green',        // green|red|purple|yellow|white|mixed
    flowerColor: 'pink',         // none|white|yellow|red|pink|purple|blue|mixed
    leafShape: 'lanceolate',     // round|lanceolate|lobed|needle|heart|compound|grass|succulent
    form: 'shrub',               // tree|shrub|herb|grass|succulent|climber|palm
    brightness: 'medium'         // light|medium|dark
  }
}
```
Debe incluir 100+ plantas comunes en jardinería pública española. Incluir un set claro de TÓXICAS
relevantes para una jardinera municipal (adelfa, hortensia, ricino, tejo, durillo, hiedra, aro,
estramonio, dedalera, glicinia, narciso, dieffenbachia, etc.) y comunes seguras (romero, lavanda,
geranio, rosal, olivo, encina, jara, aligustre, buganvilla, etc.). El agente de datos completa
la lista hasta ≥100 con datos botánicos reales (cero lorem ipsum).

### 8.2 Extracción de características de la foto (canvas, sin librerías)
1. Cargar la imagen en un `<canvas>` reducido (p. ej. 64×64) para rendimiento.
2. Recorrer píxeles y calcular: histograma de tono (HSV) → `dominantHue`; brillo medio → `brightness`;
   proporción de píxeles "verdes" vs "florales" (saturados no verdes) → estima `flowerColor`/`hasFlower`;
   varianza/bordes simple (diferencia entre píxeles vecinos) → pista de `leafShape`/textura.
3. Construir un objeto `observed` con las mismas claves que `features`.

### 8.3 Scoring y candidatos
1. Para cada entrada de `PLANT_DB`, calcular `score` = suma ponderada de coincidencias entre
   `observed` y `entry.features` (p. ej. dominantHue 30%, flowerColor 30%, brightness 15%,
   leafShape 15%, form 10%).
2. Ordenar descendente. Top-1 = candidato principal; mostrar top-3.
3. Umbral de confianza: si `topScore < UMBRAL` → estado "No estoy segura", invitar a elegir
   manualmente entre los 3 candidatos o repetir foto.
4. El resultado SIEMPRE incluye `#scan-warning` (aviso de seguridad), independientemente de la confianza.

> Honestidad obligatoria (la verifica seguridad/QA): el texto nunca afirma certeza médica/botánica;
> usa "podría ser", "candidata más probable", y el aviso de confirmar tóxicas siempre visible.

### 8.4 Hook de pruebas
Exponer `window.__testIdentify(plantKey)` que simule un resultado de identificación con la planta
indicada (rellena `#scan-result` como si el clasificador la hubiera elegido), para que el QA pueda
probar los criterios 7-10 sin tener que inyectar un archivo en el `<input type=file>` headless.

---

## 9. SUPUESTOS
- El dispositivo es personal de Carmen Delia → bloqueo por contraseña desactivado por defecto.
- "Identificación por IA" se entrega como clasificador heurístico local honesto (ver §8) por la
  restricción de un único HTML sin CDN. Cumple offline + base 100+ + datos por planta.
- La ubicación de los trabajos es texto libre (no GPS) por privacidad y por no depender de permisos.
- "Más" agrupa ayuda/ajustes/backup/stats; `#/admin` es un alias de gestión de datos, no un panel
  de negocio (esta app no tiene negocio que gestionar).
- Tema por defecto "auto"; verde botánico vibrante como color de marca (lo concreta el agente de marca).
- Las imágenes se guardan como dataURL en IndexedDB; el backup las incluye para que la copia sea completa.

## 10. DATOS QUE FALTAN (placeholders, a confirmar con Carmen Delia)
1. **Nombre de la app / marca**: no hay. Placeholder `APP_NAME: "Botánica de Carmen"`. Confirmar
   o dejar genérico.
2. **Municipio** donde trabaja: placeholder `MUNICIPALITY: "Tu municipio"`. Útil para encabezados/stats.
3. **¿Quiere bloqueo por contraseña?** Por defecto NO. Si lo quiere, confirmar la clave (placeholder
   `ADMIN_PASSWORD: "jardin2026"`).
4. **Listado real de 100+ plantas**: el agente de datos lo construye con datos botánicos verificados;
   confirmar que cubre las especies que ella maneja en su municipio.
5. **Decisión técnica IA**: confirmar que acepta clasificador heurístico local (orientativo) en lugar
   de TF.js online, dado el requisito de un único HTML offline.
6. **Logo**: no hay; se usa emblema SVG de hoja. Confirmar si tiene logotipo propio.

---

## 11. TESTS DE ACEPTACIÓN EJECUTABLES (a embeber en el HTML)

```html
<script type="application/json" id="acceptance-tests">
[
  { "name": "1-4 Navegacion entre las 5 pantallas y fallback", "steps": [
    { "goto": "#/" },
    { "expectVisible": "#bottomnav" },
    { "click": "#nav-trabajos" }, { "expectHash": "#/trabajos" },
    { "click": "#nav-plantas" }, { "expectHash": "#/plantas" },
    { "click": "#nav-tareas" }, { "expectHash": "#/tareas" },
    { "click": "#nav-mas" }, { "expectHash": "#/mas" },
    { "click": "#nav-escanear" }, { "expectHash": "#/escanear" },
    { "goto": "#/loquesea" }, { "expectVisible": "#view-home" }
  ]},
  { "name": "3 Recarga mantiene la ruta", "steps": [
    { "goto": "#/trabajos" }, { "reload": true }, { "expectVisible": "#view-jobs" }
  ]},
  { "name": "5-6 Escanear muestra picker y guia", "steps": [
    { "goto": "#/escanear" },
    { "expectVisible": "#scan-pick-btn" },
    { "expect": "Apunta" }
  ]},
  { "name": "7-10 Identificacion simulada muestra datos, aviso y badge", "steps": [
    { "goto": "#/escanear" },
    { "eval": "window.__testIdentify('adelfa')" },
    { "expectVisible": "#scan-result" },
    { "expect": "Adelfa" },
    { "expectVisible": "#scan-warning" },
    { "expectVisible": ".badge-toxic" },
    { "expectVisible": "#scan-save-btn" }
  ]},
  { "name": "9-11 Guardar planta aparece en Mis plantas", "steps": [
    { "goto": "#/escanear" },
    { "eval": "window.__testIdentify('adelfa')" },
    { "click": "#scan-save-btn" },
    { "goto": "#/plantas" },
    { "expect": "Adelfa" }
  ]},
  { "name": "12 Estado vacio de Mis plantas guia a escanear", "steps": [
    { "eval": "localStorage.removeItem('cdb.plants')" },
    { "goto": "#/plantas" },
    { "reload": true },
    { "expectVisible": "#plants-empty" },
    { "click": "#plants-empty-cta" },
    { "expectHash": "#/escanear" }
  ]},
  { "name": "13-14 Busqueda y filtro toxicas en Mis plantas", "steps": [
    { "goto": "#/escanear" }, { "eval": "window.__testIdentify('adelfa')" }, { "click": "#scan-save-btn" },
    { "goto": "#/escanear" }, { "eval": "window.__testIdentify('romero')" }, { "click": "#scan-save-btn" },
    { "goto": "#/plantas" },
    { "fill": { "sel": "#plants-search", "value": "adel" } },
    { "expect": "Adelfa" },
    { "expectGone": "Romero" },
    { "fill": { "sel": "#plants-search", "value": "" } },
    { "check": "#plants-toxic-toggle" },
    { "expect": "Adelfa" },
    { "expectGone": "Romero" }
  ]},
  { "name": "16 Nota de planta persiste", "steps": [
    { "goto": "#/plantas" },
    { "clickText": "Adelfa" },
    { "fill": { "sel": "#plant-notes", "value": "Vista en parque norte" } },
    { "click": "#plant-notes-save" },
    { "reload": true },
    { "expect": "Vista en parque norte" }
  ]},
  { "name": "17 Eliminar planta la quita de la lista", "steps": [
    { "goto": "#/plantas" },
    { "clickText": "Romero" },
    { "click": "#plant-delete" },
    { "click": "#confirm-ok" },
    { "expectHash": "#/plantas" },
    { "expectGone": "Romero" }
  ]},
  { "name": "18-19 Nuevo trabajo valida titulo obligatorio", "steps": [
    { "goto": "#/trabajos" },
    { "click": "#jobs-new-btn" },
    { "expectHash": "#/trabajos/nuevo" },
    { "submit": "#jobForm" },
    { "expect": "obligatorio" },
    { "fill": { "sel": "#job-title", "value": "Poda parque central" } },
    { "submit": "#jobForm" },
    { "expectHash": "#/trabajos" },
    { "expect": "Poda parque central" }
  ]},
  { "name": "20-23 Filtros y detalle de trabajo con checklist y estado", "steps": [
    { "goto": "#/trabajos" },
    { "click": "#jobs-filter-pending" },
    { "expect": "Poda parque central" },
    { "clickText": "Poda parque central" },
    { "expectVisible": "#job-d-status" },
    { "fill": { "sel": "#job-check-input", "value": "Recoger restos" } },
    { "click": "#job-check-add" },
    { "expect": "Recoger restos" }
  ]},
  { "name": "24-25 Tareas anade material y persiste", "steps": [
    { "goto": "#/tareas" },
    { "fill": { "sel": "#mat-input", "value": "Tijeras de podar" } },
    { "click": "#mat-add" },
    { "expect": "Tijeras de podar" },
    { "reload": true },
    { "expect": "Tijeras de podar" }
  ]},
  { "name": "26 Estadisticas muestra contadores reales", "steps": [
    { "goto": "#/mas" },
    { "expectVisible": "#more-stats" },
    { "click": "#more-stats" },
    { "expectVisible": "#stat-plants" },
    { "expectVisible": "#stat-toxic" }
  ]},
  { "name": "27 Bloqueo opcional pide clave cuando se activa", "steps": [
    { "goto": "#/mas/ajustes" },
    { "check": "#set-lock-toggle" },
    { "goto": "#/mas" },
    { "expectVisible": "#lock-pass" },
    { "fill": { "sel": "#lock-pass", "value": "jardin2026" } },
    { "submit": "#lockForm" },
    { "expectVisible": "#view-more" }
  ]}
]
</script>
```

> Nota para el constructor: varios tests usan `window.__testIdentify(plantKey)` (hook §8.4) porque
> inyectar un archivo en `<input type=file>` desde el verificador headless es frágil. El hook DEBE
> existir para que el QA pueda probar los criterios 7-11, 13-14 sin foto real. Si el verificador del
> estudio no soporta el paso `eval`, sustituirlo por un botón oculto de demo equivalente; mantener el
> resto de tests intacto.
