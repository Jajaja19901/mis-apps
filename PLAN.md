# PLAN — App de arbitraje cripto-oro (simulador con dinero ficticio)

> **Agente 1 · Arquitecto de Producto.** Este documento es el guion de los agentes 2–10.
> Todo lo que aquí está escrito es CONTRATO: IDs, textos marcados como “contrato”, claves de
> localStorage y fórmulas se implementan **tal cual**. Si un agente necesita cambiar un texto de
> contrato, debe cambiar también el test de aceptación correspondiente (bloque JSON del final).

Entregable: **UN solo archivo** `apps/arbitragegold.html` (CSS y JS inline, sin dependencias,
sin fuentes externas, mobile-first, PWA instalable).

---

## 0. Restricciones técnicas DURAS (el verificador las castiga)

El verificador (`tools/verificar-app.mjs`) abre la app en Chromium headless desde `file://`,
recorre todas las rutas hash, **pulsa a ciegas todos los controles visibles de la portada**,
caza errores de consola y ejecuta el bloque `#acceptance-tests`. Por eso:

1. **CERO peticiones de red en `file://`.** Ni fuentes de Google, ni imágenes remotas, ni `fetch`.
   Un fetch bloqueado por CORS imprime un error de consola (`Access to fetch … blocked by CORS
   policy`) que NO está en la lista de ruido ignorado → `❌ NO APTO`.
   → El motor de precios en vivo solo se intenta si
   `CONFIG.LIVE_PRICES === true && /^https?:$/.test(location.protocol) && location.origin !== "null"`.
   En cualquier otro caso (y siempre en `file://`) se usa el **simulador determinista local**.
   Todo `fetch` va con `try/catch` + `AbortController` (4 s) y fallo silencioso al simulador.
2. **Nada de `alert()`, `confirm()` ni `prompt()`**: bloquean el navegador headless. Toda
   confirmación es un panel/modal en el DOM con doble paso (ver “inventario de controles”).
3. **Todos los `<form>` llevan `novalidate`** y validan por JS pintando mensajes en el DOM. El
   verificador usa `form.requestSubmit()`, que con validación nativa NO dispararía el `submit`.
4. **Sesión de admin solo en memoria** (variable JS, ni localStorage ni sessionStorage): al
   recargar siempre pide contraseña. Así ningún test hereda sesión de otro.
5. **`<link rel="manifest">` se inyecta por JS solo si el protocolo es http/https.** En `file://`
   no se inyecta (evita errores de manifest en consola). Metas Apple e icono SVG inline: siempre.
6. **Ningún control “muerto”**: cada botón cambia algo visible en el DOM (mensaje, panel, toast,
   clase). Los toasts se pintan como texto real en un `<div aria-live="polite">` (el verificador
   lee `innerText`).
7. **La portada NO contiene controles destructivos** (reiniciar simulación, borrar datos,
   ejecutar arbitraje): el verificador pulsa todo lo visible en `#/`.
8. Al arrancar, si `location.hash` está vacío → `location.hash = "#/"` (NO usar
   `history.replaceState` en `file://`). El router debe funcionar con hash vacío igualmente.
9. Tras un `reload` el hash se pierde (el verificador recarga la URL sin hash): el estado se
   recupera **de localStorage**, no de la URL.
10. Textos usados por los tests: `innerText.includes(...)` es **sensible a mayúsculas**. Respetar
    literalmente los textos de la sección 8.

---

## 1. CRITERIOS DE ACEPTACIÓN (verificables con un sí/no pulsando)

### Visitante (trader anónimo, sin registro)

1. Al abrir la app aparece la portada con el aviso **“Simulación con dinero ficticio”** y el texto
   **“no es asesoramiento financiero”** visibles sin hacer scroll horizontal (móvil 390 px).
2. En `#/arbitraje` se ve una tabla de **5 mercados** (PAXG/USDT Binance, PAXG/USD Kraken,
   XAUT/USDT Binance, XAUT/USD Kraken, XAU/USD índice) con precio en $ y variación; el texto
   “**mercados vigilados**” indica el número.
3. Los precios se **refrescan solos cada 10 s** (contador “Próxima actualización en Ns” que baja) y
   además al pulsar **“Actualizar precios”** aparece el mensaje **“Precios actualizados”** y algún
   precio cambia.
4. En `#/arbitraje` hay una tabla de **6 rutas de arbitraje** con spread bruto %, comisiones y
   **spread neto %**; hay al menos una fila marcada como **“Ganancia”** (clase `.spread-up`) y al
   menos una como **“Pérdida”** (clase `.spread-down`) en el primer ciclo.
5. El banner del detector (“IA simulada”, determinista) muestra **“oportunidades detectadas”** con
   el número de rutas cuyo spread neto ≥ 0,30 %, y una lista de alertas con nivel Alta/Media/Baja.
6. Al pulsar **“Operar”** en una fila de arbitraje se abre un modal con la ruta, la cantidad
   (prellenada) y **“Beneficio neto estimado”**; al confirmar aparece **“Arbitraje ejecutado”**, el
   modal se cierra y la operación aparece en `#/historial`.
7. En `#/simulador`, al enviar el formulario con la cantidad vacía aparece
   **“Introduce una cantidad mayor que 0”** y **NO** se crea ninguna posición
   (sigue “Posiciones abiertas (0)”).
8. En `#/simulador`, con cantidad 500 (coste > saldo) aparece **“Saldo insuficiente”** y no se
   crea posición.
9. En `#/simulador`, con cantidad 1 y lado “Comprar”, al enviar aparece **“Operación ejecutada”**,
   el contador pasa a **“Posiciones abiertas (1)”**, el capital disponible baja y la posición
   aparece en la tabla con su P&L no realizado.
10. Se puede abrir también una **venta en corto** (lado “Vender en corto”): la posición aparece
    etiquetada **“Corto”**.
11. Al pulsar **“Cerrar posición”** aparece **“Posición cerrada”**, el contador vuelve a
    **“Posiciones abiertas (0)”** y el **“P&L realizado”** de la cabecera se actualiza.
12. En `#/historial` se listan todas las operaciones (arbitrajes y posiciones) con fecha, mercado,
    lado, cantidad, precio y resultado; **tras recargar la página siguen ahí**.
13. En `#/historial`, al pulsar **“Exportar CSV”** aparece **“CSV generado”** y se descarga un
    fichero (no navega ni rompe la página).
14. **“Reiniciar simulación”** exige doble paso: primero muestra un aviso con
    **“Sí, reiniciar todo”**; al confirmarlo aparece **“Simulación reiniciada”**, el capital vuelve
    a **100.000** y quedan “Posiciones abiertas (0)”.
15. En `#/acceso` (embudo), al enviar el formulario vacío aparece un error con la palabra
    **“obligatorio”**; con nombre y email pero sin marcar el consentimiento aparece
    **“Debes aceptar la política de privacidad”**; con todo correcto aparece
    **“Solicitud registrada”** y el formulario se sustituye por el mensaje de éxito.
16. Desde el pie, el enlace **“Aviso legal y privacidad”** lleva a `#/legal` (hash `#/legal`) y esa
    pantalla contiene **“Responsable del tratamiento”**, **“Aviso legal”**, **“dinero ficticio”** y
    los placeholders del titular.
17. La navegación principal funciona: los enlaces Inicio / Arbitraje / Simulador / Historial dejan
    el hash en `#/`, `#/arbitraje`, `#/simulador`, `#/historial` respectivamente, y cada pantalla
    pinta su título.
18. El botón **“Instalar app”** abre un modal con instrucciones que contiene
    **“pantalla de inicio”** y se cierra con su botón (el modal desaparece).
19. El pie muestra, discreto, **“Diseñado por Incuba tu Negocio · por Jaime M. M.”**.

### Dueño (admin)

