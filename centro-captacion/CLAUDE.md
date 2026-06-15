# CLAUDE.md — Centro de Captación (CRM de bares de Canarias)

Memoria viva del proyecto **Centro de Captación**: un CRM en un solo HTML para captar
bares/restaurantes de Canarias y venderles la app de pedidos por QR ("Camarero Digital").
Aquí queda escrito todo lo que se aprendió, para no repetir errores. **Este archivo NO es
el de la fábrica de apps** (ese es el `CLAUDE.md` de la raíz del repo).

> Lo mantiene el agente `captacion-documentador`. Formato de cada lección:
> `[YYYY-MM-DD] Contexto → Regla`. No se borran entradas viejas; solo se añaden o se afinan.

---

## Qué es y dónde corre
- **App:** `centrocaptacion-XX.html` (XX = nº de versión; actual ~v71). Un único HTML
  autocontenido (CSS+JS inline, datos en `localStorage`). Al entregar, **sube la versión**
  (v72, v73…) y actualízala en el texto visible junto al título.
- **Entorno real:** móvil Android, abierto desde un explorador de archivos → URL
  `content://com.rs.explore` (origen `null`, **NO https**). Por eso el `prompt()` nativo y
  leer/escribir el portapapeles del sistema **fallan**.

## Piezas montadas (claves y worker NO van en el repo)
- **Cloudflare Worker** (`worker-captador.js`, cuenta `matasano901`, fuera del repo): saca los
  datos de cada bar. **URL activa: `https://polished-union-3d80.matasano901.workers.dev`** — la
  app la lee de ⚙️ Ajustes (`cfWorker`), no la hardcodea (el defecto del código v70,
  `orange-math-f552`, está viejo). Endpoints: `/find?q=nombre+ciudad` (enriquecedor) y `/?url=...`
  (puente CORS). Lo usa `buscarDatosWeb`. **No tocar esa llamada sin pedirlo.** Detalle completo
  del worker (filtros, variables, límites, % de aciertos): **`centro-captacion/SKILL.md`**.
- **Claves** (las pega el dueño en ⚙️ Ajustes, **nunca** en el repo):
  - Google Places (`AIza…`) → pestaña 🔎 Buscar y "Rellenar con Google".
  - Gemini (`AQ…`) → botón 🤖 Gemini. Modelo: `gemini-2.5-flash`.
  - (Opcional) ID del Buscador Google CSE → sin montar; con el Worker no es urgente.
- **Lista de bares:** `captacion-CANARIAS-sin-repetidos.csv` (1.642 bares de Gran Canaria,
  sin duplicados). Se importa a `localStorage`; no necesita vivir en el repo.

## 🔒 Reglas de oro (la razón de ser de todo el proyecto)
1. **NO inventar datos de bares.** Si no se encuentra algo seguro, el campo se queda **vacío**.
2. **NO coger datos de otro negocio.** Mismo bar = mismo **nombre** + misma **calle** + **Canarias**.
3. Teléfono **fijo separado** del **móvil** (el móvil 6/7 es el de WhatsApp).
4. Instagram **solo** si el @usuario pega con el nombre del bar.

## 🛡️ Blindajes (funciones que NO se tocan "de paso")
- `esDeLaZona(txt,ciudad)` — acepta salvo señal POSITIVA de otra provincia/isla (Málaga, Gaucín…).
- `datosCoinciden(d,nombre,ciudad)` — la web/redes deben compartir alguna palabra con el nombre.
- `mismaCalle(dirA,dirB)` — la calle hallada debe compartir palabra con la del lead.
- `digTrozoRed(dig,texto)` — descarta teléfonos sacados de un ID de Facebook.
- `igCoherente(handle,nombre)` — el @ de Instagram debe pegar con el nombre del bar.
- `extraeContacto(...)` — arma el patch respetando todo lo anterior.

## 🧠 Lecciones aprendidas
> Lote inicial sembrado el 2026-06-15 a partir del historial del proyecto (v70/v71).

- `[2026-06-15] "Marhaba": mismo nombre pero otra calle = otro local → Al Reajustar, NO sobrescribir si mismaCalle() falla; avisar "revisar a mano".`
- `[2026-06-15] Homónimo (el turco/restaurante → la tienda de aromas): la web/redes traían otro nombre → NO sobrescribir si datosCoinciden() falla.`
- `[2026-06-15] esDeLaZona exigía mención de "Canarias" y tiraba datos BUENOS (un bar casi nunca escribe la isla en su web), arreglado en v70 → Solo rechazar con señal POSITIVA de otra provincia/isla; sin señal, aceptar. Apretar de más pierde leads buenos.`
- `[2026-06-15] Aparecían teléfonos falsos sacados de un ID/número de Facebook → digTrozoRed() descarta el dígito si proviene de un trozo de red.`
- `[2026-06-15] El fijo se mezclaba con el móvil → Campos separados: el móvil (6/7) va a WhatsApp; el fijo va a su propio campo.`
- `[2026-06-15] Se colaba el Instagram de un cliente/crítico en vez del bar → Aceptar el @usuario solo si igCoherente() con el nombre; nunca rebuscar IG en texto libre.`
- `[2026-06-15] En content://com.rs.explore (origen null) prompt() y el portapapeles del sistema fallan → Usar cuadros de diálogo propios + execCommand('copy'); nunca prompt() ni navigator.clipboard a secas.`
- `[2026-06-15] Importar el CSV duplicaba bares → Cruzar por móvil + confirmar mismo negocio antes de añadir.`
- `[2026-06-15] La llamada buscarDatosWeb al Worker es lo que ya funciona → No tocarla sin que el prompt lo pida.`
- `[2026-06-15] La URL del worker cambió varias veces (broad-wind → orange-math → polished-union) → La URL viva NO se hardcodea: vive en ⚙️ Ajustes (cfWorker). Worker activo hoy: https://polished-union-3d80.matasano901.workers.dev. Verificar que el defecto del código no apunte a un worker muerto.`

## 👷 Equipo de agentes y skill
- Agentes en `.claude/agents/captacion-*`: **arquitecto** (planifica), **backend-worker**,
  **frontend-app**, **qa** (verifica), **documentador** (este archivo), **investigador**.
- Skill `/captacion` (`.claude/commands/captacion.md`): orquesta los 6 en modo
  **planifica-y-confirma** con 5 candados. Nada es "hecho" sin QA en verde + versión subida.
