# Roadmap por fases — Plataforma de datos consent-first

> Fases de 1–2 semanas. Estado a fecha del último commit. Lo legal (Fase 0) corre
> **en paralelo desde el día 1** y es **bloqueante para el go-live**.

## Fase 0 — Legal y organizativo *(en paralelo, bloqueante)*
Responsable: dirección + abogado/DPO. **No se trata ni un dato real hasta cerrarla.**
- [ ] DPIA / EIPD (art. 35) y, si el riesgo residual es alto, consulta previa a la AEPD (art. 36).
- [ ] Nombrar DPD/DPO y comunicarlo a la AEPD (art. 37.7).
- [ ] RAT interno (art. 30). *(Recordatorio: ya NO existe el registro de ficheros en la AEPD.)*
- [ ] Revisión por abogado de los textos de consentimiento, política de privacidad y aviso legal.
- [ ] Firmar DPAs con Cloudflare y Stripe (+ SCC para transferencias).
- [ ] Alta fiscal del reparto a usuarios (consultar gestor: retenciones / modelos).
**Criterio de salida:** dictamen legal favorable + DPIA aprobada.

## Fase 1 — Cimientos ✅ HECHO
- [x] Esquema D1 con garantías a nivel de BD (k≥50 por CHECK, trigger de consentimiento, lista blanca art. 9, reparto cuadrado al céntimo, auditoría append-only).
- [x] Motor de k-anonimato (k≥50, supresión robusta). **7/7 tests.**
- [x] Contrato de API (`api-contrato.md`) y arquitectura (`arquitectura.md`).
**Criterio:** tests del motor en verde. ✅

## Fase 2 — Ingesta consent-first ⏳ PENDIENTE (backend)
- [ ] Worker de **contribuciones** (`/v1/contribuciones`): valida consentimiento ACTIVO antes de aceptar.
- [ ] Worker de **consentimiento** (`/v1/consentimientos`, alta + revocar) con doble opt-in.
- [ ] **Derechos** del usuario (`/v1/yo`, acceso/portabilidad/supresión).
- [ ] Integración con la app de consumo (proyecto 1) para el opt-in de venta.
**Criterio:** un usuario puede aceptar, contribuir, ver y revocar; nada entra sin consentimiento.

## Fase 3 — Catálogo y captación de agencias ✅/⏳
- [x] Landing B2B (`web/landing.html`) y dashboard de agencia (`web/dashboard-agencia.html`).
- [ ] Backend de **alta de agencia** (`/v1/agencias`) + flujo de KYC.
**Criterio:** una agencia se registra, pasa KYC y firma contrato antes de poder comprar.

## Fase 4 — Reportes ✅/⏳
- [x] Motor de reportes Worker (`/v1/segmentos`, `/v1/segmentos/preview`, `/v1/reportes`) con doble barrera k≥50, auditoría, R2. **9/9 tests.**
- [ ] **Reconciliar compra asíncrona** (contrato F.1: iniciar compra → Stripe → materializar tras webhook) con la generación actual (síncrona). *(Decisión de integración pendiente.)*
**Criterio:** una agencia compra → paga → recibe el agregado; nunca <50 ni datos individuales.

## Fase 5 — Pagos y reparto ✅/⏳
- [x] Cobro Stripe + webhook (firma, anti-replay, idempotencia, verifica importe). 
- [x] Reparto mensual 30/70 con mayor resto (suma exacta), idempotente, reintentos. **20/20 tests.**
- [ ] Probar en **modo TEST de Stripe** con cuentas Connect reales; configurar claves.
**Criterio:** un ciclo de cobro + reparto en modo test cuadra al céntimo.

## Fase 6 — Admin / cumplimiento ✅/⏳
- [x] Panel admin (`web/admin.html`) + Worker (`/v1/admin/*`): valida cargas (rechaza sin consentimiento), métricas sin PII, auditoría, derechos, KYC.
- [ ] Configurar `ADMIN_TOKEN` (secreto) y allowlist de IP.
**Criterio:** el panel hace cumplir (no eludir); todo acceso queda auditado.

## Fase 7 — Endurecimiento y QA final ⏳ PENDIENTE
- [ ] Sustituir el Bearer = `agencia_id` por **tokens opacos / JWT firmado** (ALTO de seguridad).
- [ ] Preview: **binning / privacidad diferencial** del recuento (además del rate-limit ya puesto).
- [ ] Afinar CSP, cabeceras y CORS; pen-test; backoff del reparto fuera del Worker (cola/cron robusto).
- [ ] QA E2E en navegador (incl. `tools/verificar-app.mjs` sobre las webs en modo demo).
- [ ] Revisión legal final y despliegue.
**Criterio:** pen-test sin críticos + dictamen legal + checklist de cumplimiento al 100%.
