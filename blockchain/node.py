"""
node.py — Un NODO de la red. Ejecuta esto en cada servidor/ordenador que quiera
formar parte de la blockchain. Los nodos se conectan por internet (HTTP), se
pasan transacciones y bloques, y se ponen de acuerdo con la "cadena más larga".

Uso:
    python3 node.py --port 5000
    python3 node.py --port 5001 --public http://TU_IP_PUBLICA:5001 --peers http://otro:5000
    python3 node.py --port 5000 --mine <TU_DIRECCION>     (mina automáticamente)

No necesita instalar NADA: solo Python 3.
Abre http://localhost:PUERTO en el navegador para ver el explorador.
"""
import argparse
import json
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import config
from blockchain import Blockchain, Block, Transaction


class Node:
    def __init__(self, public_url):
        self.bc = Blockchain()
        self.peers = set()
        self.public_url = public_url.rstrip("/")
        self.lock = threading.Lock()

    # ---------- comunicación con otros nodos ----------
    def _post(self, url, data, timeout=4):
        req = urllib.request.Request(
            url, data=json.dumps(data).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())

    def _get(self, url, timeout=4):
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read().decode())

    def broadcast(self, path, data):
        for peer in list(self.peers):
            try:
                self._post(peer + path, data, timeout=3)
            except Exception:
                pass  # un nodo caído no debe frenar al resto

    def add_peer(self, peer_url):
        peer_url = peer_url.rstrip("/")
        if peer_url and peer_url != self.public_url and peer_url not in self.peers:
            self.peers.add(peer_url)
            # nos presentamos (reciprocidad) para que también nos añada
            try:
                self._post(peer_url + "/peers", {"peer": self.public_url}, timeout=3)
            except Exception:
                pass
            return True
        return False

    # ---------- consenso: adoptar la cadena más larga válida ----------
    def resolve(self):
        best = self.bc.chain
        replaced = False
        for peer in list(self.peers):
            try:
                data = self._get(peer + "/chain", timeout=5)
                chain = Blockchain.chain_from_dicts(data["chain"])
                if len(chain) > len(best) and self.bc.is_valid_chain(chain):
                    best = chain
                    replaced = True
            except Exception:
                pass
        if replaced:
            with self.lock:
                self.bc.replace_chain(best)
        return replaced

    def receive_block(self, block):
        """Un peer nos manda un bloque recién minado."""
        with self.lock:
            last = self.bc.last_block
            if block.previous_hash == last.hash and block.index == last.index + 1:
                candidate = self.bc.chain + [block]
                if self.bc.is_valid_chain(candidate):
                    self.bc.chain = candidate
                    inc = {t.txid for t in block.transactions}
                    self.bc.mempool = [t for t in self.bc.mempool if t.txid not in inc]
                    return "added"
                return "invalid"
            if block.index > last.index + 1:
                return "behind"   # nos hemos quedado atrás → sincronizar
            return "ignored"