20. En `#/admin` con contraseña incorrecta aparece **“Contraseña incorrecta”** y el panel
    (`#adminPanel`) NO se muestra.
21. Con la contraseña correcta aparece **“Panel del dueño”** con 4 pestañas
    (Resumen, Operaciones, Solicitudes, Ajustes) y KPIs numéricos.
22. En la pestaña **Operaciones** se ven TODAS las operaciones guardadas en el dispositivo
    (mercado visible, p. ej. “PAXG”) y al pulsar **“Exportar CSV”** aparece **“CSV generado”**.
23. En la pestaña **Solicitudes** aparecen las solicitudes de acceso enviadas (email visible) y
    tiene su propio **“Exportar CSV”**.
24. En **Ajustes**, con contraseña actual correcta + nueva repetida (≥ 8 caracteres) aparece
    **“Contraseña actualizada”**; tras **“Cerrar sesión”**, la contraseña nueva entra y la vieja da
    “Contraseña incorrecta”.
25. En **Ajustes**, cambiar la contraseña con la actual equivocada muestra
    **“La contraseña actual no es correcta”** y no la cambia.
26. En **Ajustes**, **“Borrar todos los datos”** exige doble paso (aparece
    **“Sí, borrar todo”**); al confirmar aparece **“Datos borrados”** y la pestaña Operaciones
    muestra **“Todavía no hay operaciones”**.
27. En **Ajustes** hay un interruptor **“Intentar precios en vivo”** que al pulsarlo cambia su
    estado visible y muestra la nota **“En modo archivo local siempre se usan precios simulados”**.
28. Nada del panel es accesible sin contraseña: al recargar en `#/admin` vuelve a pedirla.

### Global

29. El verificador termina en **✅ APTO** con 0 errores y sin “control muerto” en la portada.
30. A 390 px de ancho no hay scroll horizontal en ninguna pantalla; las tablas grandes se
    desplazan dentro de su contenedor (`overflow-x:auto`) con `tabindex="0"`.

---

## 2. ALCANCE

### Entra en la v1
- Portada-embudo (`#/`) con propuesta de valor, mini-tabla de precios en vivo y CTAs.
- Panel de arbitraje (`#/arbitraje`): 5 mercados + 6 rutas + spreads + detector de oportunidades
  (determinista) + alertas + arbitraje 1 clic simulado.
- Simulador manual (`#/simulador`): capital ficticio, largos y cortos, posiciones abiertas con P&L
  no realizado, cierre de posición, comisiones simuladas.
- Historial (`#/historial`) con filtro y export CSV propio.
- Guía (`#/guia`): qué es el arbitraje cripto-oro y cómo funciona el detector (contenido real).
- Solicitud de acceso (`#/acceso`): formulario voluntario con consentimiento obligatorio.
- Legal (`#/legal`): privacidad + aviso legal + aviso de riesgo, con placeholders del titular.
- Panel de admin (`#/admin`): login, KPIs, operaciones, solicitudes, export CSV, cambio de
  contraseña, borrado de datos, interruptor de precios en vivo.
- PWA: manifest inyectado en http(s), metas Apple, favicon SVG, botón “Instalar app”.
- Motor de precios: simulador determinista (por defecto) + intento opcional de APIs públicas.

### NO entra en la v1 (decirlo explícitamente en la app y en la entrega)
- Dinero real, órdenes reales, claves de exchange, custodia, cobros.
- Cuentas de usuario, login de traders, sincronización entre dispositivos (los datos son de
  **este navegador**).
- Gráficas de velas / librerías de charting (solo sparklines SVG generadas a mano).
- Notificaciones push, emails automáticos, webhooks, backtesting histórico.
- Modelos de IA reales: el “detector” es una regla determinista y así se dice en la interfaz.
- Precios garantizados: en `file://` (doble clic) los precios son simulados; con APIs públicas y
  servidor https podrían ser reales, y aun así sin garantía de latencia.

---

## 3. MAPA DE PANTALLAS (router por hash, un `<main id="view">` que se repinta)

| Ruta | Pantalla | Título H1 (contrato) | Acción principal |
|---|---|---|---|
| `#/` | Portada / embudo | `Arbitraje cripto-oro en modo simulación` | “Ver oportunidades” → `#/arbitraje` |
| `#/arbitraje` | Panel de arbitraje | `Panel de arbitraje` | “Operar” (modal 1 clic) |
| `#/simulador` | Simulador de trading | `Simulador de trading` | Ejecutar operación |
| `#/historial` | Historial | `Historial de operaciones` | Exportar CSV |
| `#/guia` | Cómo funciona | `Cómo funciona el detector` | “Abrir el simulador” |
| `#/acceso` | Solicitar acceso (lead) | `Solicita acceso a las alertas` | Enviar solicitud |
| `#/legal` | Legal | `Aviso legal y privacidad` | Volver al simulador |
| `#/admin` | Panel del dueño | `Panel del dueño` (tras login) | Ver/exportar |

Rutas desconocidas (`#/loquesea`) → render de la portada (sin error de consola).

**Chrome persistente en todas las pantallas:**
- Barra superior fija: emblema SVG + `CONFIG.BUSINESS_NAME` + badge de modo de datos
  (`#dataModeBadge`: “Datos simulados” / “Datos en vivo”) + reloj de refresco
  (`#refreshCountdown`).
- Cinta de aviso (`#riskStrip`, siempre visible bajo la barra):
  “Simulación con dinero ficticio · esto no es asesoramiento financiero.”
- Barra de navegación: en móvil, barra inferior fija con 4 destinos; en ≥ 768 px, nav horizontal
  en la cabecera. **Mismos IDs en ambas** no es posible (IDs únicos) → los IDs
  `#nav-home/#nav-arbitraje/#nav-simulador/#nav-historial` los lleva **la navegación única**
  (una sola lista, reposicionada por CSS: `position:fixed;bottom:0` en móvil, estática en la
  cabecera en desktop). Prohibido duplicar el marcado.
- Pie: enlaces Guía, Solicitar acceso, Aviso legal y privacidad, Panel del dueño, botón
  “Instalar app”, firma del estudio.

---

## 4. FLUJOS PASO A PASO

### F1 · Trader descubre y ejecuta un arbitraje (flujo estrella)
1. Abre la app → `#/` (hash vacío → `#/`). Ve hero + mini-tabla de 3 mercados + CTA
   “Ver oportunidades”.
2. Pulsa “Ver oportunidades” → `#/arbitraje`. Se pinta: banner de alertas, tabla de mercados,
   tabla de rutas ordenada por spread neto descendente.
3. Cada 10 s el motor avanza un ciclo: repinta precios, spreads, colores, alertas y el contador.
   El cambio se anuncia en `#liveStatus` (aria-live polite, texto “Precios actualizados · ciclo N”).
4. Pulsa “Operar” en la mejor fila (`#arb-op-0`) → modal `#arbModal` con:
   ruta (compra en X / venta en Y), precios, cantidad prellenada
   `qty = round(cash * 0.05 / buyPrice, 3)` (mínimo 0,001), comisiones y
   **“Beneficio neto estimado”**.
5. Validación al confirmar (`#btnArbConfirm`):
   - cantidad vacía/no numérica/≤ 0 → `#arbError`: “Introduce una cantidad mayor que 0”, no ejecuta.
   - `qty > CONFIG.MAX_QTY` (1000) → “Cantidad máxima por operación: 1000”.
   - coste (`qty*buyPrice*(1+FEE)`) > `wallet.cash` → “Saldo insuficiente para esta operación”.
   - spread neto ≤ 0 → permite ejecutar pero avisa antes en el modal: “Esta ruta está en pérdida”.
6. Si valida: ejecuta las dos patas al precio del ciclo actual, actualiza `wallet.cash`,
   añade 1 registro `trade` tipo `arb`, cierra el modal, toast **“Arbitraje ejecutado”** y
   actualiza el bloque de resumen (P&L realizado, nº operaciones).
