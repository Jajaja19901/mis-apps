/* ============================================================================
 * 21-MODOS — VIGÍA IA · selector de modos de uso (la barra de chips).
 * Prefijo: modos_ / MODOS_. Estado interno en estado.modos.
 *
 * PROBLEMA QUE RESUELVE: la app tiene 6 usos distintos (comercio, parking,
 * copiloto, casa, centinela, mando) y hasta ahora TODOS los paneles se
 * apilaban juntos en la misma pantalla: imposible de manejar. Esta barra
 * separa los modos: al elegir uno se enseñan SOLO sus paneles y se ocultan
 * los demás. No se pierde ninguna opción: todas siguen ahí, cada una en su
 * modo, y los ajustes generales siguen en ⚙ Ajustes.
 *
 * QUÉ NO HACE: no activa ni desactiva funciones por sí solo (cambiar de vista
 * no enciende cámaras ni sensores). Activar el copiloto, la casa o el
 * centinela se hace con el botón grande DENTRO de su panel. Las únicas
 * excepciones son cfg.modo (super/carretera, que es solo el perfil de
 * análisis) y el modo mando (que ya gestionaba su propia entrada/salida).
 *
 * SEGURIDAD: todo con guarda-clauses; funciona sin vídeo, sin modelos y en
 * headless. Un módulo ausente (typeof === 'undefined') no rompe nada.
 * ==========================================================================*/

/* Definición de cada vista: qué secciones enseña y qué perfil de análisis usa.
 * 'modo' (super/carretera) solo se toca en las vistas que lo necesitan. */
const MODOS_DEF = {
  comercio:  { modo: 'super',     zonas: true, secs: ['ui-secVideo', 'ui-contadores', 'ui-secAlertas', 'ui-secStats'] },
  carretera: { modo: 'carretera', zonas: true, secs: ['ui-secVideo', 'ui-contadores', 'ui-secAlertas', 'ui-secStats', 'ui-secCarretera'] },
  copiloto:  {                                 secs: ['ui-secVideo', 'ui-secCopiloto', 'ui-secAlertas'] },
  casa:      { modo: 'super',     zonas: true, secs: ['ui-secVideo', 'ui-secCasa', 'ui-secAlertas'] },
  // Centinela usa su PROPIA cámara frontal (invisible) + su panel de estado; NO
  // muestra el visor principal (evita el choque de dos cámaras) ni la barra de zonas.
  centinela: {                                 secs: ['ui-secCentinela'] },
  mando:     {                                 secs: ['ui-secMando'] },
};
const MODOS_VISTAS = Object.keys(MODOS_DEF);
/* Todas las secciones que este módulo gobierna (unión de las de arriba). */
const MODOS_SECS = ['ui-secVideo', 'ui-contadores', 'ui-secAlertas', 'ui-secStats',
  'ui-secCarretera', 'ui-secCopiloto', 'ui-secCasa', 'ui-secCentinela', 'ui-secMando'];

function modos_init() {
  if (estado.modos && estado.modos.inited) return;
  estado.modos = { inited: false, vista: 'comercio', seteando: false };

  // Chips de la barra.
  MODOS_VISTAS.forEach(function (v) {
    const chip = document.querySelector('.modos-chip[data-vista="' + v + '"]');
    if (chip) chip.addEventListener('click', function () { modos_ir(v); });
  });

  // Botón de activación del copiloto DENTRO de su panel (antes era el del header).
  const btnCop = document.getElementById('cop-btnActivar');
  if (btnCop) btnCop.addEventListener('click', function () {
    if (typeof cop_alternar === 'function') cop_alternar();
    modos_aplicar();   // cop_aplicar toca la visibilidad de su sección: re-imponer la vista
    modos_sincronizarBotones();
  });

  // Si el dueño cambia el modo desde Ajustes u onboarding, la vista acompaña
  // (solo entre comercio↔carretera; las demás vistas fijan su modo a propósito).
  if (typeof bus !== 'undefined' && bus.on) {
    bus.on('cfg:cambio', function (d) {
      if (!d || d.clave !== 'modo' || estado.modos.seteando) return;
      const v = estado.modos.vista;
      if (v !== 'comercio' && v !== 'carretera') return;
      const objetivo = estado.cfg.modo === 'carretera' ? 'carretera' : 'comercio';
      if (v !== objetivo) modos_ir(objetivo);
    });
  }

  // Vista inicial: la guardada; si no, se deduce de lo que estaba activo.
  let inicial = nuc_cargar('modos_vista', null);
  if (MODOS_VISTAS.indexOf(inicial) < 0) {
    if (estado.mando && estado.mando.activo) inicial = 'mando';
    else if (estado.cfg.copActivo) inicial = 'copiloto';
    else if (estado.cfg.casaActivo) inicial = 'casa';
    else inicial = (estado.cfg.modo === 'carretera') ? 'carretera' : 'comercio';
  }
  estado.modos.vista = inicial;
  estado.modos.inited = true;
  modos_aplicar();
}

