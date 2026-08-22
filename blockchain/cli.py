"""
cli.py — Monedero de línea de comandos. Crea cuentas, consulta saldos y envía
monedas a través de un nodo de la red.

Ejemplos:
    python3 cli.py new                                  # crea un monedero (wallet.json)
    python3 cli.py address                              # muestra tu dirección
    python3 cli.py balance --node http://localhost:5000
    python3 cli.py send --to <DIRECCION> --amount 10 --node http://localhost:5000
    python3 cli.py mine --node http://localhost:5000    # pide al nodo que mine (recompensa para ti)
"""
import argparse
import json
import os
import urllib.request

import config
from wallet import Wallet, is_valid_address
from blockchain import Transaction

WALLET_FILE = os.environ.get("TMC_WALLET", "wallet.json")


def _get(url):
    with urllib.request.urlopen(url, timeout=6) as r:
        return json.loads(r.read().decode())


def _post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read().decode())


def load_wallet():
    if not os.path.exists(WALLET_FILE):
        print(f"No hay monedero en {WALLET_FILE}. Crea uno con:  python3 cli.py new")
        raise SystemExit(1)
    return Wallet.load(WALLET_FILE)


def cmd_new(a):
    if os.path.exists(WALLET_FILE):
        print(f"Ya existe {WALLET_FILE}. Bórralo si quieres crear otro (¡perderías el acceso a sus fondos!).")
        return
    w = Wallet()
    w.save(WALLET_FILE)
    print("✅ Monedero creado y guardado en", WALLET_FILE)
    print("   Dirección (compártela para recibir):", w.address)
    print("   ⚠️  Guarda ese archivo a salvo: contiene tu clave privada.")


def cmd_address(a):
    print(load_wallet().address)


def cmd_balance(a):
    w = load_wallet()
    r = _get(f"{a.node}/balance?address={w.address}")
    print(f"Saldo de {w.address}:")
    print(f"  {r['balance_coin']} {config.COIN_TICKER}")


def cmd_send(a):
    w = load_wallet()
    if not is_valid_address(a.to):
        print("❌ La dirección de destino no es válida."); return
    amount = config.from_coin(a.amount)
    fee = config.from_coin(a.fee) if a.fee else config.MIN_FEE
    tx = Transaction(w.address, a.to, amount, fee)
    tx.sign_with(w)
    r = _post(f"{a.node}/transactions", tx.to_dict())
    if r.get("ok"):
        print(f"✅ Enviadas {a.amount} {config.COIN_TICKER} a {a.to}")
        print(f"   Comisión: {config.to_coin(fee)} {config.COIN_TICKER}  ·  txid: {r['txid'][:16]}…")
        print("   Se confirmará cuando un minero incluya la transacción en un bloque.")
    else:
        print("❌ No se pudo enviar:", r.get("message") or r.get("error"))


def cmd_mine(a):
    w = load_wallet()
    r = _post(f"{a.node}/mine", {"miner": w.address})
    if r.get("mined"):
        print(f"⛏  Bloque #{r['index']} minado. Recompensa para ti.")
        print(f"   hash: {r['hash']}  ·  transacciones: {r['transactions']}")
    else:
        print("❌ Error al minar:", r.get("error"))


def cmd_info(a):
    r = _get(f"{a.node}/info")
    for k, v in r.items():
        print(f"  {k}: {v}")


def main():
    ap = argparse.ArgumentParser(description=f"Monedero {config.COIN_TICKER}")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("new").set_defaults(func=cmd_new)
    sub.add_parser("address").set_defaults(func=cmd_address)

    p = sub.add_parser("balance"); p.add_argument("--node", default="http://localhost:5000"); p.set_defaults(func=cmd_balance)
    p = sub.add_parser("send")
    p.add_argument("--to", required=True); p.add_argument("--amount", required=True, type=float)
    p.add_argument("--fee", type=float, default=0); p.add_argument("--node", default="http://localhost:5000")
    p.set_defaults(func=cmd_send)
    p = sub.add_parser("mine"); p.add_argument("--node", default="http://localhost:5000"); p.set_defaults(func=cmd_mine)
    p = sub.add_parser("info"); p.add_argument("--node", default="http://localhost:5000"); p.set_defaults(func=cmd_info)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