7. Ofrece “Ver en el historial” → `#/historial`.

### F2 · Trader opera manualmente en el simulador
1. `#/simulador` muestra cabecera de cartera: Capital disponible, Bloqueado en posiciones,
   **P&L no realizado**, **P&L realizado**, Equity total, y “Posiciones abiertas (N)”.
2. Formulario `#tradeForm`: mercado (`#trade-market`, 5 opciones), lado (`#trade-side`:
   `long` = “Comprar (largo)”, `short` = “Vender en corto”), cantidad (`#trade-qty`, `inputmode`
   decimal), y una línea de previsualización `#tradePreview` (“Coste estimado: $X · comisión $Y”)
   que se recalcula al cambiar cualquier campo (eventos `input` **y** `change`; además se leen los
   valores otra vez en el `submit`, nunca se depende solo del evento).
3. Al enviar, validaciones en este orden, mostrando el primer error en `#tradeError` y abortando:
   1. cantidad vacía / no numérica / ≤ 0 → “Introduce una cantidad mayor que 0”
   2. cantidad > 1000 → “Cantidad máxima por operación: 1000”
   3. coste + comisión > capital disponible → “Saldo insuficiente para esta operación”
4. Si valida: crea posición abierta, mueve dinero (ver fórmulas §6.4), añade `trade` tipo `open`,
   toast **“Operación ejecutada”**, repinta cabecera y tabla `#posTable`, limpia el error y deja el
   foco en el primer botón “Cerrar posición” creado (accesibilidad).
5. Cada ciclo de precios recalcula el P&L no realizado de cada posición y lo colorea
   (`.pnl-up` / `.pnl-down`) con etiqueta textual (“+” / “−”, nunca solo color).
6. “Cerrar posición” (`#pos-close-0`, `#pos-close-1`, …) → cierra al precio del ciclo actual,
   realiza el P&L, añade `trade` tipo `close`, toast **“Posición cerrada”**, repinta.
7. “Reiniciar simulación” (`#btnReset`) → muestra `#resetConfirm` con el texto
   “Se borrarán tus posiciones y tu historial de este dispositivo.” + `#btnResetYes`
   (“Sí, reiniciar todo”) y `#btnResetNo` (“Cancelar”). Confirmar → wallet a 100.000, posiciones y
   trades vacíos, toast **“Simulación reiniciada”**.

### F3 · Trader consulta y exporta su historial
1. `#/historial`: tabla `#histTable` (más reciente primero, máx. 200 filas pintadas) con
   Fecha/hora, Tipo (“Arbitraje” / “Apertura” / “Cierre”), Mercado(s), Lado (“Largo”/“Corto”),
   Cantidad, Precio, Comisión, Resultado.
2. Filtro `#histFilter` (select: Todas / Arbitrajes / Aperturas / Cierres) → repinta la tabla al
   cambiar (`change` **e** `input`) y actualiza el contador “N operaciones”.
3. Si no hay nada: estado vacío “Todavía no hay operaciones” + CTA “Abrir el simulador”.
4. “Exportar CSV” (`#btnExportMyOps`) → genera Blob CSV, descarga y toast
   **“CSV generado (N filas)”**.
5. Recargar la página conserva todo (localStorage).

### F4 · Visitante solicita acceso (embudo, único dato personal voluntario)
1. `#/acceso`: explica qué recibe (alertas por email cuando exista la versión pro) y formulario
   `#accesoForm` con: `#acceso-nombre` (texto), `#acceso-email` (email),
   `#acceso-perfil` (select: “Curioso”, “Trader particular”, “Profesional / fondo”),
   `#acceso-mensaje` (textarea, opcional), `#acceso-consent` (checkbox obligatorio).
2. Validación en este orden, primer error en `#accesoError`:
   1. nombre con < 2 caracteres → “El nombre es obligatorio”
   2. email que no cumple `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` → “Escribe un email válido”
   3. consentimiento sin marcar → “Debes aceptar la política de privacidad”
3. OK → guarda lead, sustituye el formulario por `#accesoOk` con **“Solicitud registrada”**,
   el nombre escrito (escapado) y CTA “Volver al panel de arbitraje”.
4. Aviso bajo el botón: “Guardamos tu solicitud solo en este dispositivo. Sin cookies de
   seguimiento.” + enlace a `#/legal`.

### F5 · Dueño entra al panel
1. `#/admin` → `#adminGate` con `#adminLoginForm`, campo `#adm-pass` (`type="password"`,
   `autocomplete="current-password"`), botón “Entrar”.
2. Vacío → `#admError`: “Escribe la contraseña”. Incorrecta → “Contraseña incorrecta”
   (y `#adminPanel` no existe/oculto).
3. Correcta (compara con `getAdminPass()` = `ag_v1_admin.pass` o `CONFIG.ADMIN_PASSWORD`) →
   `ADMIN_OK = true` (memoria) y render de `#adminPanel` con H1 “Panel del dueño”.
4. Pestañas (botones `role="tab"`): `#tab-resumen`, `#tab-ops`, `#tab-leads`, `#tab-config`.
   Al pulsar se cambia `aria-selected` y se muestra el panel correspondiente
   (`#pane-resumen`, `#pane-ops`, `#pane-leads`, `#pane-config`).
5. Resumen: KPIs (nº operaciones, volumen simulado, P&L realizado agregado, posiciones abiertas,
   nº solicitudes, nº alertas del ciclo) + “Última actividad”.
6. Operaciones: tabla completa + “Exportar CSV” (`#btnExportOps`) → “CSV generado (N filas)”.
7. Solicitudes: tabla (fecha, nombre, email, perfil, mensaje, consentimiento “Sí”) +
   “Exportar CSV” (`#btnExportLeads`).
8. Ajustes:
   - `#adminPassForm`: `#adm-cur`, `#adm-new`, `#adm-new2`, botón “Guardar contraseña”.
     Validación: campos vacíos → “Rellena los tres campos”; actual incorrecta →
     “La contraseña actual no es correcta”; nueva < 8 caracteres →
     “La nueva contraseña debe tener al menos 8 caracteres”; no coinciden →
     “Las contraseñas nuevas no coinciden”. OK → guarda y muestra “Contraseña actualizada”.
   - `#btnLive` (interruptor, `aria-pressed`): alterna `ag_v1_settings.liveData`, repinta el badge y
     muestra la nota “En modo archivo local siempre se usan precios simulados”.
   - `#btnWipe` (“Borrar todos los datos”) → `#wipeConfirm` con `#btnWipeYes` (“Sí, borrar todo”) y
     `#btnWipeNo` (“Cancelar”). Confirmar → borra TODAS las claves `ag_v1_*`, reinicia estado en
     memoria, mensaje **“Datos borrados”**, permanece en el panel.
   - `#btnAdminLogout` (“Cerrar sesión”) → `ADMIN_OK = false`, vuelve a `#adminGate`.
9. Nota fija en el panel: la contraseña vive en el código del archivo y los datos solo en este
   navegador; no es seguridad real.

---

## 5. INVENTARIO DE CONTROLES (qué hace CADA cosa al pulsarla)

