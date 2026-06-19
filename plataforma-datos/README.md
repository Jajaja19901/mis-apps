# Plataforma de datos *consent-first* (B2B)

Plataforma que vende a agencias **reportes estadísticos anónimos y agregados**
(k-anonimato ≥ 50, nunca datos individuales) construidos **solo** con datos de
usuarios que **consienten expresamente** la venta y **cobran el 30%** de los
ingresos que generan. Reparto **30% usuarios / 70% plataforma**.

> ⚠️ **NO está lista para producción.** Es un esqueleto sólido y probado, pero
> antes de tratar datos reales o cobrar hace falta: cuentas reales de Cloudflare
> y Stripe, **abogado/DPO + DPIA aprobada**, y cerrar los pendientes de seguridad
> (ver `docs/roadmap.md`, Fase 0 y Fase 7). Esto **no es asesoramiento jurídico**.

## Principio de oro
Todo dato entra **bajo consentimiento activo y revocable**. No se importan bases
externas sin consentimiento; el panel admin **rechaza** lo que no lo tenga (no lo
"blanquea"). Las **categorías especiales del art. 9** (salud, etc.) están
prohibidas a nivel de esquema (`CHECK es_especial = 0`).

## Estructura
```
plataforma-datos/
├─ db/schema.sql            Esquema D1 (consentimiento, k≥50 por CHECK, auditoría)
├─ src/
│  ├─ k-anonimato.mjs       Motor de agregación k≥50 (+ tests)
│  ├─ worker-reportes.mjs   API de catálogo/preview/reportes (+ tests)
│  ├─ worker-pagos.mjs      Cobro Stripe + webhook
│  ├─ reparto-mensual.mjs   Reparto 30/70 mensual, mayor resto (+ tests)
│  └─ worker-admin.mjs      API de cumplimiento (validación, auditoría, KYC)
├─ web/
│  ├─ landing.html          Captación de agencias
│  ├─ dashboard-agencia.html Compra de reportes (modo demo incluido)
│  └─ admin.html            Panel interno de cumplimiento (modo demo)
├─ wrangler.toml            Bindings D1/R2/KV + cron del reparto
└─ docs/                    arquitectura, contrato API, cumplimiento, contratos,
                            pagos, roadmap y manuales
```

## Estado y pruebas
Lógica crítica cubierta por **tests sin red** (corren con Node, sin dependencias):

```bash
node plataforma-datos/src/k-anonimato.test.mjs        # 7/7
node plataforma-datos/src/worker-reportes.test.mjs    # 9/9
node plataforma-datos/src/reparto-mensual.test.mjs    # 20/20
```

| Pieza | Estado |
|---|---|
| Esquema D1 + garantías a nivel BD | ✅ |
| Motor k-anonimato (k≥50, supresión robusta) | ✅ 7/7 |
| Motor de reportes (catálogo/preview/reportes) | ✅ 9/9 |
| Pagos Stripe + reparto 30/70 mensual | ✅ 20/20 |
| Panel admin de cumplimiento | ✅ |
| Landing + dashboard de agencia | ✅ |
| Auditoría de seguridad + correcciones críticas | ✅ |
| Ingesta consent-first (contribuciones/derechos) | ⏳ Fase 2 |
| Compra asíncrona Stripe ↔ reporte | ⏳ Fase 4 |
| Tokens de agencia (no usar `agencia_id`), binning preview | ⏳ Fase 7 |
| Legal: DPIA, DPO, DPAs, revisión abogado | ⏳ Fase 0 |

## Cómo se despliega (resumen)
1. `wrangler d1 execute <DB> --file=db/schema.sql`
2. Configurar bindings de `wrangler.toml` (D1, R2, KV) y **secretos**:
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_TOKEN`, `HMAC_REPORTE`.
   *(Sin `ADMIN_TOKEN`, el Worker de admin queda deshabilitado a propósito.)*
3. `wrangler deploy` cada Worker. Probar **primero en modo TEST de Stripe**.

Ver `docs/roadmap.md` para el plan por fases y `docs/cumplimiento-legal.md` para
el checklist legal.
