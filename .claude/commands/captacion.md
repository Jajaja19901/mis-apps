---
description: Mantiene/mejora el Centro de Captación (CRM de bares de Canarias) lanzando los 6 agentes captacion-* en orden, con confirmación obligatoria antes de sobrescribir datos. Planifica y confirma, NO dispara y olvida.
---

Vas a resolver una petición sobre el **Centro de Captación** (un CRM en un solo HTML para
captar bares de Canarias y venderles la app de pedidos por QR "Camarero Digital"),
orquestando los 6 agentes de `.claude/agents/captacion-*`.

**Modo obligatorio: PLANIFICA Y CONFIRMA, nunca dispares y olvides.** Esta app entera es una
defensa contra UN desastre: que un dato de OTRO negocio (o inventado) pise a uno bueno
(casos reales: "Marhaba" mismo nombre/otra calle, el homónimo turco→tienda de aromas, y el
filtro `esDeLaZona` que de tan estricto tiraba datos buenos en v70). La velocidad es el
enemigo: ve despacio y para en los candados.

## Petición de Jaime
$ARGUMENTS

## Contexto fijo del proyecto
- App: `centrocaptacion-XX.html` (XX = versión; ronda v71). Un HTML autocontenido, CSS+JS
  inline, datos en `localStorage`. Si no lo tienes delante, pídelo y para.
- Corre en Android desde un explorador de archivos → origen `content://com.rs.explore`
  (origen `null`, NO https). Por eso `prompt()` nativo y el portapapeles fallan: usa SIEMPRE
  cuadros propios + `execCommand`, nunca `prompt()` ni `navigator.clipboard` a secas.
- Worker: `worker-captador.js` (cuenta Cloudflare `matasano901`, NO está en este repo).
  Worker activo `https://polished-union-3d80.matasano901.workers.dev` (`/find` enriquecedor, `/?url=` CORS; la app lee la URL de ⚙️ Ajustes → `cfWorker`). No toques la llamada
  `buscarDatosWeb` sin que te lo pidan. Si la tarea es del worker y el archivo no está, pídelo.

## Cómo lo resuelves (en orden)
1. **Comprueba los archivos** que necesita la petición (la app y/o el worker). Si faltan, pídelos y para.
2. **Lanza `captacion-arquitecto`** → te devuelve el plan en bullets (tarea · agente · cómo se
   comprueba). **Enséñale el plan a Jaime y espera su OK** antes de editar nada (candado 1).
3. **Ejecuta el plan** con `captacion-backend-worker` (worker/APIs) y/o `captacion-frontend-app`
   (el HTML), con mínimo impacto.
4. **Lanza `captacion-qa`** → verifica sintaxis JS, que no rompe al cargar, que los selectores
   siguen y que la URL del worker está bien. Si sale ❌, vuelve al paso 3.
5. **Lanza `captacion-documentador`** si hubo un error o una corrección que recordar → apunta la
   lección en el CLAUDE.md del Centro de Captación con `[YYYY-MM-DD] Contexto → Regla`.
6. **Entrega**: resumen de qué cambió, número de versión nuevo (v72, v73…) visible junto al
   título, y qué probar a mano. Commit + push a la rama de trabajo.

> El `captacion-investigador` no va en la cadena: lánzalo aparte cuando haga falta verificar un
> dato del mundo real (¿el tel X es del bar Y?) y te devuelva fuentes.

## Los 5 candados (lo más importante — aquí pasó TODO lo malo)
1. **Checkpoint humano antes de editar.** Siempre enseña el plan del Arquitecto y espera el OK de Jaime.
2. **Doble confirmación si la tarea toca la lógica de datos o el camino de sobrescribir.** Si toca
   `esDeLaZona`, `datosCoinciden`, `mismaCalle`, `digTrozoRed`, `igCoherente`, `extraeContacto`, el
   flujo de Reajustar/Buscar o cualquier `upLead` que pise un campo existente → NO se toca sin que
   Jaime diga "sí" otra vez.
3. **Regla del equilibrio (la lección doble).** Al APRETAR un filtro, comprueba que no tira datos
   BUENOS (lección `esDeLaZona` v70). Al AFLOJARLO, comprueba que no cuela datos de OTRO negocio
   (lección Marhaba). Prueba los dos lados antes de dar por bueno el cambio.
4. **Puerta de QA antes de "hecho".** Nada es "hecho" sin que `captacion-qa` pase en verde + versión
   subida + (si hubo lección) entrada del Documentador.
5. **Mínimo impacto absoluto.** Solo se toca lo pedido. JAMÁS se "mejoran de paso" los blindajes ni
   se borran funciones que no entran en la petición.

## Reglas de oro (las exiges a los 6 agentes)
- **NO inventar datos de bares.** Si no se encuentra algo seguro, el campo se queda vacío.
- **NO coger datos de otro negocio**: mismo bar = mismo nombre + misma calle + Canarias.
- Teléfono fijo separado del móvil (el móvil es el de WhatsApp). Instagram solo si el @usuario pega
  con el nombre del bar.
- Plan first (3+ pasos) · mínimo impacto · verificar antes de "hecho" · honestidad (un límite real se
  dice una vez, claro, con la alternativa) · español simple y directo, sin humo.

## Honestidad (no esperes magia de esta skill)
Esta skill empaqueta el FLUJO seguro y te ahorra escribir 6 mensajes; **no mejora la puntería de los
datos** (eso es el Worker + los blindajes). Es mejora de proceso, no de precisión. Si algo no se puede
sin backend o sin una clave, dilo una vez con la alternativa.
