# Problemas SIN resolver — Centro de Captación

Documento para pasar a otra IA / desarrollador. Estado honesto del proyecto.

## Qué es la herramienta
- Archivo único: `tools/centro-captacion.html` (HTML autocontenido, CSS+JS inline, datos en `localStorage`).
- Corre en un móvil Android, abierto desde un explorador de archivos: la URL es `content://com.rs.explore` (origen `null`, NO es `https://`).
- Sirve para gestionar ~1.700 leads de hostelería de Canarias (bares/restaurantes) y encontrarles **email, teléfono móvil (WhatsApp) e Instagram** para venderles una app de "Camarero Digital".

## EL OBJETIVO que NO se ha cumplido
Conseguir, **de forma automática y fiable**, el email / móvil / Instagram de cientos o miles de bares, **sin contactar al negocio equivocado** y **sin inventar datos**. Eso sigue sin estar resuelto de raíz.

## Problemas SIN resolver (con la causa real, no excusas)

1. **Enriquecer en masa ~1.700 leads no es posible en planes gratuitos.**
   - Gemini API gratis: frena por minuto (rate limit) y tiene cupo diario pequeño.
   - Google Custom Search API: 100 consultas/día.
   - Apify (Google Maps + enrichment): crédito gratis limitado (~$5).
   - **No hay vía gratis para sacar email/teléfono de miles de golpe.** Hace falta DECIDIR: pagar una API de SERP/enriquecimiento, o montar un backend.

2. **Mucho contacto bueno SOLO está dentro de Facebook/Instagram, y no es accesible por código.**
   - Ejemplo real: el email de "Restaurante Platero y Tú" (`restauranteplateroytu@hotmail.com`) solo se ve ABRIENDO su página de Facebook. NO aparece en Google ni en ninguna API.
   - Facebook/Instagram requieren login y bloquean el scraping. Desde el navegador del móvil (`content://`, origen null) tampoco se pueden leer por CORS.
   - Hoy esto solo se resuelve A MANO (abrir el Facebook y copiar).

3. **La API de Gemini encuentra MENOS que el buscador de Google a mano.**
   - El recuadro "AI Overview" de Google (que sí muestra email/móvil/Instagram al buscar a mano) lo genera JavaScript y NO viaja en el HTML; no se puede leer por código.
   - La API de Gemini (con google_search grounding) es más conservadora y deja muchos campos vacíos aunque el dato exista.

4. **La vía automática más fiable (Google Custom Search / CSE) quedó SIN montar.**
   - Requiere: crear un "Programmable Search Engine" (sacar el ID `cx`), activar "Custom Search API" en Google Cloud, y pegar el ID en Ajustes de la app.
   - La app ya tiene el código para usarlo (`googleCSE`, `googleBuscaLead`) pero el usuario no completó el alta. Aun montado, tope 100/día.

5. **Apify "Company contacts enrichment" nunca devolvió emails.**
   - Probablemente el toggle de enrichment no quedó activo al lanzar, y/o se exportó la vista "Overview" (que excluye las columnas de email/redes) en vez de "All fields".
   - Sin verificar del todo.

6. **El entorno `content://com.rs.explore` (webview de explorador, origen null) rompe funciones del navegador.**
   - `prompt()` nativo no funciona (se sustituyó por un modal propio).
   - Lectura de portapapeles (`navigator.clipboard`) puede estar bloqueada.
   - `fetch` a webs externas falla por CORS → se parchea con un Cloudflare Worker propio (puente), pero añade fragilidad.

7. **Rendimiento en móvil con ~1.700 fichas.**
   - Pintar la lista entera, importar CSV y las operaciones masivas estresan el navegador (se ha llegado a colgar). Se mitigó con paginación, importación por lotes y topes, pero el volumen sigue siendo un riesgo en un móvil.

## Lo que SÍ funciona hoy
- CRM/pipeline con estados, filtro por isla y ciudad, paginación, búsqueda en vivo.
- Importar CSV por lotes (rápido).
- Recuperar a WhatsApp los móviles que ya estén escritos en las notas (gratis, instantáneo).
- Marcar "contactado" manual (pulsar WhatsApp/email NO lo marca solo).
- Generar demo de cada bar, exportar CSV.
- Búsqueda de datos por lead con Gemini (y con Google CSE si se monta), CON una comprobación de coherencia: solo acepta un Instagram/teléfono/email si es de ESE negocio (no mete datos de un tercero ni de un directorio).

## Decisiones que el siguiente debería tomar PRIMERO
- **¿Presupuesto para una API de pago** (SERP API / enriquecimiento de contactos como Apify, Serper, etc.) que saque email/teléfono fiable en masa? → única salida real al problema 1.
- **¿Un mini-backend** (un servidor/Worker propio) que lea de forma controlada Facebook/Instagram/Google Maps y devuelva el dato limpio con CORS abierto? → resuelve 2, 3 y 6.
- Sin una de esas dos cosas, esto se queda en semi-manual: la app prepara el lead y la persona abre Google/Facebook y copia el dato a mano.

## Datos de contexto
- Hay ~1.700 leads ya cargados (de Apify Google Maps), con teléfono en muchos, web en bastantes, pocos emails.
- Claves que usa la app (en Ajustes, guardadas en el navegador): clave Google Places (AIza...), clave Gemini (AQ...), Cloudflare Worker URL, y el ID del CSE (pendiente).
