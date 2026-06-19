# Informe de seguridad — `apps/mis-datos.html`

**Modo:** auditoría estática (sin ejecución), revisor con poder de veto.
**Veredicto:** ✅ **APTO — veto LEVANTADO.** 0 CRÍTICOS · 0 ALTOS.

## Resumen
La defensa XSS está bien construida: existe `esc()` (L469-473, escapa `& < > " '`) y **todo**
dato dinámico que llega a `innerHTML` pasa por `esc()`, `eur()` (numérico) o `fmtDate()`. El
router no inyecta el hash crudo en el DOM (se usa solo como clave en `ROUTES`). El export CSV
tiene guarda anti-fórmula. El gate de admin no es trivialmente puenteable y el panel no se
renderiza sin sesión válida.

### Trazado de entradas de usuario
- **alias** (entra L921, `slice(0,40)`) → repintado en L880/L903 con `esc()`. ESCAPADO.
- **email** (entra L922, regex L923, `slice(0,120)`) → L907 con `esc()`. ESCAPADO + validado.
- **nombre de cliente** (admin, L1415, `slice(0,60)`) → L1316/1318/1121 con `esc()`, CSV con `safe()`. ESCAPADO.
- **location.hash** → solo clave en `ROUTES`; desconocido cae a `notfound`. SEGURO.
- **localStorage malicioso preexistente** → se repinta por las mismas `view*` que escapan. SEGURO por diseño.

### Los 6 `innerHTML` (L559, 631, 637, 812, 813, 1398)
Todos seguros: reciben salidas ya escapadas con `esc()`, contenido estático, o números (`eur`).

## Hallazgos no bloqueantes
- **MEDIO M1 — `fillLegal()` (L1291):** el catch-all de placeholders `[...]` corre DESPUÉS de
  sustituir valores de `CONFIG.LEGAL` ya escapados. Inofensivo hoy (CONFIG lo controla el dueño);
  recomendación: aplicar el catch-all ANTES, o documentar "sin corchetes en CONFIG.LEGAL".
- **BAJO B1 — `ADMIN_PASSWORD` en claro (L347):** by-design en MVP sin backend, ya documentado
  como "no es seguridad real". Comparación `===` (L1391) no puenteable; panel protegido por `isAdmin()`.
- **BAJO B2 — rate-limit del gate (L1387):** cosmético (`sessionStorage`), aceptable en MVP.
- **BAJO B3 — `target="_blank"`:** todos con `rel="noopener"`/`noreferrer`. OK.
- **BAJO B4 — `JSON.parse`:** todos con try/catch. Robusto en modo privado. OK.
- **BAJO B5 — sin código peligroso:** cero `eval`, `Function`, `document.write`, `javascript:`, handlers `on*` dinámicos.
- **BAJO B6 — inyección CSV mitigada (L1445):** antepone `'` a celdas que empiezan por `= + - @` y duplica comillas. OK.

## Acción recomendada (director)
Solo opcional: M1 en `fillLegal()`. Nada bloquea la entrega.
