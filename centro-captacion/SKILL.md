# SKILL.md — Worker del Centro de Captación (`worker-captador.js`)

Guía de comportamiento del Cloudflare Worker que enriquece los datos de los bares. La lee el
agente `captacion-backend-worker` **antes de tocar nada**. El **código fuente NO está en el repo**
(vive en la cuenta Cloudflare `matasano901`); esto documenta QUÉ hace, para editarlo con criterio
cuando Jaime pegue el código.

**URL activa:** `https://polished-union-3d80.matasano901.workers.dev`
(la app la lee de ⚙️ Ajustes → `cfWorker`; el defecto del código v70, `orange-math-f552`, está viejo).

## Qué es
Un servidor pequeño en Cloudflare que la app llama por URL. Hace **dos cosas**:

### 1) `/?url=...` — puente CORS
La app le pasa una URL y el worker la **descarga y devuelve el HTML**. Sirve para leer webs de
bares desde la app sin que el navegador las bloquee.

### 2) `/find?q=nombre+ciudad` — enriquecedor
Le pasas **nombre del bar + ciudad** y devuelve un **JSON** con:
`email, tel, whatsapp, instagram, facebook, web, soloFacebook, _textoLeido`.

**Cómo lo hace por dentro:**
- a) Busca en Google con **Serper** (API de pago, 2.500 búsquedas gratis). Saca: ficha oficial
  (`knowledgeGraph`), 10 resultados orgánicos y lugares (`places`).
- b) Identifica la **web propia** del bar (primera URL que NO sea de directorio).
- c) Entra en esa web y, si existe, en **`/contacto`**. Lee hasta **20.000 caracteres** por página.
  Si la web no se deja leer en plano, prueba con **Jina** (`r.jina.ai`), que renderiza JS.
- d) Extrae con **regex**:
  - **Email** (filtra agencias, plataformas, ayuntamientos, directorios, no-reply…).
  - **Teléfono** SOLO si está en la web propia del bar, o es el oficial de Google, o aparece
    pegado al nombre del bar — **nunca un número suelto**.
  - **Instagram / Facebook** (prefiere URLs que contengan palabras del nombre del bar).
- e) Si no encontró email, hace una **búsqueda EXTRA** en Google: `email @dominio_del_bar` y extrae de ahí.

## 🛡️ Filtros que descartan datos malos (NO aflojar sin pensar)
- **Lista negra de emails:** agencias (`gacmark`), plataformas (opentable, wanderlog, thefork,
  tripadvisor, maptons, ayuntamientos, `.gob`…), genéricos (noreply, notifications, `trip+…`),
  agencias de marketing/diseño/SEO.
- **Lista negra de webs:** facebook, instagram, tripadvisor, plataformas de reservas, directorios
  (carta.menu, mymenuweb, sluurpy, wanderlog, maptons, gastroranking, arucasmola, canarias7…).
- **Anti-ID-falso:** si un "teléfono" candidato es subcadena de un ID largo (≥10 dígitos) presente
  en URLs de Facebook/Wanderlog, lo descarta.
- **Móvil válido:** solo **6XX** o **7[1-9]XX** cuenta como WhatsApp.

## 🔑 Variables en Cloudflare (Settings → Variables, como Secret)
- `SERPER_KEY` — **obligatoria**.
- `JINA_KEY` — opcional (mejora la lectura de webs con JS).
> NUNCA van en el repo ni en el código. Si ves una clave escrita en el código, muévela a Secret.

## ⚠️ Límites reales (lo que el worker NO arregla)
- Bares dentro de **centros comerciales** → mezcla datos de bares vecinos.
- Bares **sin web propia** → coge datos del directorio que aparezca.
- Emails que solo están en **Instagram/Facebook** (login obligatorio) → no se leen.
- **Plataformas de reservas** que muestran sus datos como si fueran del bar.

## 🎯 Nivel de aciertos real
- Bar con web propia: **80-90%** bien.
- Bar sin web pero con ficha Google fuerte: **50-60%**.
- Bar solo en redes o en centro comercial: **<30%**.

## 📐 Reglas para tocar el worker (agente Backend)
1. **Necesitas el código fuente** `worker-captador.js` para editarlo. Si no está en el repo, pídeselo a Jaime.
2. **No aflojes los filtros a lo loco** (regla del equilibrio): apretar de más pierde datos buenos;
   aflojar de más cuela datos de otro negocio (lección Marhaba / `esDeLaZona` del CLAUDE.md).
3. **Secrets fuera del repo.** `SERPER_KEY` / `JINA_KEY` solo en Cloudflare.
4. **El asistente NO despliega en tu Cloudflare.** Flujo: Jaime pega el worker → Backend edita →
   **Jaime redespliega** con `wrangler` o desde el panel. El Backend deja el código y el comando listos.
5. **No cambies la forma del JSON** (`email, tel, whatsapp, instagram, facebook, web, soloFacebook,
   _textoLeido`) sin avisar: la app (`datosPatch`) cuenta con esos campos.

## ❓ A aclarar (no inventar)
El brief del agente Backend menciona una cadena `enriquecerCompleto(lead)` con **Places → Jina →
CSE → Gemini**. Lo que este worker hace de verdad (según Jaime) es **Serper + Jina + regex**
(+ búsqueda extra de email). Places/CSE/Gemini los usa la **app** por su lado (`gemBuscaLead`,
`googleCSE`). Antes de "arreglar `enriquecerCompleto`", confirmar con Jaime dónde vive esa cadena.
