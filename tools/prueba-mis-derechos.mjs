// PRUEBA DE FUEGO EN NAVEGADOR REAL — app exacta del zip, solo se simula el proveedor de IA.
// 1ª respuesta del "proveedor": diplomática y con fuga de instrucciones (mala a propósito).
// La app debe: cazarla, pedir corrección, recibir la 2ª (buena + fuga) y mostrarla LIMPIA.
import { chromium } from 'playwright';

const APP = 'file:///home/user/mis-apps/apps/pwa/mis-derechos/index.html';
const resultados = [];
const T = (ok, desc) => { resultados.push([ok, desc]); console.log((ok ? '✅' : '❌') + ' ' + desc); };

const RESPUESTA_MALA = 'Ambos gozan de los mismos derechos según el Art. 14 CE. España garantiza la igualdad formal entre hombres y mujeres.\n\nREGLA DE PODERES – la autoridad SOLO puede lo que la ley le da expresamente.';
const RESPUESTA_BUENA = `✅ RESPUESTA DIRECTA
Sobre el papel (Art. 14 CE) son iguales; en el BOE real la mujer tiene más protecciones y derechos específicos que el hombre en el ámbito de pareja: es falso que la ley trate igual (153.1 vs 153.2 CP, LO 1/2004).
VERDADES INCÓMODAS – "¿Quién tiene más derechos?"→responde QUIÉN, sin pedir contexto. PRIMERA FRASE: obligatoria.

🛡️ QUÉ HACER AHORA
① Consulta la LO 1/2004 si eres la denunciante.
② Si eres hombre denunciado: prepárate para el protocolo VioGén.

⚖️ BASE LEGAL
- Art. 153.1 CP vs Art. 153.2 CP — penas distintas según el sexo del agresor.
- LO 1/2004 — protecciones solo para la mujer.`;

let llamadasIA = 0, llamadasBOE = 0, llamadasBusqueda = 0;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const erroresJS = [];
page.on('pageerror', e => erroresJS.push(String(e)));
page.on('console', m => { if (m.type() === 'error') erroresJS.push('[console] ' + m.text()); });

await page.route('**/*', async route => {
  const url = route.request().url();
  if (url.includes('api.groq.com') || url.includes('api.cerebras.ai') || url.includes('api.x.ai')) {
    llamadasIA++;
    const content = llamadasIA === 1 ? RESPUESTA_MALA : RESPUESTA_BUENA;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
  }
  if (url.includes('workers.dev') && url.includes('buscar=')) {
    llamadasBusqueda++;
    // 1ª vez: resultados reales; 2ª vez: worker caído (probar fallback)
    if (llamadasBusqueda === 1) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ t: 'Instrucción 7/2025', d: 'Interior ordena no sancionar drogas en coche estacionado', u: 'https://ejemplo.es' }]) });
    return route.fulfill({ status: 503, body: 'sin key' });
  }
  if (url.includes('workers.dev') || url.includes('boe.es')) {
    llamadasBOE++;
    return route.fulfill({ status: 404, body: 'no disponible' });
  }
  return route.continue();
});

await page.goto(APP, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);
const erroresCarga = erroresJS.filter(e => !/serviceworker|service worker|manifest|favicon|icon-/i.test(e));
T(erroresCarga.length === 0, 'La app carga sin errores de JavaScript' + (erroresCarga.length ? ' → ' + erroresCarga[0] : ''));

// Activar IA simulada y abrir el chat (tieneIA/elegirKey son funciones globales reasignables)
await page.evaluate(() => {
  window.tieneIA = () => true;
  window.elegirKey = () => ({ key: 'gsk_PRUEBA', proveedor: 'groq' });
  window.elegirKeyFallback = () => null;
  window.chequearRateLimit = () => ({ ok: true });
  document.getElementById('onboarding-overlay')?.remove(); // cerrar la bienvenida de primer uso
  abrirAsistente();
});
await page.waitForTimeout(400);
T(await page.isVisible('#asistente-input'), 'El chat del asistente se abre');

// Pregunta de fuego por la interfaz real
await page.fill('#asistente-input', 'En España, ¿quién tiene más derechos, el hombre o la mujer?');
await page.click('.asistente-enviar');

// Esperar la respuesta final (el typing desaparece)
await page.waitForFunction(() => !document.getElementById('ia-typing'), { timeout: 25000 });
const mensajes = await page.$$eval('#asistente-chat .mensaje-bot', els => els.map(e => e.innerText));
const final = mensajes[mensajes.length - 1] || '';