### Globales (todas las pantallas)
| Elemento | ID / selector | Al pulsar / cambiar |
|---|---|---|
| Logo + nombre | `#brandHome` (`<a href="#/">`) | va a `#/` |
| Badge de modo | `#dataModeBadge` (no interactivo) | muestra “Datos simulados” o “Datos en vivo” |
| Contador de refresco | `#refreshCountdown` (no interactivo) | “Próxima actualización en Ns” (10→1) |
| Nav Inicio | `#nav-home` (`href="#/"`) | hash `#/` |
| Nav Arbitraje | `#nav-arbitraje` (`href="#/arbitraje"`) | hash `#/arbitraje` |
| Nav Simulador | `#nav-simulador` (`href="#/simulador"`) | hash `#/simulador` |
| Nav Historial | `#nav-historial` (`href="#/historial"`) | hash `#/historial` |
| Toast | `#toast` (`role="status" aria-live="polite"`) | recibe los mensajes de contrato |
| Estado en vivo | `#liveStatus` (`aria-live="polite"`) | “Precios actualizados · ciclo N” |
| Pie: Guía | `#foot-guia` | `#/guia` |
| Pie: Solicitar acceso | `#foot-acceso` | `#/acceso` |
| Pie: Aviso legal y privacidad | `#foot-legal` (texto exacto “Aviso legal y privacidad”) | `#/legal` |
| Pie: Panel del dueño | `#foot-admin` | `#/admin` |
| Instalar app | `#btnInstall` | abre `#installModal`; si hay `beforeinstallprompt` guardado, llama a `prompt()` **además** de mostrar el modal |
| Cerrar modal instalar | `#installClose` (texto “Entendido”) | oculta `#installModal`, devuelve el foco a `#btnInstall` |
| Firma estudio | `#studioLink` (`target="_blank" rel="noopener noreferrer"`) | abre `CONFIG.STUDIO_URL` |

### `#/` Portada (sin controles destructivos)
| Control | ID | Efecto |
|---|---|---|
| CTA principal “Ver oportunidades” | `#cta-arbitraje` | `#/arbitraje` |
| CTA secundaria “Abrir el simulador” | `#cta-simulador` | `#/simulador` |
| “Cómo funciona” | `#cta-guia` | `#/guia` |
| “Solicitar acceso a las alertas” | `#cta-acceso` | `#/acceso` |
| Mini-tabla de 3 mercados | `#miniPrices` (tabla, no interactiva) | se repinta cada ciclo |

### `#/arbitraje`
| Control | ID | Efecto |
|---|---|---|
| Banner de alertas | `#alertBanner` | “N oportunidades detectadas” + lista `#alertList` (máx. 5) |
| Tabla de mercados | `#marketTable` | 5 filas: mercado, exchange, precio, variación %, sparkline SVG |
| Tabla de rutas | `#arbTable` | 6 filas ordenadas por spread neto ↓ |
| Celda de spread | `.spread-up` / `.spread-flat` / `.spread-down` + texto “Ganancia” / “Ajustado” / “Pérdida” | color + texto (nunca solo color) |
| “Actualizar precios” | `#btnRefresh` | avanza 1 ciclo, repinta todo, toast “Precios actualizados” |
| “Operar” fila i | `#arb-op-0` … `#arb-op-5` (`data-route`) | abre `#arbModal` con esa ruta |
| Modal: cantidad | `#arb-qty` | recalcula `#arbEstimate` (“Beneficio neto estimado: $X”) |
| Modal: confirmar | `#btnArbConfirm` (texto “Ejecutar arbitraje”) | valida (§F1.5) y ejecuta; toast “Arbitraje ejecutado”; cierra modal |
| Modal: cancelar | `#btnArbCancel` (texto “Cancelar”) | cierra `#arbModal` sin cambios, foco al botón que lo abrió |
| Filtro “solo oportunidades” | `#arbOnlyOps` (checkbox) | oculta filas con spread neto ≤ 0 y actualiza “N rutas mostradas” |

### `#/simulador`
| Control | ID | Efecto |
|---|---|---|
| Cabecera cartera | `#walletBar` | Capital disponible, Bloqueado, P&L no realizado, P&L realizado, Equity, “Posiciones abiertas (N)” |
| Mercado | `#trade-market` (select) | actualiza `#tradePreview` |
| Lado | `#trade-side` (select: `long`/`short`) | actualiza `#tradePreview` |
| Cantidad | `#trade-qty` (text/inputmode decimal) | actualiza `#tradePreview` |
| Enviar | `#tradeForm` + botón `#btnTrade` (“Ejecutar operación”) | valida (§F2.3) → crea posición o pinta `#tradeError` |
| Tabla posiciones | `#posTable` | fila por posición: mercado, lado (“Largo”/“Corto”), cantidad, precio entrada, precio actual, P&L no realizado, botón cerrar |
| Cerrar posición i | `#pos-close-0`… (texto “Cerrar posición”) | cierra, realiza P&L, toast “Posición cerrada” |
| Reiniciar | `#btnReset` (“Reiniciar simulación”) | muestra `#resetConfirm` |
| Confirmar reinicio | `#btnResetYes` (“Sí, reiniciar todo”) | resetea; toast “Simulación reiniciada” |
| Cancelar reinicio | `#btnResetNo` (“Cancelar”) | oculta `#resetConfirm` |

### `#/historial`
| Control | ID | Efecto |
|---|---|---|
| Filtro | `#histFilter` (select) | repinta `#histTable` + contador |
| Tabla | `#histTable` | operaciones, recientes primero |
| Exportar | `#btnExportMyOps` (“Exportar CSV”) | descarga CSV + toast “CSV generado (N filas)” |
| Estado vacío CTA | `#hist-empty-cta` | `#/simulador` |

### `#/guia`
Contenido + acordeones `#faq-0…#faq-3` (botón `aria-expanded` que abre/cierra su panel) +
CTA `#guia-cta` → `#/simulador`.

### `#/acceso`
Ver §F4. Controles: `#acceso-nombre`, `#acceso-email`, `#acceso-perfil`, `#acceso-mensaje`,
`#acceso-consent`, `#accesoForm` (botón `#btnAcceso`, “Enviar solicitud”), enlace `#acceso-legal`
→ `#/legal`, y tras el éxito `#accesoOk` con `#accesoOkCta` → `#/arbitraje`.

### `#/legal`
Texto (secciones: Aviso de riesgo, Responsable del tratamiento, Datos que tratamos, Base legal,
Conservación, Derechos, Sin cookies, Propiedad intelectual, Legislación aplicable) +
`#legal-back` → `#/simulador`.

### `#/admin`
Ver §F5. Controles: `#adminLoginForm`/`#adm-pass`/`#btnAdminEnter`; pestañas `#tab-resumen`,
`#tab-ops`, `#tab-leads`, `#tab-config`; `#btnExportOps`, `#btnExportLeads`, `#adminPassForm`
(`#adm-cur`, `#adm-new`, `#adm-new2`, `#btnAdminPass`), `#btnLive`, `#btnWipe`, `#btnWipeYes`,
`#btnWipeNo`, `#btnAdminLogout`.

---

## 6. MODELO DE DATOS Y MOTOR

### 6.1 CONFIG (arriba del archivo, editable en 1 minuto)
```js
const CONFIG = {
  BUSINESS_NAME : "ArbitrageGold",   // placeholder indicado en el briefing — confirmar marca real
  TAGLINE       : "Arbitraje cripto-oro en modo simulación",
  ADMIN_PASSWORD: "oro-demo-2026",   // ⚠ visible en el código: cerrojo básico, no seguridad real
  INITIAL_CASH  : 100000,            // $ ficticios
  REFRESH_MS    : 10000,             // 10 s (criterio del briefing)
  FEE_PCT       : 0.1,               // % por pata (comisión simulada)
  ALERT_NET_PCT : 0.30,              // % neto a partir del cual el detector alerta
  MAX_QTY       : 1000,
  BASE_GOLD_USD : 2400,              // precio base simulado de la onza — confirmar
  LIVE_PRICES   : false,             // true = intenta APIs públicas (solo en http/https)
  CURRENCY      : "USD",
  CONTACT_EMAIL : "",                // ⚠ FALTA en el briefing: vacío = no se pintan mailto
  WHATSAPP      : "",                // ⚠ FALTA: vacío = no se pinta el botón de WhatsApp
  LEGAL_HOLDER  : "[NOMBRE DEL TITULAR]",
  LEGAL_ID      : "[NIF/CIF]",
  LEGAL_ADDRESS : "[DIRECCIÓN FISCAL]",
  LEGAL_COUNTRY : "España",
  STUDIO_BRAND  : "Incuba tu Negocio",
  STUDIO_AUTHOR : "Jaime M. M.",
  STUDIO_URL    : "https://incubatunegocio.example",  // ⚠ confirmar URL real
};
```
Regla de oro: si `CONTACT_EMAIL` o `WHATSAPP` están vacíos, **no se pinta** ese control (nunca
inventar un contacto).

