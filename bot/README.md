# Bot de arbitraje de tasa de financiación



Compra un activo al contado y vende el perpetuo del mismo activo por el mismo importe.
Como una pata sube cuando la otra baja, **el precio deja de importar**. Lo que se cobra es
la tasa de financiación que los largos del perpetuo pagan a los cortos cada 8 horas.

Esto es lo contrario del arbitraje entre exchanges: ahí la ventaja es la velocidad, y contra
las mesas institucionales esa carrera está perdida. Aquí la ventaja es tener capital y
aguantar, que es algo en lo que un particular sí puede competir.

## El número que decide si esto te interesa

Entrar y salir cuesta **entre un 0,4 % y un 1 %** del importe, según el par. No son solo
las cuatro comisiones (0,30 %): hay que sumar el cruce de la horquilla en cada una de las
cuatro patas, el deslizamiento al barrer el libro, y la base —el perpetuo cotiza con prima
justo cuando la financiación es positiva, que es cuando entramos—.

Con una financiación típica de **0,01 % por cobro**, eso son **entre 40 y 100 cobros: de
dos a cinco semanas** solo para recuperar lo que costó abrir. El bot mide la horquilla del
libro real y te enseña el desglose antes de entrar.

De ahí sale lo demás:

| Capital desplegado | Ingreso aproximado con financiación media |
|---|---|
| 1.000 USDT | ~0,30 USDT/día |
| 10.000 USDT | ~3 USDT/día |
| 333.000 USDT | ~100 USDT/día |

Rendimiento anualizado realista: **8–20 %** con financiación positiva sostenida, **0–5 %**
en mercado lateral. Si alguien te ofrece más que eso, te está vendiendo otra cosa.

El bot enseña estos números **antes** de abrir nada, y se niega a entrar cuando no salen.

## Puesta en marcha

```bash
cd bot
npm install
cp .env.example .env      # vale tal cual: viene en modo papel
npm test                  # comprueba la aritmética, sin red ni claves
npm start
```

Panel en <http://127.0.0.1:8787>. **No hace falta ninguna clave para empezar.**

## Los dos interruptores

Son independientes a propósito.

**`TRADING_MODE`** — `paper` o `live`.

`paper` lee precios y tasas de financiación **reales** de los endpoints públicos y simula
la ejecución aplicando los costes medidos del libro. No necesita claves y no puede mover
dinero. Es donde tienes que empezar.

> Antes esto era `testnet`, y no funcionaba: CCXT retiró el sandbox de futuros de Binance,
> así que toda llamada privada de futuros lanzaba `NotSupported` y la pata del perpetuo
> fallaba siempre. El modo papel lo sustituye y además es mejor, porque los precios son
> los de verdad y no los de un entorno de pruebas con liquidez ficticia.

`live` mueve dinero real y exige **dos gestos**: `YES_I_UNDERSTAND_THIS_IS_REAL_MONEY=yes`
en el `.env` **y** arrancar con `npm start -- --live-de-verdad`. Lo segundo es a propósito:
una variable exportada en otra sesión no debería bastar.

Claves solo en `live`. Permisos: **lectura y trading, nunca retirada.** Y `chmod 600 .env`.

**`ARMED`** — con `false` (por defecto) el bot hace exactamente lo mismo salvo mandar las
órdenes, y deja anotado lo que **habría** hecho.

Esa es la forma de decidir si te fías de él: déjalo una semana sin armar y lee sus
decisiones. Si estás de acuerdo con lo que iba a hacer, ármalo. Si no, ya sabes algo que
te habría costado dinero averiguar.

## Cortafuegos

Se comprueban antes de cada apertura y el primero que salta manda:

- Tamaño máximo por posición y exposición total máxima
- Número máximo de posiciones simultáneas
- Pérdida diaria que lo desarma solo
- Desarme manual desde el panel

Ninguno depende de que el exchange conteste algo concreto: todos se calculan con lo que ya
sabemos, para que una respuesta rara de la API no pueda desactivarlos.

## Decisiones de diseño que conviene conocer

**No cierra por impaciencia.** Si la financiación se seca pero todavía no se ha recuperado
el coste de haber abierto, mantiene la posición. Cerrar antes es realizar una pérdida por
nerviosismo: mientras la financiación no sea negativa, esperar no cuesta nada.

**No opera con una sola lectura.** La financiación oscila y cambia de signo. Se decide
sobre la media de los últimos cobros y sobre qué proporción de ellos fue positiva — una
media de 0,01 % hecha de +0,05 % y −0,03 % alternos no es lo mismo que un 0,01 % estable,
aunque el número salga igual.

**Si una pata falla, deshace la otra — pero solo si sabe que no entró.** Un tiempo de
espera agotado no significa que la orden no se ejecutara. Antes se asumía que sí y se
"deshacía", lo que podía dejar un corto desnudo sin registro. Ahora se consulta al exchange
antes de decidir, y si no se puede confirmar, no se toca nada y se desarma.

**Apunta lo que va a hacer antes de hacerlo.** Si el proceso muere entre las dos órdenes,
al arrancar se detecta y se para. Y en `live` se reconcilia contra las posiciones reales
del exchange: si lo que el bot cree tener no cuadra con lo que hay, no opera.

**Apalancamiento 1x y margen aislado.** Binance abre en cross 20x por defecto, y con eso el
corto se liquida con una subida del 4,7 % — te quedarías con el contado desnudo y el bot
creyéndose cubierto. Con 1x aguanta que el precio se duplique.

**Con financiación negativa cierra, sin esperar.** La regla anterior era "espera a cubrir
el coste", y con financiación negativa eso no llega nunca: cuanto más pagas, más lejos
queda. Se sangraba indefinidamente sin que ningún límite saltara.

**El panel escucha solo en `127.0.0.1`.** No lleva contraseña, así que no puede estar
accesible desde la red. Si necesitas verlo desde fuera, haz un túnel SSH; no cambies esa
línea.

**Los secretos no salen por el registro**, ni siquiera dentro de un error de CCXT (que a
veces incluye la petición entera con la firma dentro).

## Qué NO hace

- No cierra posiciones al pararse. Si matas el proceso, lo que esté abierto sigue abierto.
- No cubre el riesgo de que el exchange quiebre, congele retiradas o liquide tu corto.
- No sabe de impuestos. En España las ganancias de capital tributan y esto genera muchas
  operaciones pequeñas.
- No es asesoramiento financiero. Es una herramienta; las decisiones y el dinero son tuyos.

## Estado

`npm test` → **34 comprobaciones**, sin red ni claves: el coste con sus cuatro sumandos,
los cobros hasta cubrirlo, media y consistencia, los cinco caminos de rechazo, el orden de
preferencia, el punto de equilibrio, y que el coste de cierre se calcula al precio actual.

Este código pasó por dos auditorías (seguridad y corrección del dinero) que encontraron 18
defectos, todos corregidos aquí. Los de fondo eran: el coste real era el doble del que se
contaba, no se fijaba apalancamiento (liquidación con +4,7 %), las dos patas no llevaban la
misma cantidad, un símbolo que fallaba se reintentaba cada minuto para siempre, y el stop
diario no podía saltar porque solo sumaba cierres voluntarios.

**Lo que sigue sin probarse: la ejecución contra el exchange real.** Ninguna orden de este
código ha llegado nunca a Binance. Por eso existe el modo papel, y por eso `ARMED` viene
en `false`.
