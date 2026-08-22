# Tu Moneda (TMC) — una blockchain nueva, propia y conectada en red

Esto **no** es un token dentro de otra red (no es Solana ni Ethereum). Es una
**blockchain nueva de verdad**, escrita desde cero, con:

- 🪙 **Moneda propia** (`Tu Moneda`, símbolo `TMC`) — nombre y símbolo son *placeholders*, se cambian en 1 minuto.
- ⛏ **Minado Proof of Work** (como Bitcoin), con dificultad ajustable.
- 🌐 **Red P2P real**: los nodos se conectan por internet, se pasan bloques y transacciones y se ponen de acuerdo con la regla de la **cadena más larga**.
- 🔐 **Monedero con firma criptográfica** en la misma curva que Bitcoin (secp256k1). Nadie gasta tus monedas sin tu clave privada.
- 💸 **Comisiones casi cero** (0,00001 TMC por transacción).
- 🔎 **Explorador web** integrado en cada nodo.
- 🧊 **Suministro máximo: 100.000.000 TMC**, con *halvings* (se reduce la emisión con el tiempo).

**Sin dependencias.** Solo necesitas **Python 3** (3.8 o superior). No hay que instalar nada.

---

## Arranca en 2 minutos (en tu ordenador)

```bash
cd blockchain

# 1) Levanta un nodo (deja esta ventana abierta)
python3 node.py --port 5000

# 2) En OTRA ventana, crea tu monedero
python3 cli.py new
#   → te da tu dirección (tu "número de cuenta")

# 3) Mina un bloque y llévate la recompensa (50 TMC)
python3 cli.py mine --node http://localhost:5000

# 4) Mira tu saldo
python3 cli.py balance --node http://localhost:5000
```

Abre **http://localhost:5000** en el navegador para ver el **explorador** con los bloques en vivo.

### Enviar monedas a otra persona

```bash
python3 cli.py send --to <DIRECCION_DESTINO> --amount 10 --node http://localhost:5000
# se confirma cuando alguien mina el siguiente bloque
```

---

## Conectar varios nodos (esto la convierte en una RED)

En cada servidor/ordenador, arranca un nodo diciéndole su **URL pública** y al menos un **peer** ya existente:

```bash
# Nodo semilla (por ejemplo en un servidor con IP 203.0.113.9)
python3 node.py --port 5000 --public http://203.0.113.9:5000 --mine <TU_DIRECCION>

# Otro nodo que se une a la red
python3 node.py --port 5000 --public http://TU_IP:5000 --peers http://203.0.113.9:5000
```

Los nodos se descubren entre sí, sincronizan la cadena y difunden todo automáticamente.
Para que otros se conecten por internet necesitas **abrir el puerto** (5000) en el firewall
y usar tu **IP pública** (un VPS barato de 3-5 €/mes sirve de sobra).

### Minar de forma continua (sostener la red)

```bash
python3 node.py --port 5000 --mine <TU_DIRECCION>
```

El nodo minará bloques en bucle y repartirá la recompensa a tu dirección.

---

## Cambiar tu moneda (nombre, símbolo, suministro…)

Todo está en **`config.py`**:

| Parámetro | Qué hace |
|---|---|
| `COIN_NAME`, `COIN_TICKER` | Nombre y símbolo |
| `MAX_SUPPLY` | Suministro máximo (ahora 100.000.000) |
| `INITIAL_BLOCK_REWARD`, `HALVING_BLOCKS` | Emisión de nuevas monedas |
| `MIN_FEE` | Comisión mínima (ahora casi cero) |
| `DIFFICULTY` | Dificultad del minado (sube = más difícil) |

⚠️ Si cambias el bloque **génesis** (`GENESIS_MESSAGE`/`GENESIS_TIMESTAMP`), creas una
red distinta e incompatible con la anterior. Cámbialo **antes** de lanzar y que todos
los nodos usen el mismo `config.py`.

---

## Qué es esto y qué NO es (lee esto)

**Sí es:** una blockchain funcional y honesta — bloques encadenados, minado real,
firmas criptográficas, red P2P y consenso. Sirve para aprender, prototipar, montar
una red entre amigos/comunidad y demostrar el concepto de punta a punta.

**No es (todavía):** una red lista para guardar el dinero de desconocidos. Comparada
con Bitcoin le faltan cosas que son años de trabajo y comunidad, no de código:

- **Seguridad a escala.** Con pocos nodos/mineros, la red es vulnerable a un *ataque
  del 51%* (quien tenga más potencia reescribe la historia). Bitcoin es seguro porque
  miles de máquinas lo minan.
- **Ajuste de dificultad dinámico** (aquí es fija por simplicidad).
- **Persistencia en disco** (este prototipo guarda la cadena en memoria; al reiniciar
  un nodo, resincroniza desde sus peers).
- **Auditoría criptográfica profesional.** El módulo `ecc.py` es didáctico y correcto,
  pero **no** ha pasado una auditoría de seguridad.
- **Optimización.** Es Python puro, pensado para entenderse, no para máxima velocidad.

**Que "compita con Bitcoin" no depende del código, sino de que mucha gente la use y
confíe en ella.** Eso es lo verdaderamente difícil.

### Aviso legal

Emitir una moneda y captar dinero de terceros puede estar **regulado** (en la UE, el
reglamento **MiCA**). Si otras personas ponen dinero y lo pierden, puede haber
consecuencias legales. Infórmate y consulta a un profesional antes de dar ese paso.
Este software se entrega tal cual, con fines educativos, sin garantía de ningún tipo.

---

## Archivos del proyecto

| Archivo | Qué contiene |
|---|---|
| `config.py` | Parámetros de la moneda (cámbialos aquí) |
| `ecc.py` | Criptografía secp256k1 (claves, firma, verificación) |
| `wallet.py` | Monedero: claves y direcciones con checksum |
| `blockchain.py` | Bloques, transacciones, minado PoW, saldos, validación, consenso |
| `node.py` | Nodo de la red (API HTTP + P2P + explorador web) |
| `cli.py` | Monedero de línea de comandos |

_Diseñado por Incuba tu Negocio · por Jaime M. M._
