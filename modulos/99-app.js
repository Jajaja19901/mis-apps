/* ============================================================================
 * 99-APP — arranque y bucle principal (integrador, Fase 2).
 * Orquesta: componer → inferir → tracker → zonas → gestos/carretera → stats.
 * ==========================================================================*/

let app_ocupado = false;        // evita re-entrar en la inferencia async
let app_ultimaInferencia = 0;   // ts del último frame inferido
let app_framesInferidos = 0;
let app_fpsDesde = 0;

async function app_init() {
  try {
    nuc_init();
    // Inits síncronos (orden: UI primero para que existan banners/toasts)
    ui_init();
    vid_init();
    zona_init();
    trk_init();
    alerta_init();
    stats_init();
    car_init();
    cfg_init();
    pwa_init();

    estado.arrancado = true;

    // Cargas pesadas en paralelo, sin bloquear la interfaz
    nuc_cargarModelos().catch(() => {});
    gesto_init().catch(() => {});

    // Onboarding la primera vez (elige modo → fuente → primera línea/zona)
    ui_onboarding();

    requestAnimationFrame(app_ciclo);
  } catch (e) {
    console.warn('[app] fallo en el arranque:', e && e.message);
    try { ui_error('La aplicación no pudo arrancar del todo: ' + (e && e.message)); } catch (e2) {}
  }
}

function app_ciclo(tsAnim) {
  try {
    const ahora = Date.now();

    // 1) Componer SIEMPRE (frame + pintores + fecha/hora + REC + privacidad)
    vid_componer();

    // 2) Inferencia limitada a cfg.fps, sin re-entrar
    const intervalo = 1000 / nuc_clamp(estado.cfg.fps || 8, 3, 10);
    if (!app_ocupado && estado.modelos.cocoListo && estado.video.listo &&
        (ahora - app_ultimaInferencia) >= intervalo) {
      app_ocupado = true;
      app_ultimaInferencia = ahora;
      const t0 = performance.now();
      nuc_detectar(vid_fuente()).then((dets) => {
        try {
          estado.detecciones = dets;
          trk_actualizar(dets, ahora);
          zona_evaluar(estado.tracks, ahora);
          if (estado.cfg.modo === 'super') gesto_procesar(vid_fuente(), ahora);
          if (estado.cfg.modo === 'carretera') car_evaluar(estado.tracks, ahora);
          stats_acumular(estado.tracks, ahora);
          estado.video.msInferencia = performance.now() - t0;
          // FPS real medido (ventana de 3s)
          app_framesInferidos++;
          if (!app_fpsDesde) app_fpsDesde = ahora;
          if (ahora - app_fpsDesde >= 3000) {
            estado.video.fpsReal = Math.round(app_framesInferidos / ((ahora - app_fpsDesde) / 1000) * 10) / 10;
            app_framesInferidos = 0; app_fpsDesde = ahora;
          }
          bus.emit('frame', { ts: ahora });
        } catch (e) {
          console.warn('[app] fallo procesando frame:', e && e.message);
        }
        app_ocupado = false;
      }).catch((e) => {
        console.warn('[app] fallo en detección:', e && e.message);
        app_ocupado = false;
      });
    }

    // 3) Vigilancia anti-sabotaje (throttle interno del módulo)
    vid_vigilarSabotaje(ahora);

    // 4) Refresco de UI (throttle interno ~500ms)
    ui_render();
  } catch (e) {
    console.warn('[app] fallo en el ciclo:', e && e.message);
  }
  requestAnimationFrame(app_ciclo);
}

// Arranque
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { app_init(); });
} else {
  app_init();
}