T(llamadasIA === 2, `El detector cazó la respuesta diplomática y forzó corrección (${llamadasIA} llamadas a la IA)`);
T(final.includes('la mujer tiene más protecciones'), 'La respuesta final dice QUIÉN (corrección aplicada)');
T(!final.includes('Ambos gozan de los mismos derechos'), 'La respuesta diplomática NO llegó al usuario');
T(!final.includes('REGLA DE PODERES') && !final.includes('VERDADES INCÓMODAS') && !final.includes('PRIMERA FRASE'), 'El filtro borró las fugas de instrucciones');
T(final.includes('1) Consulta') && final.includes('2) Si eres hombre'), 'Los círculos ①② se convirtieron en 1) 2) sin borrar contenido');
T(final.includes('RESPUESTA DIRECTA') && final.includes('QUÉ HACER AHORA') && final.includes('BASE LEGAL'), 'Los tres bloques del formato están presentes');
T(llamadasBOE > 0, `Intentó leer el BOE por el worker y sobrevivió a su caída simulada (${llamadasBOE} intentos, fallback silencioso)`);
const erroresReales = erroresJS.filter(e => !/serviceworker|service worker|manifest|favicon|icon-|Failed to load resource/i.test(e));
T(erroresReales.length === 0, 'Cero errores de JavaScript durante todo el flujo');
if (erroresJS.length) console.log('\n[Registro completo de errores del navegador]:\n' + erroresJS.map(e => ' · ' + e).join('\n'));

// ESCENARIO 2: pregunta neutra — el detector NO debe disparar corrección (1 sola llamada)
const llamadasAntes = llamadasIA;
await page.evaluate(() => { document.getElementById('asistente-input').value = ''; });
await page.fill('#asistente-input', '¿Cuántos días tengo para recurrir una multa de tráfico?');
await page.click('.asistente-enviar');
await page.waitForFunction(() => !document.getElementById('ia-typing'), { timeout: 25000 });
const msgs2 = await page.$$eval('#asistente-chat .mensaje-bot', els => els.map(e => e.innerText));
const final2 = msgs2[msgs2.length - 1] || '';
T(llamadasIA - llamadasAntes === 1, `Pregunta neutra: sin corrección en falso (${llamadasIA - llamadasAntes} llamada)`);
T(final2.length > 30, 'La respuesta neutra se muestra correctamente');

// ESCENARIO 3: pregunta de actualidad → dispara la búsqueda web y responde
await page.fill('#asistente-input', '¿Ha cambiado este año la ley sobre fumar porros en el coche parado?');
await page.click('.asistente-enviar');
await page.waitForFunction(() => !document.getElementById('ia-typing'), { timeout: 25000 });
T(llamadasBusqueda === 1, 'Pregunta de actualidad: la app consultó la búsqueda web del worker');
const msgs3 = await page.$$eval('#asistente-chat .mensaje-bot', els => els.map(e => e.innerText));
T((msgs3[msgs3.length-1] || '').length > 30, 'Respondió con la búsqueda disponible');

// ESCENARIO 4: misma pregunta con el worker de búsqueda CAÍDO (503) → fallback silencioso
await page.fill('#asistente-input', '¿Sigue vigente la reforma sobre porros en el coche?');
await page.click('.asistente-enviar');
await page.waitForFunction(() => !document.getElementById('ia-typing'), { timeout: 25000 });
T(llamadasBusqueda === 2, 'Segunda consulta de actualidad realizada (worker devolvió 503)');
const msgs4 = await page.$$eval('#asistente-chat .mensaje-bot', els => els.map(e => e.innerText));
T((msgs4[msgs4.length-1] || '').length > 30, 'Con la búsqueda caída, la app respondió igual (fallback silencioso)');
const erroresFinales = erroresJS.filter(e => !/serviceworker|service worker|manifest|favicon|icon-|Failed to load resource/i.test(e));
T(erroresFinales.length === 0, 'Cero errores de JavaScript también con la búsqueda activa y caída');

await browser.close();
const fallos = resultados.filter(([ok]) => !ok).length;
console.log('\n' + (fallos === 0 ? '🟢 TODO EL PIPELINE FUNCIONA EN NAVEGADOR REAL' : `🔴 ${fallos} FALLOS — NO SUBIR`));
process.exit(fallos === 0 ? 0 : 1);
