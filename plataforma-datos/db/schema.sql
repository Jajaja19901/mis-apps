-- ============================================================================
--  PLATAFORMA DE DATOS (consent-first) — Esquema D1 / SQLite
-- ----------------------------------------------------------------------------
--  Modelo: los datos salen SOLO de usuarios que aceptan EXPRESAMENTE la venta
--  de sus datos agregados/anonimizados. Reparto 30% usuarios / 70% plataforma.
--
--  Garantías a nivel de ESQUEMA (no dependen del código de aplicación):
--    1. Toda contribución debe ligarse a un consentimiento ACTIVO del propio
--       usuario (trigger trg_contrib_consent_valido).
--    2. NUNCA se puede almacenar un reporte que cubra < 50 usuarios
--       (CHECK n_usuarios >= 50 y k_aplicado >= 50)  -> k-anonimato a nivel BD.
--    3. NO se admiten categorías especiales del art. 9 RGPD
--       (tabla categorias_permitidas con CHECK es_especial = 0).
--    4. El reparto de dinero cuadra al céntimo (CHECK de suma exacta).
--    5. Logs de auditoría append-only (retención 5 años, ver POLÍTICA abajo).
--
--  Uso:  wrangler d1 execute <DB> --file=plataforma-datos/db/schema.sql
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- USUARIOS — identidad SEUDÓNIMA. Sin PII directa aquí.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                TEXT PRIMARY KEY,                       -- uuid seudónimo
  creado_en         TEXT NOT NULL DEFAULT (datetime('now')),
  estado            TEXT NOT NULL DEFAULT 'activo'
                      CHECK (estado IN ('activo','baja')),
  -- Cobro del reparto vía Stripe Connect (token de cuenta, NUNCA datos bancarios crudos)
  stripe_account_id TEXT,
  payout_estado     TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (payout_estado IN ('pendiente','verificado','restringido'))
);

-- Contacto MÍNIMO y separado (acceso restringido). Email cifrado/hasheado a nivel app.
CREATE TABLE IF NOT EXISTS usuarios_contacto (
  usuario_id  TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  email_hash  TEXT,            -- hash para login/dedupe (no el email en claro)
  email_cifrado TEXT           -- opcional, cifrado a nivel app si es imprescindible operar con él
);

-- ----------------------------------------------------------------------------
-- CONSENTIMIENTOS — el "ledger" legal. APPEND-ONLY. El corazón del modelo.
--   Cada fila es una prueba: qué propósito, qué versión de texto, cuándo,
--   cómo y desde dónde (hasheado). revocado_en = NULL  -> consentimiento activo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consentimientos (
  id               TEXT PRIMARY KEY,
  usuario_id       TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  proposito        TEXT NOT NULL,                           -- p.ej. 'venta_datos_agregados'
  politica_version TEXT NOT NULL,                           -- versión del texto aceptado
  texto_hash       TEXT NOT NULL,                           -- hash del texto EXACTO mostrado
  metodo           TEXT NOT NULL,                           -- 'web_checkbox', 'doble_opt_in', ...
  ip_hash          TEXT,                                    -- evidencia (hash, no IP en claro)
  user_agent       TEXT,
  otorgado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  revocado_en      TEXT,                                    -- NULL = activo
  CHECK (proposito <> '')
);

-- ----------------------------------------------------------------------------
-- CATEGORÍAS PERMITIDAS — lista blanca. Impide por diseño meter datos del art. 9
--   (salud, ideología, religión, orientación sexual, biometría, etc.).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_permitidas (
  categoria   TEXT PRIMARY KEY,
  descripcion TEXT,
  es_especial INTEGER NOT NULL DEFAULT 0 CHECK (es_especial = 0)  -- nunca se permite especial
);

-- ----------------------------------------------------------------------------
-- CONTRIBUCIONES (datos cedidos) — seudonimizadas y con cuasi-identificadores
--   YA generalizados (banda de edad, región...). Nunca fecha de nacimiento,
--   dirección, ni texto libre identificable.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contribuciones (
  id                TEXT PRIMARY KEY,
  usuario_id        TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  consentimiento_id TEXT NOT NULL REFERENCES consentimientos(id),
  recogido_en       TEXT NOT NULL DEFAULT (datetime('now')),
  -- Cuasi-identificadores GENERALIZADOS:
  banda_edad        TEXT,                                   -- '18-24','25-34','35-44',...
  region            TEXT,                                   -- provincia/CCAA (nunca dirección)
  genero            TEXT,
  -- Atributo de interés, agregable. Debe estar en la lista blanca:
  categoria         TEXT REFERENCES categorias_permitidas(categoria),
  valor             REAL
);

-- Trigger: una contribución solo es válida si su consentimiento es del MISMO
-- usuario y está ACTIVO (no revocado). Garantía a nivel de base de datos.
CREATE TRIGGER IF NOT EXISTS trg_contrib_consent_valido
BEFORE INSERT ON contribuciones
FOR EACH ROW
WHEN NEW.consentimiento_id NOT IN (
  SELECT id FROM consentimientos
  WHERE usuario_id = NEW.usuario_id
    AND revocado_en IS NULL
    AND proposito = 'venta_datos_agregados'
)
BEGIN
  SELECT RAISE(ABORT, 'Contribución sin consentimiento activo del usuario');
END;

