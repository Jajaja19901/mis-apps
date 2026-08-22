"""
blockchain.py — La cadena de bloques: transacciones firmadas, bloques, minado
Proof of Work, saldos y validación completa. Python puro, sin dependencias.

Modelo de saldos tipo "cuenta" (como Ethereum): cada dirección tiene un saldo
que se calcula recorriendo la cadena. Más sencillo de entender que el modelo
UTXO de Bitcoin, e igual de válido para una moneda.
"""
import hashlib
import json
import time

import config
import ecc
from wallet import public_to_address, is_valid_address

COINBASE = "COINBASE"  # remitente especial de la recompensa del minero


def _sha(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()


def _canon(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


# ============================== TRANSACCIÓN ==============================

class Transaction:
    def __init__(self, sender, recipient, amount, fee, timestamp=None,
                 pubkey="", signature=None, txid=None):
        self.sender = sender
        self.recipient = recipient
        self.amount = int(amount)
        self.fee = int(fee)
        self.timestamp = timestamp if timestamp is not None else time.time()
        self.pubkey = pubkey
        self.signature = signature            # [r, s]
        self.txid = txid or self.compute_txid()

    def _payload(self):
        """Lo que se firma (todo menos la firma y el id)."""
        return _canon({
            "sender": self.sender, "recipient": self.recipient,
            "amount": self.amount, "fee": self.fee,
            "timestamp": self.timestamp, "pubkey": self.pubkey,
        })

    def compute_txid(self):
        return _sha(self._payload() + _canon(self.signature))

    def sign_with(self, wallet):
        self.pubkey = wallet.public_hex
        r, s = wallet.sign(self._payload().encode())
        self.signature = [r, s]
        self.txid = self.compute_txid()
        return self

    def is_coinbase(self):
        return self.sender == COINBASE

    def is_valid_signature(self):
        if self.is_coinbase():
            return True  # la recompensa se valida en el bloque, no aquí
        if not self.signature or not self.pubkey:
            return False
        # la dirección del remitente debe salir de la clave pública que firma
        if public_to_address(self.pubkey) != self.sender:
            return False
        return ecc.verify(self._payload().encode(), tuple(self.signature), self.pubkey)

    def basic_checks(self):
        if self.amount <= 0:
            return False
        if self.is_coinbase():
            return True
        if self.fee < config.MIN_FEE:
            return False
        if not is_valid_address(self.recipient):
            return False
        return self.is_valid_signature()

    def to_dict(self):
        return {"sender": self.sender, "recipient": self.recipient,
                "amount": self.amount, "fee": self.fee, "timestamp": self.timestamp,
                "pubkey": self.pubkey, "signature": self.signature, "txid": self.txid}

    @classmethod
    def from_dict(cls, d):
        return cls(d["sender"], d["recipient"], d["amount"], d["fee"],
                   d["timestamp"], d.get("pubkey", ""), d.get("signature"), d.get("txid"))


# ================================= BLOQUE =================================

class Block:
    def __init__(self, index, transactions, previous_hash, miner,
                 timestamp=None, nonce=0, hash=None):
        self.index = index
        self.transactions = transactions      # lista de Transaction
        self.previous_hash = previous_hash
        self.miner = miner
        self.timestamp = timestamp if timestamp is not None else time.time()
        self.nonce = nonce
        self.hash = hash or self.compute_hash()

    def _header(self):
        tx_root = _sha(_canon([t.txid for t in self.transactions]))
        return _canon({
            "index": self.index, "previous_hash": self.previous_hash,
            "tx_root": tx_root, "miner": self.miner,
            "timestamp": self.timestamp, "nonce": self.nonce,
        })

    def compute_hash(self):
        return _sha(self._header())

    def mine(self, difficulty):
        """Prueba de trabajo: busca un nonce cuyo hash empiece por N ceros."""
        prefix = "0" * difficulty
        while True:
            self.hash = self.compute_hash()
            if self.hash.startswith(prefix):
                return self.hash
            self.nonce += 1

    def has_valid_pow(self, difficulty):
        return self.hash == self.compute_hash() and self.hash.startswith("0" * difficulty)

    def to_dict(self):
        return {"index": self.index, "previous_hash": self.previous_hash,
                "miner": self.miner, "timestamp": self.timestamp, "nonce": self.nonce,
                "hash": self.hash, "transactions": [t.to_dict() for t in self.transactions]}

    @classmethod
    def from_dict(cls, d):
        txs = [Transaction.from_dict(t) for t in d["transactions"]]
        return cls(d["index"], txs, d["previous_hash"], d["miner"],
                   d["timestamp"], d["nonce"], d["hash"])


# =============================== BLOCKCHAIN ===============================

class Blockchain:
    def __init__(self):
        self.chain = []
        self.mempool = []          # transacciones pendientes
        self.difficulty = config.DIFFICULTY
        self.chain.append(self._genesis())

    def _genesis(self):
        tx = Transaction(COINBASE, COINBASE, 1, 0,
                         timestamp=config.GENESIS_TIMESTAMP)
        tx.pubkey = ""
        tx.signature = None
        tx.txid = _sha(config.GENESIS_MESSAGE)
        b = Block(0, [tx], "0" * 64, COINBASE,
                  timestamp=config.GENESIS_TIMESTAMP, nonce=0)
        return b

    @property
    def last_block(self):
        return self.chain[-1]

    # -------- saldos --------
    def _replay(self, chain):
        """Recalcula todos los saldos recorriendo la cadena. Devuelve dict o None si es inválida."""
        balances = {}
        issued = 0
        seen_tx = set()
        for i, block in enumerate(chain):
            # génesis: se acepta tal cual
            if i == 0:
                seen_tx.add(block.transactions[0].txid)
                continue
            prev = chain[i - 1]
            if block.previous_hash != prev.hash:
                return None
            if not block.has_valid_pow(self.difficulty):
                return None
            if block.index != i:
                return None

            coinbase_count = 0
            fees = 0
            for tx in block.transactions:
                if tx.txid in seen_tx:
                    return None  # transacción repetida (replay)
                if not tx.basic_checks():
                    return None
                if tx.is_coinbase():
                    coinbase_count += 1
                    continue
                need = tx.amount + tx.fee
                if balances.get(tx.sender, 0) < need:
                    return None  # sin saldo suficiente
                balances[tx.sender] = balances.get(tx.sender, 0) - need
                balances[tx.recipient] = balances.get(tx.recipient, 0) + tx.amount
                fees += tx.fee
                seen_tx.add(tx.txid)

            # exactamente una coinbase, con la recompensa correcta
            if coinbase_count != 1:
                return None
            coinbase = block.transactions[0]
            if not coinbase.is_coinbase():
                return None
            reward = config.block_reward(block.index)
            if issued + reward > config.MAX_SUPPLY:
                reward = max(0, config.MAX_SUPPLY - issued)
            if coinbase.amount != reward + fees:
                return None
            if coinbase.recipient != block.miner:
                return None
            balances[block.miner] = balances.get(block.miner, 0) + coinbase.amount
            issued += reward
            seen_tx.add(coinbase.txid)
        return balances

    def balances(self):
        return self._replay(self.chain) or {}

    def balance_of(self, address):
        return self.balances().get(address, 0)

    def pending_outgoing(self, address):
        """Cuánto tiene ya comprometido en el mempool (para no gastar dos veces)."""
        return sum(t.amount + t.fee for t in self.mempool
                   if t.sender == address)

    # -------- transacciones --------
    def add_transaction(self, tx: Transaction):
        if not tx.basic_checks():
            return False, "Transacción inválida (firma o datos incorrectos)."
        if tx.is_coinbase():
            return False, "No puedes crear recompensas a mano."
        if any(t.txid == tx.txid for t in self.mempool):
            return False, "Esa transacción ya está pendiente."
        disponible = self.balance_of(tx.sender) - self.pending_outgoing(tx.sender)
        if disponible < tx.amount + tx.fee:
            return False, "Saldo insuficiente."
        self.mempool.append(tx)
        return True, "Transacción aceptada en el mempool."

    # -------- minado --------
    def mine_pending(self, miner_address):
        if not is_valid_address(miner_address):
            raise ValueError("Dirección de minero inválida.")
        # elige transacciones válidas del mempool (las de más comisión primero)
        selected, spent = [], {}
        for tx in sorted(self.mempool, key=lambda t: t.fee, reverse=True):
            need = tx.amount + tx.fee
            if self.balance_of(tx.sender) - spent.get(tx.sender, 0) >= need:
                selected.append(tx)
                spent[tx.sender] = spent.get(tx.sender, 0) + need
        fees = sum(t.fee for t in selected)
        height = self.last_block.index + 1
        issued = sum(config.block_reward(b.index) for b in self.chain[1:])
        reward = config.block_reward(height)
        if issued + reward > config.MAX_SUPPLY:
            reward = max(0, config.MAX_SUPPLY - issued)
        coinbase = Transaction(COINBASE, miner_address, reward + fees, 0,
                               timestamp=time.time())
        coinbase.txid = _sha("coinbase" + str(height) + miner_address + str(time.time()))
        block = Block(height, [coinbase] + selected, self.last_block.hash, miner_address)
        block.mine(self.difficulty)
        self.chain.append(block)
        # quita del mempool las ya incluidas
        included = {t.txid for t in selected}
        self.mempool = [t for t in self.mempool if t.txid not in included]
        return block

    # -------- validación y consenso --------
    def is_valid_chain(self, chain=None):
        chain = chain or self.chain
        if not chain or chain[0].hash != self._genesis().hash:
            return False
        return self._replay(chain) is not None

    def replace_chain(self, new_chain):
        """Regla de la cadena más larga válida (evita fraudes)."""
        if len(new_chain) <= len(self.chain):
            return False
        if not self.is_valid_chain(new_chain):
            return False
        included = set()
        for b in new_chain:
            for t in b.transactions:
                included.add(t.txid)
        self.chain = new_chain
        self.mempool = [t for t in self.mempool if t.txid not in included]
        return True

    # -------- serialización --------
    def to_dict(self):
        return {"chain": [b.to_dict() for b in self.chain],
                "length": len(self.chain)}

    @staticmethod
    def chain_from_dicts(dicts):
        return [Block.from_dict(d) for d in dicts]
