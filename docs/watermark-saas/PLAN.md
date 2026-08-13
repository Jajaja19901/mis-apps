# PLAN — Gestor de Marcas de Agua IA (app de un archivo)

Guion del constructor y del verificador. La app es `apps/gestor-marcas-agua-ia.html` (un solo archivo,
autocontenido, mobile-first, modo oscuro premium). Procesa **de verdad en el navegador** lo que es posible
y **simula + avisa** lo que exige backend/GPU (ver `ARQUITECTURA.md`).

## Alcance v1
DENTRO: detección de procedencia/metadatos "escritos en el código" (real), detección visual heurística de
marca de agua (real, con confirmación), limpieza de metadatos (real), inpainting aproximado (real: difusión,
clon, difuminado), sustitución/añadido de marca (real), visor antes/después (slider+zoom+pan, real), créditos
simulados (Stripe-ready), dashboard, historial, ajustes, API docs, legal, panel admin, registro de acciones,
consentimiento de derechos, límites de uso, PWA. FUERA (simulado + aviso): modelos IA de estudio, coherencia
temporal real de vídeo, cobros reales, cuentas multiusuario en servidor.

## Mapa de pantallas (router hash)
- `#/` **Dashboard**: créditos, archivos recientes, procesos, historial breve, estadísticas.
- `#/editor` **Editor**: subir / usar ejemplo → analizar → previsualizar zonas → elegir método → procesar → antes/después → exportar.
- `#/historial` **Historial**: trabajos (fecha, resolución, método, resultado).
- `#/precios` **Créditos**: gratis, planes, comprar (simulado, Stripe-ready).
- `#/ajustes` **Configuración**: cuenta, privacidad, almacenamiento, API, facturación, tema.
- `#/api` **API**: endpoints conceptuales + clave demo.
- `#/legal` **Legal**: términos, política de contenido, privacidad + aviso legal.
- `#/admin` **Panel del dueño** (contraseña): jobs, registro de acciones, límites/abuso, motores, purga.

## Regla de oro de interacción (para pasar el verificador)
Cada handler es **defensivo**: si se pulsa sin imagen/estado válido, avisa con toast y no lanza errores.
El verificador navega todas las rutas y pulsa todos los botones; **cero errores de consola**.

## Consentimiento y uso responsable
Antes de eliminar/modificar cualquier marca: checkbox obligatorio `#rights-ack`
("Confirmo que soy titular o tengo autorización"). Sin marcarlo → aviso y NO procesa. Cada proceso
queda en el **registro de acciones** (`wm_log_v1`), visible en el panel admin.

## Modelo de datos (localStorage)
- `wm_files_v1`: `[{ id, name, kind, mime, w, h, bytes, thumb, provenance, createdAt }]`
- `wm_jobs_v1`: `[{ id, fileId, name, method, status, credits, quality, createdAt, thumbAfter }]`
- `wm_credits_v1`: `{ balance, plan, ledger:[{ delta, reason, ts }] }`  (arranque: balance 30, plan "Free")
- `wm_log_v1`: `[{ ts, action, detail, rightsAck }]`  (append-only, uso responsable)
- `wm_settings_v1`: `{ theme, autoDelete, ttlDays, keepMetadata, apiKey }`
- `wm_admin_session`: `"1"` en sessionStorage cuando el dueño entra.
IDs: `Date.now().toString(36)+random`. Miniaturas: canvas reescalado a ~320px (dataURL) para no reventar la cuota.

## Criterios de aceptación (verificables pulsando)
1. Dashboard carga y muestra el saldo de créditos.
2. En el editor, "Usar imagen de ejemplo" carga una imagen y lanza el análisis.
3. El análisis muestra la **procedencia/metadatos** detectados "en el código" (firmas IA, C2PA, chunks).
4. El análisis muestra **zonas visuales** candidatas de marca de agua (previsualización antes de tocar nada).
5. Sin marcar el consentimiento, "Procesar" avisa y **no** procesa.
6. Con consentimiento, "Procesar" (inpaint) descuenta créditos y muestra el visor **antes/después**.
7. "Limpiar metadatos" produce una versión **sin metadatos** y lo confirma al re-escanear.
8. Añadir/sustituir marca propia (texto/logo) se refleja en el resultado.
9. El visor antes/después permite **zoom** y muestra resolución/tamaño/formato.
10. Exportar/descargar el resultado funciona (cambia el estado/avisa).
11. El trabajo aparece en el **Historial**.
12. En Créditos, "comprar" añade créditos (pago **simulado**, avisado).
13. El panel admin exige contraseña y, dentro, muestra el **registro de acciones** y los límites.
14. Existen Términos, Política de contenido y Privacidad en `#/legal`.
15. Modo oscuro premium por defecto; alternar tema funciona; PWA instalable.

## Tests de aceptación (DSL embebido `#acceptance-tests`)
Se ejecutan con localStorage limpio y recarga por test. Usan el botón de imagen de ejemplo (el DSL no sube ficheros).
1. Dashboard → `#/`, expect "Créditos".
2. Editor ejemplo + análisis → `#/editor`, clickText "Usar imagen de ejemplo", expect "Procedencia".
3. Zonas visuales → tras ejemplo, expect "Zonas".
4. Consentimiento obligatorio → tras ejemplo, clickText "Procesar", expect "Confirma"; check `#rights-ack`; clickText "Procesar"; expect "Después".
5. Limpiar metadatos → tras ejemplo + consentimiento, clickText "Limpiar metadatos", expect "limpi".
6. Añadir marca → tras ejemplo, ir a pestaña marca, fill texto, clickText "Aplicar marca", expect "Después".
7. Historial guarda → procesar, `#/historial`, expect nombre del ejemplo.
8. Créditos simulados → `#/precios`, clickText "Añadir", expect "simulad".
9. Admin → `#/admin`, fill pass, submit, expect "Registro de acciones".
10. Legal → `#/legal`, expect "Política de contenido".

## Firma y datos que faltan
- Pie con firma del estudio (CONFIG.STUDIO_*). PWA (manifest embebido + service worker inline opcional).
- DATOS QUE FALTAN (placeholders, avisar al final): nombre comercial/marca del producto, logo real,
  titular legal (para privacidad/aviso legal), dominios, precios reales de los planes, proveedor de pago.