function modos_vista() { return estado.modos ? estado.modos.vista : 'comercio'; }

/* Apaga los sistemas que NO pertenecen a la vista actual, para que no se pisen.
 * EXCEPCIÓN de coche: Copiloto (trasera→carretera) y Centinela (frontal→conductor)
 * son COMPLEMENTARIOS y pueden convivir — entre sus dos vistas no se apagan
 * mutuamente (es la combinación «dos cámaras a la vez», si el móvil la permite).
 * Cada apagado es idempotente y seguro (solo actúa si estaba encendido). */
function modos_aislar(vista) {
  const enCoche = (vista === 'copiloto' || vista === 'centinela');
  try {
    // Copiloto: sigue vivo también en la vista Centinela (pareja de coche).
    if (!enCoche && estado.cfg.copActivo && typeof cop_alternar === 'function') cop_alternar(false);
  } catch (e) {}
  try {
    // Casa: alarma, roles, paquetería, batería… → solo en su vista.
    if (vista !== 'casa' && estado.cfg.casaActivo && typeof casa_alternar === 'function') casa_alternar(false);
  } catch (e) {}
  try {
    // Centinela: sigue vivo también en la vista Copiloto (pareja de coche).
    if (!enCoche && typeof dms_activo === 'function' && dms_activo() && typeof dms_alternar === 'function') dms_alternar(false);
  } catch (e) {}
}

/* Cambia de vista y aplica. */
function modos_ir(vista) {
  if (MODOS_VISTAS.indexOf(vista) < 0 || !estado.modos) return;
  const anterior = estado.modos.vista;
  estado.modos.vista = vista;
  nuc_guardar('modos_vista', vista);

  // El modo mando gestiona su propia entrada/salida (conexión remota).
  if (typeof mando_alternar === 'function') {
    try {
      if (vista === 'mando' && (!estado.mando || !estado.mando.activo)) mando_alternar(true);
      if (vista !== 'mando' && anterior === 'mando' && estado.mando && estado.mando.activo) mando_alternar(false);
    } catch (e) {}
  }
  modos_aplicar();
}

/* Impone la vista actual: secciones, chips, perfil de análisis y botón Aforo. */
function modos_aplicar() {
  if (!estado.modos) return;
  const vista = estado.modos.vista;
  const def = MODOS_DEF[vista] || MODOS_DEF.comercio;

  // 0) AÍSLA: un modo cada vez. Al entrar en una vista, se APAGAN los sistemas
  //    de los demás modos (si no, el copiloto seguiría avisando de «peatón» en
  //    Comercio, la casa vigilaría en Parking, etc. — sistemas mezclados).
  modos_aislar(vista);

  // 1) Secciones: solo las de la vista.
  MODOS_SECS.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('oculto', def.secs.indexOf(id) < 0);
  });

  // 1b) Barra de zonas y de detalle: solo en los modos que usan zonas de escena
  //     (comercio, parking, casa). En copiloto/centinela/mando sobran y confunden.
  const verZonas = !!def.zonas;
  ['zona-toolbar', 'det-barra'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('oculto', !verZonas);
  });

  // 2) Chips: marcar el activo.
  MODOS_VISTAS.forEach(function (v) {
    const chip = document.querySelector('.modos-chip[data-vista="' + v + '"]');
    if (chip) {
      chip.classList.toggle('activo', v === vista);
      chip.setAttribute('aria-pressed', v === vista ? 'true' : 'false');
    }
  });

  // 3) Perfil de análisis (super/carretera) si la vista lo fija.
  if (def.modo && estado.cfg.modo !== def.modo) {
    estado.modos.seteando = true;
    estado.cfg.modo = def.modo;
    nuc_guardar('cfg', estado.cfg);
    if (typeof bus !== 'undefined') bus.emit('cfg:cambio', { clave: 'modo' });
    estado.modos.seteando = false;
  }

  // 4) El botón Aforo solo tiene sentido en comercio/parking.
  const aforo = document.getElementById('ui-btnAforo');
  if (aforo) aforo.classList.toggle('oculto', vista !== 'comercio' && vista !== 'carretera');

  // 5) La sección «Cerebro remoto» de Ajustes solo aparece en el modo Mando
  //    (fuera de él solo confunde: es la salud/configuración del equipo remoto).
  const secCerebro = document.getElementById('mdash-secCerebro');
  if (secCerebro) secCerebro.classList.toggle('oculto', vista !== 'mando');

  modos_sincronizarBotones();
  if (typeof bus !== 'undefined') bus.emit('modos:vista', { vista: vista });
}

/* Textos de los botones de activación internos (copiloto). */
function modos_sincronizarBotones() {
  const btnCop = document.getElementById('cop-btnActivar');
  if (btnCop) {
    const on = !!estado.cfg.copActivo;
    btnCop.textContent = on ? '⏹ Desactivar copiloto' : '▶ Activar copiloto';
    btnCop.classList.toggle('btn-primario', !on);
    btnCop.classList.toggle('btn-peligro', on);
  }
}
