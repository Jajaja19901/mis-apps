"""
ecc.py — Criptografía de curva elíptica secp256k1 (la MISMA que usa Bitcoin),
escrita en Python puro, SIN librerías externas.

Sirve para lo esencial de una moneda: crear un par de claves (privada/pública),
firmar una transacción con la privada y que cualquiera la verifique con la pública.
Nadie puede gastar tus monedas sin tu clave privada.

Es didáctico y correcto, pero NO optimizado ni auditado: no lo uses para guardar
dinero real serio sin una auditoría criptográfica profesional.
"""
import hashlib
import secrets

# ---- Parámetros oficiales de la curva secp256k1 (y^2 = x^3 + 7 mod p) ----
P  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
A  = 0
B  = 7
Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
N  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G  = (Gx, Gy)


def _inv(x, m):
    """Inverso modular (Python 3.8+ permite pow con exponente -1)."""
    return pow(x, -1, m)


def _point_add(p1, p2):
    """Suma de dos puntos de la curva. None representa el 'punto en el infinito'."""
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and (y1 + y2) % P == 0:
        return None  # se anulan
    if p1 == p2:
        # duplicación de punto
        m = (3 * x1 * x1 + A) * _inv(2 * y1, P) % P
    else:
        m = (y2 - y1) * _inv(x2 - x1, P) % P
    x3 = (m * m - x1 - x2) % P
    y3 = (m * (x1 - x3) - y1) % P
    return (x3, y3)


def _point_mul(k, point):
    """Multiplicación escalar k*point (doblar-y-sumar)."""
    result = None
    addend = point
    while k:
        if k & 1:
            result = _point_add(result, addend)
        addend = _point_add(addend, addend)
        k >>= 1
    return result


# ------------------------------ Claves ------------------------------

def new_private_key():
    """Genera una clave privada aleatoria segura (un número en [1, N-1])."""
    return secrets.randbelow(N - 1) + 1


def private_to_public(priv):
    """Deriva la clave pública (un punto de la curva) desde la privada."""
    return _point_mul(priv, G)


def compress_public(pub):
    """Clave pública comprimida (33 bytes en hex): prefijo 02/03 + x."""
    x, y = pub
    prefix = b"\x02" if y % 2 == 0 else b"\x03"
    return (prefix + x.to_bytes(32, "big")).hex()


def decompress_public(pub_hex):
    """Recupera el punto (x, y) desde la clave pública comprimida en hex."""
    raw = bytes.fromhex(pub_hex)
    prefix, x = raw[0], int.from_bytes(raw[1:], "big")
    y2 = (pow(x, 3, P) + B) % P
    y = pow(y2, (P + 1) // 4, P)  # raíz cuadrada modular (p ≡ 3 mod 4)
    if y % 2 != (0 if prefix == 2 else 1):
        y = P - y
    return (x, y)


# ------------------------------ Firma ------------------------------

def _hash_int(message: bytes) -> int:
    return int.from_bytes(hashlib.sha256(message).digest(), "big")


def sign(message: bytes, priv: int):
    """Firma un mensaje con la clave privada. Devuelve (r, s)."""
    z = _hash_int(message)
    while True:
        k = secrets.randbelow(N - 1) + 1
        x, _ = _point_mul(k, G)
        r = x % N
        if r == 0:
            continue
        s = (_inv(k, N) * (z + r * priv)) % N
        if s == 0:
            continue
        # normaliza s a la mitad baja (evita maleabilidad de firma)
        if s > N // 2:
            s = N - s
        return (r, s)


def verify(message: bytes, signature, pub_hex: str) -> bool:
    """Verifica una firma (r, s) contra la clave pública comprimida."""
    try:
        r, s = signature
        if not (1 <= r < N and 1 <= s < N):
            return False
        pub = decompress_public(pub_hex)
        z = _hash_int(message)
        w = _inv(s, N)
        u1 = (z * w) % N
        u2 = (r * w) % N
        point = _point_add(_point_mul(u1, G), _point_mul(u2, pub))
        if point is None:
            return False
        return (point[0] % N) == r
    except Exception:
        return False