NODE = None  # instancia global usada por el handler


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # silencia el log ruidoso por defecto
        pass

    def _send(self, code, obj, ctype="application/json"):
        body = obj if isinstance(obj, bytes) else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n).decode()) if n else {}

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/":
            html = EXPLORER_HTML.replace("__COIN__", config.COIN_NAME)\
                                .replace("__TICKER__", config.COIN_TICKER)
            return self._send(200, html.encode(), "text/html; charset=utf-8")
        if u.path == "/chain":
            return self._send(200, NODE.bc.to_dict())
        if u.path == "/mempool":
            return self._send(200, {"pending": [t.to_dict() for t in NODE.bc.mempool]})
        if u.path == "/peers":
            return self._send(200, {"peers": sorted(NODE.peers), "me": NODE.public_url})
        if u.path == "/resolve":
            return self._send(200, {"replaced": NODE.resolve(), "length": len(NODE.bc.chain)})
        if u.path == "/balance":
            addr = (q.get("address") or [""])[0]
            units = NODE.bc.balance_of(addr)
            return self._send(200, {"address": addr, "balance": units,
                                    "balance_coin": config.to_coin(units)})
        if u.path == "/info":
            issued = sum(config.block_reward(b.index) for b in NODE.bc.chain[1:])
            return self._send(200, {
                "coin": config.COIN_NAME, "ticker": config.COIN_TICKER,
                "height": NODE.bc.last_block.index, "difficulty": NODE.bc.difficulty,
                "peers": len(NODE.peers), "mempool": len(NODE.bc.mempool),
                "supply_issued": config.to_coin(issued),
                "max_supply": config.to_coin(config.MAX_SUPPLY),
                "min_fee": config.to_coin(config.MIN_FEE),
                "last_hash": NODE.bc.last_block.hash})
        return self._send(404, {"error": "no encontrado"})

    def do_POST(self):
        u = urlparse(self.path)
        try:
            data = self._body()
        except Exception:
            return self._send(400, {"error": "JSON inválido"})

        if u.path == "/peers":
            added = NODE.add_peer(data.get("peer", ""))
            return self._send(200, {"added": added, "peers": sorted(NODE.peers)})

        if u.path == "/transactions":
            try:
                tx = Transaction.from_dict(data)
            except Exception:
                return self._send(400, {"error": "transacción mal formada"})
            ok, msg = NODE.bc.add_transaction(tx)
            if ok and not data.get("_relayed"):
                d = tx.to_dict(); d["_relayed"] = True
                threading.Thread(target=NODE.broadcast,
                                 args=("/transactions", d), daemon=True).start()
            return self._send(200 if ok else 400, {"ok": ok, "message": msg, "txid": tx.txid})

        if u.path == "/mine":
            miner = data.get("miner", "")
            try:
                block = NODE.bc.mine_pending(miner)
            except Exception as e:
                return self._send(400, {"error": str(e)})
            threading.Thread(target=NODE.broadcast,
                             args=("/blocks", block.to_dict()), daemon=True).start()
            return self._send(200, {"mined": True, "index": block.index,
                                    "hash": block.hash, "reward_to": miner,
                                    "transactions": len(block.transactions)})

        if u.path == "/blocks":
            try:
                block = Block.from_dict(data)
            except Exception:
                return self._send(400, {"error": "bloque mal formado"})
            result = NODE.receive_block(block)
            if result == "added":
                d = block.to_dict()
                threading.Thread(target=NODE.broadcast, args=("/blocks", d),
                                 daemon=True).start()
            elif result == "behind":
                threading.Thread(target=NODE.resolve, daemon=True).start()
            return self._send(200, {"result": result})

        return self._send(404, {"error": "no encontrado"})


def auto_miner(miner_address, interval=1.0):
    """Mina bloques en bucle y los difunde. Para pruebas y para 'sostener' la red."""
    while True:
        try:
            block = NODE.bc.mine_pending(miner_address)
            NODE.broadcast("/blocks", block.to_dict())
            print(f"[minado] bloque #{block.index}  hash {block.hash[:16]}…  "
                  f"txs {len(block.transactions)}")
        except Exception as e:
            print("[minado] error:", e)
        time.sleep(interval)


