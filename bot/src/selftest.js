/* Pruebas de la aritmética. No necesitan red ni claves: son justo la parte que decide
 * si se abre una posición, así que tiene que poder comprobarse sin depender de nadie.
 *
 *   node src/selftest.js
 */
import {
  apr, costeIdaVuelta, periodosHastaCubrirCoste, tasaMedia, consistencia,
  evaluar, ordenarCandidatos, resultadoPosicion, COBROS_POR_DIA, COMISIONES_POR_DEFECTO,
} from "./funding.js";

let fallos = 0, pasan = 0;
function comprobar(nombre, condicion, detalle = "") {
  if (condicion) { pasan++; console.log("  ✓ " + nombre); }
  else { fallos++; console.log("  ✗ " + nombre + (detalle ? "  → " + detalle : "")); }
}
function cerca(a, b, tol = 1e-9) { return Math.abs(a - b) < tol; }

console.log("\nAritmética de la estrategia\n");

// --- Coste de ida y vuelta ---
const coste = costeIdaVuelta();
comprobar("el coste de ida y vuelta son 4 comisiones (0,30 %)", cerca(coste, 0.003),
  `sale ${(coste * 100).toFixed(4)} %`);

// --- APR ---
comprobar("una tasa de 0,01 % por cobro son ~10,95 % anual",
  cerca(apr(0.0001) * 100, 10.95, 0.01), `sale ${(apr(0.0001) * 100).toFixed(2)} %`);
comprobar("hay 3 cobros al día", COBROS_POR_DIA === 3);

// --- Cuántos cobros hacen falta para cubrir el coste ---
// Este es EL número de la estrategia: con 0,01 % por cobro y 0,30 % de coste, 30 cobros = 10 días.
const per = periodosHastaCubrirCoste(0.0001);
comprobar("con 0,01 % por cobro hacen falta 30 cobros (10 días) para cubrir el coste",
  cerca(per, 30, 1e-6) && cerca(per / COBROS_POR_DIA, 10, 1e-6), `salen ${per} cobros`);
comprobar("con financiación negativa el coste no se cubre nunca",
  periodosHastaCubrirCoste(-0.0001) === Infinity);
comprobar("con financiación cero tampoco",
  periodosHastaCubrirCoste(0) === Infinity);

// --- Media y consistencia ---
comprobar("la media ignora los valores no numéricos",
  cerca(tasaMedia([0.0001, 0.0003, NaN, undefined]), 0.0002));
comprobar("la consistencia mide qué proporción fue positiva",
  cerca(consistencia([1, 1, -1, -1]), 0.5));
comprobar("un histórico vacío no revienta", tasaMedia([]) === 0 && consistencia([]) === 0);

// --- El caso que motiva todo: media buena, consistencia mala ---
// +0,05 % y -0,03 % alternos dan la misma media que un +0,01 % estable, pero no es lo mismo.
const alterno = [0.0005, -0.0003, 0.0005, -0.0003, 0.0005, -0.0003];
const estable = [0.0001, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001];
comprobar("una media parecida puede esconder comportamientos muy distintos",
  Math.abs(tasaMedia(alterno) - tasaMedia(estable)) < 0.0001
  && consistencia(alterno) < consistencia(estable));

const cfg = {
  minFundingMedioPct: 0.005,
  maxPeriodosHastaCubrirCoste: 20,
  ventanaHistorico: 24,
  cerrarSiFundingBajaDePct: 0.001,
};

console.log("\nDecisión de abrir\n");

// Financiación sana y estable: debería entrar.
const buena = evaluar("BTC/USDT", new Array(24).fill(0.0002), cfg);
comprobar("acepta una financiación sostenida de 0,02 %", buena.apto,
  buena.motivos.join(" | "));
comprobar("y dice en cuántos días cubre el coste",
  cerca(buena.diasHastaCubrirCoste, 5, 0.01), `${buena.diasHastaCubrirCoste} días`);

// Financiación positiva pero flojísima: no compensa el coste de entrar.
const floja = evaluar("ETH/USDT", new Array(24).fill(0.00002), cfg);
comprobar("rechaza una financiación demasiado floja", !floja.apto);
comprobar("y explica por qué", floja.motivos.length > 0, "no dio ningún motivo");

// Financiación negativa: nunca.
const negativa = evaluar("SOL/USDT", new Array(24).fill(-0.0002), cfg);
comprobar("rechaza la financiación negativa", !negativa.apto);
comprobar("y avisa de que el coste no se cubre nunca",
  negativa.motivos.some(m => m.includes("nunca")), negativa.motivos.join(" | "));

// Media buena pero saltando de signo: se rechaza por inconsistencia.
const inestable = evaluar("BNB/USDT", alterno.concat(alterno).concat(alterno).concat(alterno), cfg);
comprobar("rechaza una financiación que salta de signo aunque la media salga bien",
  !inestable.apto && inestable.motivos.some(m => m.includes("positivos")),
  inestable.motivos.join(" | "));

// Sin histórico: no se opera a ciegas.
const sinDatos = evaluar("XRP/USDT", [], cfg);
comprobar("no opera sin histórico", !sinDatos.apto);

console.log("\nOrden de preferencia\n");

const orden = ordenarCandidatos([
  evaluar("A/USDT", new Array(24).fill(0.0002), cfg),   // cubre en 15 cobros
  evaluar("B/USDT", new Array(24).fill(0.0004), cfg),   // cubre en 7,5
  evaluar("C/USDT", new Array(24).fill(0.00002), cfg),  // no apto
]);
comprobar("solo deja pasar los aptos", orden.length === 2);
comprobar("y pone primero al que antes cubre su coste",
  orden[0].simbolo === "B/USDT", orden.map(o => o.simbolo).join(", "));

console.log("\nResultado de una posición abierta\n");

// Recién abierta: se ha pagado la entrada y no se ha cobrado nada. Cerrar ahora es perder.
const nueva = resultadoPosicion({ nocional: 1000, fundingCobrado: 0, cobrosRecibidos: 0 });
comprobar("recién abierta, cerrar deja pérdida (se han pagado las comisiones)",
  cerca(nueva.netoSiCierraAhora, -3), `${nueva.netoSiCierraAhora} USDT`);

// Tras cobrar más de lo que costó: ya compensa.
const madura = resultadoPosicion({ nocional: 1000, fundingCobrado: 5, cobrosRecibidos: 30 });
comprobar("tras cobrar 5 USDT sobre 3 de coste, cerrar deja beneficio",
  cerca(madura.netoSiCierraAhora, 2), `${madura.netoSiCierraAhora} USDT`);

// El punto exacto de equilibrio.
const justo = resultadoPosicion({ nocional: 1000, fundingCobrado: 3, cobrosRecibidos: 18 });
comprobar("el punto de equilibrio está en haber cobrado exactamente el coste",
  cerca(justo.netoSiCierraAhora, 0));

console.log("\nComisiones distintas cambian el cálculo\n");

const baratas = { spotTaker: 0.00075, perpTaker: 0.0004 };   // pagando en BNB
const perBaratas = periodosHastaCubrirCoste(0.0001, baratas);
comprobar("con comisiones más bajas hacen falta menos cobros",
  perBaratas < per, `${perBaratas.toFixed(1)} frente a ${per.toFixed(1)}`);

console.log(`\n${pasan} pasan, ${fallos} fallan\n`);
process.exit(fallos ? 1 : 0);
