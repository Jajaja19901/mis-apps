"""
wallet.py — Monedero: par de claves + dirección pública.

- La CLAVE PRIVADA es tu contraseña maestra: quien la tenga, controla tus monedas.
- La DIRECCIÓN es como tu número de cuenta: la puedes compartir para recibir.

La dirección se construye al estilo Bitcoin (base58 + checksum) para que, si
alguien la teclea mal, el propio sistema la rechace en vez de perder monedas.
"""
import hashlib
import json
import ecc

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
VERSION = b"\x35"  # hace que las direcciones tiendan a empezar por la letra del ticker


def _b58encode(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n > 0:
        n, r = divmod(n, 58)
        out = _B58[r] + out
    # cada byte 0x00 al principio se representa como '1'
    pad = len(raw) - len(raw.lstrip(b"\x00"))
    return "1" * pad + out


def _b58decode(s: str) -> bytes:
    n = 0
    for ch in s:
        n = n * 58 + _B58.index(ch)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    pad = len(s) - len(s.lstrip("1"))
    return b"\x00" * pad + raw


def public_to_address(pub_hex: str) -> str:
    """Dirección = base58check( VERSION + sha256(sha256(pubkey))[:20] )."""
    h = hashlib.sha256(hashlib.sha256(bytes.fromhex(pub_hex)).digest()).digest()[:20]
    payload = VERSION + h
    checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    return _b58encode(payload + checksum)


def is_valid_address(addr: str) -> bool:
    """Comprueba que la dirección es válida (checksum correcto)."""
    try:
        raw = _b58decode(addr)
        if len(raw) != 25:
            return False
        payload, checksum = raw[:-4], raw[-4:]
        good = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
        return checksum == good
    except Exception:
        return False


class Wallet:
    def __init__(self, priv=None):
        self.priv = priv if priv is not None else ecc.new_private_key()
        self.pub = ecc.private_to_public(self.priv)
        self.public_hex = ecc.compress_public(self.pub)
        self.address = public_to_address(self.public_hex)

    # -- persistencia sencilla en un archivo JSON --
    def save(self, path):
        with open(path, "w") as f:
            json.dump({"priv": hex(self.priv), "address": self.address,
                       "public_hex": self.public_hex}, f, indent=2)

    @classmethod
    def load(cls, path):
        with open(path) as f:
            data = json.load(f)
        return cls(int(data["priv"], 16))

    def sign(self, message: bytes):
        return ecc.sign(message, self.priv)


if __name__ == "__main__":
    w = Wallet()
    print("Clave privada (guárdala en secreto):", hex(w.priv))
    print("Dirección (compártela para recibir):", w.address)
    print("¿Dirección válida?", is_valid_address(w.address))