### 6.2 Claves de localStorage (prefijo `ag_v1_`)
| Clave | Forma | Notas |
|---|---|---|
| `ag_v1_wallet` | `{cash:number, locked:number, realized:number, initial:number, createdAt:string(ISO), updatedAt:string(ISO)}` | se crea al primer arranque con `cash=CONFIG.INITIAL_CASH`, `locked=0`, `realized=0` |
| `ag_v1_positions` | `Array<Position>` | solo posiciones abiertas |
| `ag_v1_trades` | `Array<Trade>` | historial completo, **más reciente primero** (`unshift`), tope 500 (se recorta el final) |
| `ag_v1_leads` | `Array<Lead>` | solicitudes de acceso |
| `ag_v1_alerts` | `Array<Alert>` | últimas 20 alertas del detector |
| `ag_v1_admin` | `{pass:string, changedAt:string}` | solo existe si el dueño cambió la contraseña |
| `ag_v1_settings` | `{liveData:boolean, updatedAt:string}` | interruptor del panel |

`Position`
```
{ id:"p_<ts>_<rnd>", market:"PAXG-BINANCE", label:"PAXG/USDT · Binance",
  side:"long"|"short", qty:number, entryPrice:number, notional:number,
  feeOpen:number, openedAt:"ISO" }
```
`Trade`
```
{ id:"t_<ts>_<rnd>", ts:"ISO", type:"arb"|"open"|"close",
  // type "arb":
  routeId:"R2", buyMarket:"XAUT-BINANCE", sellMarket:"XAUT-KRAKEN",
  buyPrice:number, sellPrice:number,
  // type "open"/"close":
  market:"PAXG-BINANCE", label:"PAXG/USDT · Binance", side:"long"|"short",
  price:number, entryPrice:number|null, positionId:string|null,
  // comunes:
  qty:number, fee:number, pnl:number, cashAfter:number }
```
`Lead`
```
{ id:"l_<ts>_<rnd>", ts:"ISO", nombre:string, email:string, perfil:string,
  mensaje:string, consent:true }
```
`Alert`
```
{ id:"a_<ts>_<rnd>", ts:"ISO", routeId:string, routeLabel:string,
  netPct:number, score:number, level:"Alta"|"Media"|"Baja" }
```

**IDs únicos:** `const uid = p => p + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8);`
(no usar `crypto.randomUUID` para no depender de contexto seguro en `file://`).

**Acceso a storage:** helpers `readLS(key, fallback)` con `try/catch` (JSON inválido → fallback) y
`writeLS(key, value)` con `try/catch` (si falla, toast “No se pudo guardar en este dispositivo”).
Toda lectura valida tipos (`Array.isArray`, `typeof === "number" && isFinite`) para que un
localStorage manipulado a mano no rompa la app (lo revisa el agente 7).

### 6.3 Mercados, rutas y motor de precios (determinista)
```js
const MARKETS = [
  { id:"PAXG-BINANCE", asset:"PAXG", venue:"Binance", symbol:"PAXG/USDT", offsetPct:+0.05, vol:0.18 },
  { id:"PAXG-KRAKEN",  asset:"PAXG", venue:"Kraken",  symbol:"PAXG/USD",  offsetPct:+0.28, vol:0.22 },
  { id:"XAUT-BINANCE", asset:"XAUT", venue:"Binance", symbol:"XAUT/USDT", offsetPct:-0.12, vol:0.20 },
  { id:"XAUT-KRAKEN",  asset:"XAUT", venue:"Kraken",  symbol:"XAUT/USD",  offsetPct:+0.63, vol:0.16 },
  { id:"XAU-INDEX",    asset:"XAU",  venue:"Índice oro spot", symbol:"XAU/USD", offsetPct:0, vol:0.10 },
];
```
Precio del mercado `i` en el ciclo `t` (ciclo entero, empieza en 0):
```
drift(i,t) = Math.sin((t + i*7) * 0.35) * MARKETS[i].vol      // en %
price(i,t) = r2( BASE_GOLD_USD * (1 + offsetPct/100) * (1 + drift(i,t)/100) )
r2 = v => Math.round(v*100)/100
```
Determinista, acotado, nunca NaN ni negativo. Variación % mostrada = `(price(t) - price(t-1)) / price(t-1) * 100`
(en `t=0` se usa `t-1 = -1` con la misma fórmula, así siempre hay un valor).

Rutas (comprar en A, vender en B) — 6, mínimo del briefing cumplido con holgura:
```js
const ROUTES = [
  { id:"R1", buy:"PAXG-BINANCE", sell:"PAXG-KRAKEN",  label:"PAXG · Binance → Kraken" },
  { id:"R2", buy:"XAUT-BINANCE", sell:"XAUT-KRAKEN",  label:"XAUT · Binance → Kraken" },
  { id:"R3", buy:"PAXG-BINANCE", sell:"XAUT-KRAKEN",  label:"PAXG Binance → XAUT Kraken" },
  { id:"R4", buy:"XAUT-BINANCE", sell:"PAXG-KRAKEN",  label:"XAUT Binance → PAXG Kraken" },
  { id:"R5", buy:"PAXG-BINANCE", sell:"XAU-INDEX",    label:"PAXG Binance → Índice oro" },
  { id:"R6", buy:"XAUT-BINANCE", sell:"XAU-INDEX",    label:"XAUT Binance → Índice oro" },
];
grossPct = (sellPrice - buyPrice) / buyPrice * 100
netPct   = r3( grossPct - 2 * CONFIG.FEE_PCT )        // r3 = 3 decimales
clase    = netPct >= CONFIG.ALERT_NET_PCT ? "spread-up"  ("Ganancia")
         : netPct > 0                     ? "spread-flat" ("Ajustado")
         :                                  "spread-down" ("Pérdida")
```
En el ciclo 0 esto da: R2 ≈ +0,55 y R3 ≈ +0,38 (verde) · R1 ≈ +0,03 y R4 ≈ +0,20 (ámbar) ·
R5 ≈ −0,15 y R6 ≈ −0,32 (rojo) → **siempre hay `.spread-up` y `.spread-down` al cargar**
(criterio 4). Si algún agente cambia los offsets, debe mantener esa condición.

**Detector “IA simulada” (determinista, así se declara en la interfaz):**
```
score = Math.max(1, Math.min(99, Math.round(netPct * 100)))
level = score >= 50 ? "Alta" : score >= 25 ? "Media" : "Baja"
```
Genera alerta si `netPct >= CONFIG.ALERT_NET_PCT`, con antirrebote de 60 s por `routeId`
(no repetir alerta de la misma ruta antes de 60 s). Banner:
`"N oportunidades detectadas"` (si N = 0: “Sin oportunidades por encima del umbral ahora mismo”).

**Reloj:** un único `setInterval` de 1000 ms mantiene el contador visible y, cada
`REFRESH_MS/1000` segundos, avanza el ciclo (`tick++`), recalcula, repinta y escribe en
`#liveStatus`. Se pausa con `document.hidden` (rendimiento) y se reanuda al volver.

**Precios en vivo (opcional, nunca en `file://`):** si procede, intenta en paralelo endpoints
públicos (p. ej. tickers de PAXG/XAUT) con `AbortController` (4 s); si TODOS fallan o cualquiera
lanza, se queda el simulador y el badge sigue diciendo “Datos simulados”. Ningún `.catch` vacío
sin comentario: siempre degradación explícita.

