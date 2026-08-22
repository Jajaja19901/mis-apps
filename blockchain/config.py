"""
config.py — Parámetros de TU MONEDA. Cambia estos valores y tienes otra moneda.
Todas las cantidades internas se guardan en la unidad más pequeña ("centimillonésimas"),
igual que Bitcoin usa satoshis, para no tener errores de decimales.
"""

COIN_NAME   = "Tu Moneda"     # nombre (placeholder — cámbialo)
COIN_TICKER = "TMC"           # símbolo (placeholder)

DECIMALS = 8                  # 8 decimales, como Bitcoin
COIN = 10 ** DECIMALS         # 1 TMC = 100.000.000 unidades base

# --- Política monetaria (suministro máximo ≈ 100.000.000 TMC) ---
# Recompensa inicial por bloque minado; se reduce a la mitad cada HALVING_BLOCKS.
# La suma total de todas las recompensas tiende a: REWARD * HALVING_BLOCKS * 2
INITIAL_BLOCK_REWARD = 50 * COIN     # 50 TMC por bloque al principio
HALVING_BLOCKS       = 1_000_000     # cada millón de bloques se reduce a la mitad
MAX_SUPPLY           = 100_000_000 * COIN   # tope duro: 100 millones de TMC

# --- Comisiones: CASI GRATIS a propósito ---
# Comisión mínima por transacción (va al minero). Ridículamente baja.
MIN_FEE = 1000                        # 0,00001 TMC  (una cienmilésima)

# --- Minado (Proof of Work) ---
# Dificultad = nº de ceros hexadecimales al principio del hash del bloque.
# 4 es rápido para pruebas; súbelo para hacerlo más difícil.
DIFFICULTY = 4
TARGET_BLOCK_SECONDS = 30             # ritmo objetivo (informativo en el prototipo)

# --- Red ---
GENESIS_TIMESTAMP = 1735689600        # fecha fija del bloque génesis (1-ene-2025)
GENESIS_MESSAGE = "Tu Moneda nace libre: transferencias casi gratis para todos."


def to_coin(units: int) -> float:
    """Convierte unidades base a TMC (para mostrar)."""
    return units / COIN


def from_coin(amount) -> int:
    """Convierte TMC a unidades base (para guardar)."""
    return int(round(float(amount) * COIN))


def block_reward(height: int) -> int:
    """Recompensa de minado en la altura dada, con halvings."""
    halvings = height // HALVING_BLOCKS
    if halvings >= 64:
        return 0
    return INITIAL_BLOCK_REWARD >> halvings