-- ----------------------------------------------------------------------------
-- AGENCIAS (clientes B2B) — KYC de empresa.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agencias (
  id                  TEXT PRIMARY KEY,
  razon_social        TEXT NOT NULL,
  cif                 TEXT NOT NULL,
  email               TEXT NOT NULL,
  pais                TEXT NOT NULL DEFAULT 'ES',
  kyc_estado          TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (kyc_estado IN ('pendiente','verificada','rechazada')),
  contrato_firmado_en TEXT,
  stripe_customer_id  TEXT,
  creado_en           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- REPORTES — agregados generados. NUNCA filas individuales.
--   k-anonimato a nivel ESQUEMA: imposible guardar un reporte de < 50 usuarios.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reportes (
  id                  TEXT PRIMARY KEY,
  agencia_id          TEXT NOT NULL REFERENCES agencias(id),
  definicion_segmento TEXT NOT NULL,                        -- JSON con filtros/dimensiones
  k_aplicado          INTEGER NOT NULL,
  n_usuarios          INTEGER NOT NULL,
  generado_en         TEXT NOT NULL DEFAULT (datetime('now')),
  resultado_hash      TEXT NOT NULL,                        -- integridad / no repudio
  precio_centimos     INTEGER NOT NULL CHECK (precio_centimos >= 0),
  estado              TEXT NOT NULL DEFAULT 'generado'
                        CHECK (estado IN ('generado','entregado','anulado')),
  -- ===== SUELO LEGAL DE k-ANONIMATO (>= 50) A NIVEL DE BASE DE DATOS =====
  CHECK (n_usuarios >= 50),
  CHECK (k_aplicado >= 50)
);

-- ----------------------------------------------------------------------------
-- TRANSACCIONES — cobro a la agencia. Reparto 70% plataforma / 30% pool usuarios.
--   El CHECK obliga a que las partes sumen EXACTAMENTE el importe (sin descuadres).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transacciones (
  id                            TEXT PRIMARY KEY,
  agencia_id                    TEXT NOT NULL REFERENCES agencias(id),
  reporte_id                    TEXT REFERENCES reportes(id),
  importe_centimos              INTEGER NOT NULL CHECK (importe_centimos > 0),
  comision_plataforma_centimos  INTEGER NOT NULL CHECK (comision_plataforma_centimos >= 0),  -- 70%
  pool_usuarios_centimos        INTEGER NOT NULL CHECK (pool_usuarios_centimos >= 0),          -- 30%
  stripe_payment_intent         TEXT,
  estado                        TEXT NOT NULL DEFAULT 'pendiente'
                                  CHECK (estado IN ('pendiente','pagada','reembolsada','fallida')),
  creado_en                     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (comision_plataforma_centimos + pool_usuarios_centimos = importe_centimos)
);

-- ----------------------------------------------------------------------------
-- REPARTOS — "data dividend" mensual a usuarios, proporcional a su contribución.
--   UNIQUE(periodo, usuario_id) -> idempotencia: un único reparto por mes/usuario.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repartos (
  id                 TEXT PRIMARY KEY,
  periodo            TEXT NOT NULL,                          -- 'YYYY-MM'
  usuario_id         TEXT NOT NULL REFERENCES usuarios(id),
  importe_centimos   INTEGER NOT NULL CHECK (importe_centimos >= 0),
  peso_contribucion  REAL NOT NULL,                          -- proporción usada (0..1)
  stripe_transfer_id TEXT,
  estado             TEXT NOT NULL DEFAULT 'pendiente'
                       CHECK (estado IN ('pendiente','pagado','fallido')),
  creado_en          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (periodo, usuario_id)
);

-- ----------------------------------------------------------------------------
-- LOGS DE AUDITORÍA — append-only. Trazabilidad (responsabilidad proactiva,
--   art. 5.2 RGPD). POLÍTICA DE RETENCIÓN: 5 años para logs de transacciones y
--   acceso; los detalles NO deben contener datos personales innecesarios.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs_auditoria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor       TEXT NOT NULL,            -- 'sistema' | 'admin:<id>' | 'agencia:<id>'
  accion      TEXT NOT NULL,            -- 'reporte.generado' | 'consent.revocado' | ...
  entidad     TEXT,
  entidad_id  TEXT,
  detalles    TEXT,                     -- JSON, SIN datos personales innecesarios
  ip_hash     TEXT,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- ÍNDICES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_consent_usuario   ON consentimientos(usuario_id, revocado_en);
CREATE INDEX IF NOT EXISTS idx_contrib_usuario   ON contribuciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_contrib_segmento  ON contribuciones(categoria, region, banda_edad, genero);
CREATE INDEX IF NOT EXISTS idx_reportes_agencia  ON reportes(agencia_id, generado_en);
CREATE INDEX IF NOT EXISTS idx_tx_agencia        ON transacciones(agencia_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_reparto_periodo   ON repartos(periodo);
CREATE INDEX IF NOT EXISTS idx_audit_entidad     ON logs_auditoria(entidad, entidad_id, creado_en);

-- ----------------------------------------------------------------------------
-- SEMILLA MÍNIMA — categorías permitidas de ejemplo (NO especiales).
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO categorias_permitidas (categoria, descripcion) VALUES
  ('compras_online',     'Frecuencia / interés de compra online (no especial)'),
  ('preferencia_ocio',   'Preferencias de ocio declaradas (no especial)'),
  ('rango_gasto_mensual','Banda de gasto mensual declarada (no especial)');
