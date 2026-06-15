# Resumen para continuar — Centro de Captación

Pega esto al empezar una conversación nueva, y adjunta los 2 archivos (la app y la lista).

## Qué es
- **App:** `tools/centro-captacion.html` — un único HTML autocontenido (CSS+JS inline, datos en `localStorage`). Es un CRM para captar bares/restaurantes de Canarias y venderles una app de pedidos por QR ("Camarero Digital").
- **Dónde corre:** en un móvil Android, abierto desde un explorador de archivos → la URL es `content://com.rs.explore` (origen `null`, NO es https). Eso hace que: el `prompt()` nativo y leer/escribir el portapapeles fallen → se usan cuadros propios y `execCommand` para copiar.
- **Versión actual: v71** (sale escrita arriba, al lado del título). Rama de trabajo en git: `claude/gifted-pascal-52o0M`. SOLO se hace push a esa rama.

## Datos / piezas montadas
- **Cloudflare Worker (puente que saca datos):** `https://broad-wind-18ea.matasano901.workers.dev/find` — lo usa la función `buscarDatosWeb`. NO tocar esa llamada. (El código del worker NO está en el repo; vive en la cuenta Cloudflare `matasano901`.)
- **Claves (las pega el dueño en ⚙️ Ajustes, NO van en el repo):**
  - Clave Google Places (`AIza...`) → para la pestaña 🔎 Buscar y "Rellenar con Google".
  - Clave Gemini (`AQ...`) → para el botón 🤖 Gemini. Modelo: `gemini-2.5-flash`.
  - (Opcional) ID del Buscador Google CSE — sin montar; con el Worker no es urgente.
- **Lista de bares:** `captacion-CANARIAS-sin-repetidos.csv` → **1.642 bares** de Gran Canaria, ya SIN duplicados y con Arucas corregido.

## Cómo buscar datos de un bar (orden recomendado)
1. **🔄 Reajustar** — el principal. Usa el Worker (+ Gemini), y comprueba que el dato sea del MISMO negocio (nombre y calle) y de Canarias antes de sobrescribir.
2. **🤖 Gemini** — busca con IA.
3. **🔮 IA Google** — abre Google a mano para que copies tú.
4. **📋 Pegar dato** — pegas UN dato (email/teléfono/Instagram) en el cuadro y lo coloca solo en su campo.
5. **📄 Copiar datos** — copia los datos del bar para pegarlos donde quieras.

## Blindajes (reglas de oro: NO inventar, NO coger datos de otro negocio)
- `esDeLaZona`: rechaza datos solo si el texto apunta CLARAMENTE a otra provincia (Málaga, Gaucín…). Si no hay señal de otra zona, los acepta (antes era demasiado estricto y tiraba datos buenos — arreglado en v70).
- `datosCoinciden` + `mismaCalle`: al Reajustar, no sobrescribe si la web/redes o la calle son de otro negocio (caso Marhaba).
- `digTrozoRed`: descarta teléfonos falsos sacados de un ID de Facebook.
- Teléfono **fijo** separado del **móvil** (el móvil es el que sirve para WhatsApp).
- Instagram solo si el @usuario pega con el nombre del bar.

## Estado actual
- ✅ App estable (v71), probada en navegador sin errores. Búsqueda con el Worker funcionando ("hizo pleno").
- ✅ Importar CSV sin duplicar (cruza por móvil + confirma mismo negocio). Filtro de bares cerrados. Botones de borrar (🗑️ Email/Tel/IG). Copiar/Pegar que funcionan en content://.
- ⏳ Pendiente opcional: montar el CSE de Google (no urgente con el Worker).

## Reglas para el asistente
- Verificar sintaxis del HTML tras cada cambio. Hacer commit + push a `claude/gifted-pascal-52o0M`.
- No inventar datos de bares; si no se encuentra algo seguro, dejarlo vacío.
- Cambios con impacto mínimo. Subir el número de versión (v72, v73…) cuando se entregue.