EXPLORER_HTML = r"""<!doctype html><html lang=es><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>__COIN__ (__TICKER__) · Explorador</title>
<style>
:root{--bg:#0b0a14;--panel:#171529;--line:#2a2740;--ink:#f4f2ff;--soft:#b9b4d6;--v:#9945FF;--m:#14F195}
*{box-sizing:border-box;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
body{background:var(--bg);color:var(--ink);padding:18px;max-width:1000px;margin:0 auto}
a{color:var(--m)} h1{font-size:22px} .tick{background:linear-gradient(120deg,#9945FF,#14F195);
-webkit-background-clip:text;background-clip:text;color:transparent}
.bar{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px;flex:1;min-width:130px}
.stat b{display:block;font-size:20px;color:var(--m)} .stat span{font-size:12px;color:var(--soft)}
.block{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:10px}
.block h3{font-size:15px;margin-bottom:6px}.hash{font-family:ui-monospace,monospace;font-size:12px;color:var(--soft);word-break:break-all}
.tx{border-top:1px solid var(--line);padding:8px 0;font-size:13px}
.tx b{color:var(--m)} .cb{color:#ffcf6b}
input{background:#0d0b18;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:9px 12px;width:100%;font-size:14px}
button{background:linear-gradient(120deg,#9945FF,#14F195);color:#0b0a14;border:0;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer}
.row{display:flex;gap:8px;margin:10px 0}
.muted{color:var(--soft);font-size:13px}
</style></head><body>
<h1>__COIN__ <span class=tick>__TICKER__</span> · Explorador de la cadena</h1>
<p class=muted>Actualiza cada 3 s. Este nodo forma parte de la red P2P.</p>
<div class=bar id=stats></div>
<div class=row>
  <input id=addr placeholder="Pega una dirección para ver su saldo">
  <button onclick=checkBal()>Saldo</button>
</div>
<p class=muted id=balOut></p>
<h3 style="margin:16px 0 8px">Bloques (más nuevo arriba)</h3>
<div id=blocks></div>
<script>
const COIN=1e8;
async function j(u){const r=await fetch(u);return r.json()}
async function refresh(){
 try{
  const info=await j('/info');
  document.getElementById('stats').innerHTML=[
   ['Altura',info.height],['Dificultad',info.difficulty],['Nodos conectados',info.peers],
   ['Pendientes',info.mempool],['Emitido',info.supply_issued.toLocaleString('es')+' __TICKER__'],
   ['Comisión',info.min_fee+' __TICKER__']
  ].map(s=>`<div class=stat><b>${s[1]}</b><span>${s[0]}</span></div>`).join('');
  const data=await j('/chain');
  const blocks=data.chain.slice().reverse().map(b=>{
   const txs=b.transactions.map(t=>{
    if(t.sender==='COINBASE')return `<div class="tx cb">⛏ Recompensa de minado → <b>${short(t.recipient)}</b>: ${(t.amount/COIN)} __TICKER__</div>`;
    return `<div class=tx>${short(t.sender)} → <b>${short(t.recipient)}</b>: ${(t.amount/COIN)} __TICKER__ <span class=muted>(comisión ${(t.fee/COIN)})</span></div>`;
   }).join('');
   return `<div class=block><h3>Bloque #${b.index} · ${new Date(b.timestamp*1000).toLocaleString('es')}</h3>
    <div class=hash>hash: ${b.hash}</div><div class=hash>previo: ${b.previous_hash}</div>
    <div class=muted>minero: ${short(b.miner)} · nonce ${b.nonce}</div>${txs}</div>`;
  }).join('');
  document.getElementById('blocks').innerHTML=blocks;
 }catch(e){}
}
function short(a){return a&&a.length>16?a.slice(0,8)+'…'+a.slice(-6):a}
async function checkBal(){
 const a=document.getElementById('addr').value.trim();if(!a)return;
 const r=await j('/balance?address='+encodeURIComponent(a));
 document.getElementById('balOut').textContent='Saldo de '+short(a)+': '+r.balance_coin+' __TICKER__';
}
refresh();setInterval(refresh,3000);
</script></body></html>"""


def main():
    global NODE
    ap = argparse.ArgumentParser(description="Nodo de la blockchain __TICKER__")
    ap.add_argument("--port", type=int, default=5000)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--public", default=None,
                    help="URL pública de este nodo (para que otros se conecten)")
    ap.add_argument("--peers", default="", help="lista de nodos separados por comas")
    ap.add_argument("--mine", default=None, help="dirección que recibe las recompensas (auto-minado)")
    args = ap.parse_args()

    public = args.public or f"http://127.0.0.1:{args.port}"
    NODE = Node(public)
    for p in [x.strip() for x in args.peers.split(",") if x.strip()]:
        NODE.add_peer(p)
    if NODE.peers:
        NODE.resolve()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"⛓  Nodo {config.COIN_NAME} ({config.COIN_TICKER}) en http://{args.host}:{args.port}")
    print(f"   Público: {public} | Peers: {sorted(NODE.peers) or 'ninguno'}")
    print(f"   Explorador web: http://localhost:{args.port}")
    if args.mine:
        print(f"   Auto-minado activo → recompensas a {args.mine}")
        threading.Thread(target=auto_miner, args=(args.mine,), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nApagando nodo…")
        server.shutdown()


if __name__ == "__main__":
    main()
