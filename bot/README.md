# Bot de arbitraje de tasa de financiación

> ## ⛔ Estado real: BLOQUEADO. No lo armes.
>
> Dos auditorías independientes (seguridad y corrección del dinero) lo declararon no apto.
> El código se niega a arrancar armado hasta que esto se arregle y se vuelva a auditar.
>
> **El problema de fondo no es un bug, es la premisa.** CCXT retiró el sandbox de futuros
> de Binance: cualquier llamada privada de futuros con `setSandboxMode` lanza
> `NotSupported` (comprobado en `ccxt@4.5.71`, `binance.js:12707`). En testnet la pata de
> perpetuos **falla siempre**, así que la propuesta de "empieza en testnet" no funciona
> tal y como está montado.
>
> Y encadena con lo peor: cada ciclo compraría al contado, fallaría el perpetuo y
> desharía la compra. Dos órdenes a mercado cada 60 s, indefinidamente. **Ningún
> cortafuegos lo detecta** —no llega a haber posición y la pérdida no se anota en ningún
> sitio— y el panel marcaría "resultado del día: 0,00". La conclusión natural sería
> "en testnet no va" y pasar a `live`, donde todo funciona, el bucle también.
>
> ### Lo que hay que arreglar antes de volver a mirarlo
>
> **De seguridad**
> 1. Bucle de órdenes sin límite ni enfriamiento cuando una pata falla (invisible a todos los límites).
> 2. El stop de pérdida diaria no puede saltar: `resultadoDelDia()` solo suma cierres voluntarios, que son positivos por construcción.
> 3. No se valida el precio: con un ticker vacío se mandan órdenes con cantidad `NaN` y se registra la posición como abierta.
> 4. El estado se carga sin validar. Un `nocional` de texto o negativo desactiva el límite de exposición.
> 5. Una petición al panel con el estado mal formado mata el proceso dejando las posiciones abiertas. *(Mitigado: ahora se desarma y guarda antes de caer, pero la causa sigue.)*
> 6. Los mensajes de error de CCXT se guardan en disco y se sirven por la API sin pasar por el tapado de secretos: la clave y la firma acaban en `data/estado.*.json` (permisos 644).
> 7. CSRF: cualquier web abierta en el equipo puede llamar a `/api/rearmar` y deshacer una parada de emergencia.
>
> **De corrección del dinero**
> 8. No es delta neutral: nunca se fija apalancamiento ni se mira el margen. Binance abre en cross 20x por defecto → el corto se liquida con una subida del 4,7 %.
> 9. El coste de cierre se calcula con el precio de entrada: con el precio +30 % cierra en pérdida creyendo que gana.
> 10. El coste real es ~0,68 %, no 0,30 %: faltan spread, deslizamiento y base. Los umbrales están calibrados sobre un coste que no existe.
> 11. Las dos patas no llevan la misma cantidad (pasos de lote distintos, comisión cobrada en el activo). Con la configuración de ejemplo, SOL/USDT quedaría con **una cuarta parte descubierta**.
> 12. Llenado parcial ignorado: si el contado llena la mitad, queda medio nocional direccional y el bot cree estar cubierto.
> 13. Si el proceso muere entre las dos órdenes no queda rastro, y al reiniciar vuelve a abrir.
> 14. Un tiempo de espera agotado se trata como "la orden no entró". Si sí entró, el "deshacer" deja un corto desnudo.
> 15. Un cierre a medias deja una pata suelta y reintenta en bucle cada 60 s, sin desarmar.
> 16. Con financiación **negativa** nunca cierra: la condición de espera se autoalimenta y sangra indefinidamente.
> 17. Desarmar no impide cerrar posiciones; el botón de pánico no para al bot del todo.
> 18. El modo sin armar no simula nada, así que "déjalo una semana y lee sus decisiones" no produce nada que juzgar.
>
> **Lo que sí está bien**, comprobado y no supuesto: la barrera `ARMED` no tiene ninguna
> grieta (5 ciclos con candidato apto → 0 órdenes); la aritmética de `funding.js` es
> correcta dentro de su modelo y está probada; no hay XSS en el panel ni travesía de rutas;
> `npm audit` limpio; la escritura del estado es atómica.
>
> **Qué se puede hacer hoy:** leer el código, pasar `npm test`, y ejecutarlo en
> `TRADING_MODE=testnet` con `ARMED=false`, que no manda ninguna orden.

---


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