### 6.4 Fórmulas de dinero (2 decimales, `r2`)
- Comisión de una pata: `fee = r2(qty * price * CONFIG.FEE_PCT / 100)`.
- **Arbitraje (`arb`)**: `costo = qty*buyPrice`, `feeBuy`, `ingreso = qty*sellPrice`, `feeSell`.
  Requiere `wallet.cash >= costo + feeBuy`.
  `pnl = r2(ingreso - costo - feeBuy - feeSell)`;
  `wallet.cash = r2(wallet.cash + pnl)`; `wallet.realized = r2(wallet.realized + pnl)`.
- **Abrir posición (`open`)**: `notional = r2(qty*price)`, `feeOpen`.
  Requiere `wallet.cash >= notional + feeOpen`.
  `wallet.cash -= (notional + feeOpen)`; `wallet.locked += notional`.
- **Cerrar posición (`close`)** al precio `P`, `feeClose = r2(qty*P*FEE)`:
  - largo: `devuelto = r2(qty*P)`
  - corto: `devuelto = r2(notional + (entryPrice - P)*qty)` (nunca negativo: `Math.max(0, …)`)
  `wallet.cash = r2(wallet.cash + devuelto - feeClose)`; `wallet.locked = r2(wallet.locked - notional)`;
  `pnl = r2(devuelto - notional - feeOpen - feeClose)`; `wallet.realized = r2(wallet.realized + pnl)`.
- **P&L no realizado** de una posición abierta al precio `P`:
  largo `r2((P - entryPrice)*qty - feeOpen)`; corto `r2((entryPrice - P)*qty - feeOpen)`.
- **Equity** = `r2(cash + locked + Σ unrealized)`.
- Formato: `fmtUSD(v) = "$" + new Intl.NumberFormat("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)`
  → `$100.000,00` (los tests buscan la subcadena `100.000`).
  Cantidades: hasta 3 decimales, `fmtQty`.

### 6.5 CSV
- Separador `;`, salto `\r\n`, BOM `﻿` al inicio (Excel es-ES).
- Cabecera operaciones: `fecha;tipo;ruta_o_mercado;lado;cantidad;precio_compra;precio_venta;comision;pnl;saldo_despues`
- Cabecera solicitudes: `fecha;nombre;email;perfil;mensaje;consentimiento`
- **Antiinyección de fórmulas**: si un campo empieza por `= + - @ TAB CR`, se prefija con `'`.
  Comillas dobles escapadas duplicándolas y campo entre comillas si contiene `;`, `"` o salto.
- Descarga: `Blob` + `URL.createObjectURL` + `<a download="operaciones-YYYY-MM-DD.csv">` + `click()`
  + `revokeObjectURL` en `setTimeout(...,1000)`. Después, toast “CSV generado (N filas)”.
  Si no hay filas: toast “No hay datos que exportar” (y NO se descarga nada).

---

## 7. NOTAS PARA LOS AGENTES 2–9

