# Bot de arbitraje de tasa de financiación

Compra un activo al contado y vende el perpetuo del mismo activo por el mismo importe.
Como una pata sube cuando la otra baja, **el precio deja de importar**. Lo que se cobra es
la tasa de financiación que los largos del perpetuo pagan a los cortos cada 8 horas.

Esto es lo contrario del arbitraje entre exchanges: ahí la ventaja es la velocidad, y contra
las mesas institucionales esa carrera está perdida. Aquí la ventaja es tener capital y
aguantar, que es algo en lo que un particular sí puede competir.

## El número que decide si esto te interesa

Entrar y salir cuesta unas **4 comisiones ≈ 0,30 %** del importe. Con una financiación
típica de **0,01 % por cobro**, hacen falta **30 cobros — diez días** solo para recuperar
lo que costó abrir.

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
cp .env.example .env      # y rellénalo
npm test                  # comprueba la aritmética, sin red ni claves
npm start
```

Panel en <http://127.0.0.1:8787>.

### Claves

Testnet usa **dos cuentas distintas**, con claves distintas:

- Contado: <https://testnet.binance.vision> (se entra con GitHub)
- Perpetuos: <https://testnet.binancefuture.com>

Permisos: **lectura y trading. Nunca retirada.** Un bot no necesita poder sacar tu dinero,
y dárselo solo añade una forma de perderlo.

## Los dos interruptores

Son independientes a propósito.

**`TRADING_MODE`** — `testnet` o `live`. Se fija al arrancar y no hay forma de cambiarlo
sin reiniciar. En `live` hace falta además `YES_I_UNDERSTAND_THIS_IS_REAL_MONEY=yes`: una
variable sola no debería bastar para empezar a mover tu dinero.

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

**Si una pata falla, deshace la otra.** Quedarse comprado al contado sin el corto del
perpetuo es quedarse expuesto al precio, que es justo lo que la estrategia evita. Si
tampoco se puede deshacer, se desarma solo y avisa de que hace falta mirarlo a mano.

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

`npm test` cubre la aritmética completa: coste de ida y vuelta, cobros hasta cubrirlo,
media y consistencia, los cuatro caminos de rechazo, el orden de preferencia y el punto de
equilibrio de una posición. 24 comprobaciones, sin red ni claves.

Lo que **no** está probado contra el exchange real: la ejecución de las órdenes. Eso solo
lo prueba el uso en testnet, que es justo para lo que está el modo sin armar.
