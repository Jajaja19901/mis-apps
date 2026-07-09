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
    // v2 — puesto de mando remoto (idempotentes: tienen guarda interna)
    if (typeof mando_init === 'function') mando_init();
    if (typeof mdash_init === 'function') mdash_init();
    // Ampliación — detalle/recorrido y copiloto/coche (idempotentes)
    if (typeof det_init === 'function') det_init();
    if (typeof cop_init === 'function') cop_init();
    if (typeof acc_init === 'function') acc_init();   // acciones avanzadas
    if (typeof mat_init === 'function') mat_init();   // matrícula (evidencia)
    // Supercerebro (ONNX-YOLO11): init siempre; si era el motor elegido,
    // reactiva el modelo guardado (desde la caché, sin re-descargar).
    if (typeof sc_init === 'function') {
      sc_init();
      if (estado.cfg.motor === 'onnx' && typeof sc_activar === 'function') {
        sc_activar(estado.cfg.scModelo || 'n').catch(() => {});
      }
    }

    estado.arrancado = true;

    // Pintores que no registra ningún módulo por sí mismo (orden del §6):
    // zonas(10), calor(40) y carretera(50) se registran solos en sus init.
    vid_registrarPintor('tracks', trk_pintar, 20);
    vid_registrarPintor('gestos', gesto_pintar, 30);

    // Al cambiar de fuente de vídeo, el tracker parte de cero (ids limpios)
    bus.on('video:listo', () => { try { trk_reiniciar(); } catch (e) {} });

    // Cargas pesadas en paralelo, sin bloquear la interfaz
    nuc_cargarModelos().catch(() => {});         // motor rápido (siempre, como respaldo)
    if (estado.cfg.motor === 'yolo' && typeof yolo_init === 'function') {
      yolo_init().catch(() => {});               // motor potente si el dueño lo eligió
    }
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
    const intervalo = 1000 / nuc_clamp(estado.cfg.fps || 8, 3, 20);
    if (!app_ocupado && nuc_modeloListo() && estado.video.listo &&
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