- **Marca (2):** no hay logo en el briefing → **emblema SVG inline** geométrico (lingote/onda o
  monograma abstracto) + wordmark tipográfico con `CONFIG.BUSINESS_NAME`. Tema oscuro tipo
  “terminal financiera” (fondo profundo, acento dorado) es coherente con el producto; obligatorio
  contraste AA (≥ 4,5:1 texto normal) y que verde/rojo se distingan también por texto e icono.
  Tipografía: stack del sistema + una monoespaciada del sistema para las cifras
  (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`). **Cero fuentes externas.**
- **UX (3):** mobile-first 390 px; tablas con `overflow-x:auto` + `tabindex="0"` + `caption`;
  estados vacíos, de error y de carga definidos; el modal atrapa el foco, cierra con `Esc` y con
  su botón Cancelar; toque mínimo 44×44 px; skip link al `#view`.
- **Copy (4):** puede reescribir TODO menos los **textos de contrato** (§8). Contenido real:
  qué es el arbitraje cripto-oro, por qué existen los spreads, qué es PAXG/XAUT, por qué esto es
  una simulación. Tono claro, sin promesas de rentabilidad, sin “lorem ipsum”.
- **Frontend (5):** un `<main id="view">` que se repinta por ruta; render por funciones que
  devuelven string con `esc()` en TODO dato de usuario, o `textContent` para celdas de tablas.
- **Datos (6):** implementar §6 exactamente; pasar el verificador antes de entregar.
- **Seguridad (7):** sin `innerHTML` con datos de usuario sin `esc()`; sin `eval`/`new Function`;
  sin scripts externos; `rel="noopener noreferrer"` en `target="_blank"`; CSV saneado; validar
  todo lo que sale de localStorage; recordar en la interfaz que `ADMIN_PASSWORD` es un cerrojo
  visible en el código, no seguridad real.
- **Rendimiento (8):** un solo archivo, cero peticiones, un único `setInterval` de 1 s, repintado
  parcial (solo las tablas afectadas), `content-visibility` donde ayude, SVG sparklines de 20
  puntos como máximo.
- **Accesibilidad (9):** `lang="es"`, `label` real para cada campo, errores con `role="alert"` y
  `aria-describedby`, pestañas con `role="tablist"/"tab"/"tabpanel"`, `aria-pressed` en el
  interruptor, `prefers-reduced-motion`, foco visible, tabla de precios con `scope="col"`.

---

## 8. TEXTOS DE CONTRATO (no cambiar sin actualizar los tests)

`Simulación con dinero ficticio` · `no es asesoramiento financiero` · `mercados vigilados` ·
`Precios actualizados` · `Ganancia` · `Pérdida` · `Ajustado` · `oportunidades detectadas` ·
`Beneficio neto estimado` · `Ejecutar arbitraje` · `Arbitraje ejecutado` ·
`Introduce una cantidad mayor que 0` · `Cantidad máxima por operación: 1000` ·
`Saldo insuficiente para esta operación` · `Operación ejecutada` · `Posiciones abiertas (0)` ·
`Posiciones abiertas (1)` · `Corto` · `Cerrar posición` · `Posición cerrada` · `P&L realizado` ·
`Todavía no hay operaciones` · `Exportar CSV` · `CSV generado` · `Reiniciar simulación` ·
`Sí, reiniciar todo` · `Simulación reiniciada` · `El nombre es obligatorio` ·
`Escribe un email válido` · `Debes aceptar la política de privacidad` · `Solicitud registrada` ·
`Aviso legal y privacidad` · `Responsable del tratamiento` · `dinero ficticio` ·
`pantalla de inicio` · `Entendido` · `Escribe la contraseña` · `Contraseña incorrecta` ·
`Panel del dueño` · `Contraseña actualizada` · `La contraseña actual no es correcta` ·
`Sí, borrar todo` · `Datos borrados` · `En modo archivo local siempre se usan precios simulados` ·
`Diseñado por Incuba tu Negocio · por Jaime M. M.`

---

## 9. SUPUESTOS

1. El nombre “ArbitrageGold” viene del briefing marcado como placeholder → se usa tal cual con
   comentario para cambiarlo. No se inventa logo ni claim de marca.
2. Sin backend no hay precios reales fiables ni cobros: el motor por defecto es **simulado
   determinista** y la interfaz lo dice en todas las pantallas (badge + cinta de aviso). El
   interruptor de “precios en vivo” queda preparado para cuando la app se sirva por https.
3. Los datos son **por dispositivo/navegador**: el “resumen de operaciones de usuarios” del panel
   de admin es el de las operaciones registradas en ESE navegador; se explica en el panel. Un
   panel multiusuario real exige backend (fuera de alcance).
4. La app no es un servicio financiero regulado: solo simulación educativa. Se incluye aviso de
   riesgo y de “no asesoramiento financiero” en portada, simulador y legal.
5. Capital inicial 100.000 $ ficticios, comisión 0,1 % por pata, umbral de alerta 0,30 % neto:
   valores del briefing o razonables y configurables en `CONFIG`.
6. Único dato personal recogido: el del formulario voluntario de `#/acceso` (nombre, email,
   perfil, mensaje) con consentimiento obligatorio y guardado solo local. Sin cookies ni tracking.
7. Idioma: español (es-ES), moneda de referencia USD (los pares cripto-oro cotizan en USD/USDT).

---

## 10. DATOS QUE FALTAN (confirmar con el cliente)

1. **Nombre y marca definitivos** (el briefing dice que “ArbitrageGold” es placeholder) y logo.
2. **Email de contacto** y **WhatsApp/teléfono** → `CONFIG.CONTACT_EMAIL` y `CONFIG.WHATSAPP`
   vacíos; mientras estén vacíos no se pintan esos botones.
3. **Titular legal**: nombre/razón social, NIF/CIF, dirección fiscal, país
   (`[NOMBRE DEL TITULAR]`, `[NIF/CIF]`, `[DIRECCIÓN FISCAL]`) para privacidad y aviso legal.
4. **Contraseña de admin definitiva** (por defecto `oro-demo-2026`, hay que cambiarla).
5. **URL real del estudio** para la firma del pie (`STUDIO_URL` es un placeholder).
6. ¿Se va a **publicar en https** (dominio) para PWA instalable y para intentar precios en vivo?
7. ¿Qué **APIs públicas** exactas se autorizan (Binance, Kraken, proveedor del índice de oro) y
   si aceptan CORS sin clave? Sin esto, el modo en vivo queda desactivado.
8. **Precio base del oro** de referencia (`BASE_GOLD_USD: 2400`) y si se quieren más pares
   (p. ej. XAUT/EUR, oro tokenizado adicional).
9. ¿Habrá **versión pro monetizada** (precio, qué incluye) para que el copy del embudo `#/acceso`
   prometa lo correcto?
10. ¿Se requiere **aviso de riesgo específico** exigido por su asesoría legal (texto propio)?

---

## 11. BLOQUE DE TESTS DE ACEPTACIÓN (embébelo tal cual en el HTML final)

> El verificador limpia `localStorage` y recarga antes de CADA test: todos son independientes.
> Contraseña usada: la de `CONFIG.ADMIN_PASSWORD` (`oro-demo-2026`); si el agente la cambia, hay
> que cambiarla también aquí.

```html
<script type="application/json" id="acceptance-tests">
[
  { "name": "C1 · Portada con aviso de riesgo y CTA", "steps": [
    { "goto": "#/" },
    { "expect": "Simulación con dinero ficticio" },
    { "expect": "no es asesoramiento financiero" },
    { "expectVisible": "#cta-arbitraje" },
    { "expect": "Diseñado por Incuba tu Negocio · por Jaime M. M." }
  ]},
  { "name": "C2-C3 · 5 mercados y refresco manual de precios", "steps": [
    { "goto": "#/arbitraje" },
    { "expectVisible": "#marketTable" },
    { "expect": "PAXG" },
    { "expect": "XAUT" },
    { "expect": "Binance" },
    { "expect": "Kraken" },
    { "expect": "mercados vigilados" },
    { "expectVisible": "#refreshCountdown" },
    { "click": "#btnRefresh" },
    { "expect": "Precios actualizados" }
  ]},
  { "name": "C4 · Spreads calculados y coloreados (ganancia y pérdida)", "steps": [
    { "goto": "#/arbitraje" },
    { "expectVisible": "#arbTable" },
    { "expectVisible": ".spread-up" },
    { "expectVisible": ".spread-down" },
    { "expect": "Ganancia" },
    { "expect": "Pérdida" }
  ]},
  { "name": "C5 · El detector muestra oportunidades", "steps": [
    { "goto": "#/arbitraje" },
    { "expectVisible": "#alertBanner" },
    { "expect": "oportunidades detectadas" },
    { "expectVisible": "#alertList" }
  ]},
  { "name": "C6 · Arbitraje en 1 clic se ejecuta y queda en el historial", "steps": [
    { "goto": "#/arbitraje" },
    { "click": "#arb-op-0" },
    { "expectVisible": "#arbModal" },
    { "expect": "Beneficio neto estimado" },
    { "click": "#btnArbConfirm" },
    { "expect": "Arbitraje ejecutado" },
    { "expectGone": "#arbModal" },
    { "goto": "#/historial" },
    { "expect": "Arbitraje" }
  ]},
  { "name": "C6b · El modal de arbitraje se cancela sin operar", "steps": [
    { "goto": "#/arbitraje" },
    { "click": "#arb-op-1" },
    { "expectVisible": "#arbModal" },
    { "click": "#btnArbCancel" },
    { "expectGone": "#arbModal" },
    { "goto": "#/historial" },
    { "expect": "Todavía no hay operaciones" }
  ]},
  { "name": "C7 · El simulador exige cantidad", "steps": [
    { "goto": "#/simulador" },
    { "submit": "#tradeForm" },
    { "expect": "Introduce una cantidad mayor que 0" },
    { "expect": "Posiciones abiertas (0)" }
  ]},
  { "name": "C8 · El simulador rechaza saldo insuficiente", "steps": [
    { "goto": "#/simulador" },
    { "fill": { "sel": "#trade-qty", "value": "500" } },
    { "submit": "#tradeForm" },
    { "expect": "Saldo insuficiente para esta operación" },
    { "expect": "Posiciones abiertas (0)" }
  ]},
  { "name": "C9-C11 · Compra, P&L y cierre de posición", "steps": [
    { "goto": "#/simulador" },
    { "fill": { "sel": "#trade-qty", "value": "1" } },
    { "submit": "#tradeForm" },
    { "expect": "Operación ejecutada" },
    { "expect": "Posiciones abiertas (1)" },
    { "expectVisible": "#posTable" },
    { "click": "#pos-close-0" },
    { "expect": "Posición cerrada" },
    { "expect": "Posiciones abiertas (0)" },
    { "expect": "P&L realizado" }
  ]},
  { "name": "C10 · Venta en corto", "steps": [
    { "goto": "#/simulador" },
    { "fill": { "sel": "#trade-side", "value": "short" } },
    { "fill": { "sel": "#trade-qty", "value": "1" } },
    { "submit": "#tradeForm" },
    { "expect": "Operación ejecutada" },
    { "expect": "Corto" }
  ]},
  { "name": "C12 · El historial persiste tras recargar", "steps": [
    { "goto": "#/simulador" },
    { "fill": { "sel": "#trade-qty", "value": "1" } },
    { "submit": "#tradeForm" },
    { "expect": "Operación ejecutada" },
    { "goto": "#/historial" },
    { "expect": "PAXG" },
    { "reload": true },
    { "goto": "#/historial" },
    { "expect": "PAXG" }
  ]},
  { "name": "C13 · Export CSV del historial", "steps": [
    { "goto": "#/simulador" },
    { "fill": { "sel": "#trade-qty", "value": "1" } },
    { "submit": "#tradeForm" },
    { "goto": "#/historial" },
    { "click": "#btnExportMyOps" },
    { "expect": "CSV generado" }
  ]},
  { "name": "C14 · Reiniciar simulación con doble confirmación", "steps": [
    { "goto": "#/simulador" },
    { "fill": { "sel": "#trade-qty", "value": "1" } },
    { "submit": "#tradeForm" },
    { "expect": "Posiciones abiertas (1)" },
    { "click": "#btnReset" },
    { "expectVisible": "#resetConfirm" },
    { "expect": "Sí, reiniciar todo" },
    { "click": "#btnResetYes" },
    { "expect": "Simulación reiniciada" },
    { "expect": "Posiciones abiertas (0)" },
    { "expect": "100.000" }
  ]},
  { "name": "C15 · Solicitud de acceso: valida y guarda", "steps": [
    { "goto": "#/acceso" },
    { "submit": "#accesoForm" },
    { "expect": "El nombre es obligatorio" },
    { "fill": { "sel": "#acceso-nombre", "value": "Ana" } },
    { "fill": { "sel": "#acceso-email", "value": "ana-no-valido" } },
    { "submit": "#accesoForm" },
    { "expect": "Escribe un email válido" },
    { "fill": { "sel": "#acceso-email", "value": "ana@mail.com" } },
    { "submit": "#accesoForm" },
    { "expect": "Debes aceptar la política de privacidad" },
    { "check": "#acceso-consent" },
    { "submit": "#accesoForm" },
    { "expect": "Solicitud registrada" }
  ]},
  { "name": "C16 · Legal desde el pie con placeholders del titular", "steps": [
    { "goto": "#/" },
    { "click": "#foot-legal" },
    { "expectHash": "#/legal" },
    { "expect": "Responsable del tratamiento" },
    { "expect": "Aviso legal" },
    { "expect": "dinero ficticio" },
    { "expect": "[NOMBRE DEL TITULAR]" }
  ]},
  { "name": "C17 · Navegación principal", "steps": [
    { "goto": "#/" },
    { "click": "#nav-arbitraje" },
    { "expectHash": "#/arbitraje" },
    { "expect": "Panel de arbitraje" },
    { "click": "#nav-simulador" },
    { "expectHash": "#/simulador" },
    { "expect": "Simulador de trading" },
    { "click": "#nav-historial" },
    { "expectHash": "#/historial" },
    { "expect": "Historial de operaciones" },
    { "click": "#nav-home" },
    { "expectHash": "#/" }
  ]},
  { "name": "C18 · Instalar app muestra instrucciones", "steps": [
    { "goto": "#/" },
    { "click": "#btnInstall" },
    { "expectVisible": "#installModal" },
    { "expect": "pantalla de inicio" },
    { "click": "#installClose" },
    { "expectGone": "#installModal" }
  ]},
  { "name": "C20 · Contraseña incorrecta no abre el panel", "steps": [
    { "goto": "#/admin" },
    { "submit": "#adminLoginForm" },
    { "expect": "Escribe la contraseña" },
    { "fill": { "sel": "#adm-pass", "value": "loquesea" } },
    { "submit": "#adminLoginForm" },
    { "expect": "Contraseña incorrecta" },
    { "expectGone": "#adminPanel" }
  ]},
  { "name": "C21-C22 · El dueño entra, ve operaciones y exporta CSV", "steps": [
    { "goto": "#/simulador" },
    { "fill": { "sel": "#trade-qty", "value": "1" } },
    { "submit": "#tradeForm" },
    { "expect": "Operación ejecutada" },
    { "goto": "#/admin" },
    { "fill": { "sel": "#adm-pass", "value": "oro-demo-2026" } },
    { "submit": "#adminLoginForm" },
    { "expect": "Panel del dueño" },
    { "expectVisible": "#adminPanel" },
    { "click": "#tab-ops" },
    { "expect": "PAXG" },
    { "click": "#btnExportOps" },
    { "expect": "CSV generado" }
  ]},
  { "name": "C23 · El dueño ve las solicitudes de acceso", "steps": [
    { "goto": "#/acceso" },
    { "fill": { "sel": "#acceso-nombre", "value": "Ana" } },
    { "fill": { "sel": "#acceso-email", "value": "ana@mail.com" } },
    { "check": "#acceso-consent" },
    { "submit": "#accesoForm" },
    { "expect": "Solicitud registrada" },
    { "goto": "#/admin" },
    { "fill": { "sel": "#adm-pass", "value": "oro-demo-2026" } },
    { "submit": "#adminLoginForm" },
    { "click": "#tab-leads" },
    { "expect": "ana@mail.com" }
  ]},
  { "name": "C24 · El dueño cambia la contraseña y entra con la nueva", "steps": [
    { "goto": "#/admin" },
    { "fill": { "sel": "#adm-pass", "value": "oro-demo-2026" } },
    { "submit": "#adminLoginForm" },
    { "click": "#tab-config" },
    { "fill": { "sel": "#adm-cur", "value": "oro-demo-2026" } },
    { "fill": { "sel": "#adm-new", "value": "clave-nueva-2026" } },
    { "fill": { "sel": "#adm-new2", "value": "clave-nueva-2026" } },
    { "submit": "#adminPassForm" },
    { "expect": "Contraseña actualizada" },
    { "click": "#btnAdminLogout" },
    { "fill": { "sel": "#adm-pass", "value": "oro-demo-2026" } },
    { "submit": "#adminLoginForm" },
    { "expect": "Contraseña incorrecta" },
    { "fill": { "sel": "#adm-pass", "value": "clave-nueva-2026" } },
    { "submit": "#adminLoginForm" },
    { "expect": "Panel del dueño" }
  ]},
  { "name": "C25 · Contraseña actual equivocada no cambia nada", "steps": [
    { "goto": "#/admin" },
    { "fill": { "sel": "#adm-pass", "value": "oro-demo-2026" } },
    { "submit": "#adminLoginForm" },
    { "click": "#tab-config" },
    { "fill": { "sel": "#adm-cur", "value": "otra-cosa" } },
    { "fill": { "sel": "#adm-new", "value": "clave-nueva-2026" } },
    { "fill": { "sel": "#adm-new2", "value": "clave-nueva-2026" } },
    { "submit": "#adminPassForm" },
    { "expect": "La contraseña actual no es correcta" }
  ]},
  { "name": "C26 · Borrar todos los datos con doble confirmación", "steps": [
    { "goto": "#/simulador" },
    { "fill": { "sel": "#trade-qty", "value": "1" } },
    { "submit": "#tradeForm" },
    { "goto": "#/admin" },
    { "fill": { "sel": "#adm-pass", "value": "oro-demo-2026" } },
    { "submit": "#adminLoginForm" },
    { "click": "#tab-config" },
    { "click": "#btnWipe" },
    { "expectVisible": "#wipeConfirm" },
    { "expect": "Sí, borrar todo" },
    { "click": "#btnWipeYes" },
    { "expect": "Datos borrados" },
    { "click": "#tab-ops" },
    { "expect": "Todavía no hay operaciones" }
  ]},
  { "name": "C27 · Interruptor de precios en vivo con nota", "steps": [
    { "goto": "#/admin" },
    { "fill": { "sel": "#adm-pass", "value": "oro-demo-2026" } },
    { "submit": "#adminLoginForm" },
    { "click": "#tab-config" },
    { "click": "#btnLive" },
    { "expect": "En modo archivo local siempre se usan precios simulados" }
  ]},
  { "name": "C28 · El panel pide contraseña otra vez tras recargar", "steps": [
    { "goto": "#/admin" },
    { "fill": { "sel": "#adm-pass", "value": "oro-demo-2026" } },
    { "submit": "#adminLoginForm" },
    { "expect": "Panel del dueño" },
    { "reload": true },
    { "goto": "#/admin" },
    { "expectVisible": "#adminLoginForm" },
    { "expectGone": "#adminPanel" }
  ]}
]
</script>
```

### Nota de unicidad de textos (para que `clickText` y `expect` no se confundan)
- Ningún botón de cierre de modal lleva el texto “Cerrar”: usan “Cancelar”, “Entendido” o un `×`
  con `aria-label="Cerrar ventana"`. Solo las posiciones tienen “Cerrar posición”.
- “Exportar CSV” aparece en historial y admin, pero los tests usan **IDs**, no texto.
- “Posiciones abiertas (N)” se pinta con ese formato exacto, con el número entre paréntesis.
- El estado vacío del historial dice literalmente “Todavía no hay operaciones” y se usa también en
  la pestaña Operaciones del admin.
