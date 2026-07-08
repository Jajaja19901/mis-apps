/* ============================================================================
 * 10-PWA — Vigía IA · Funcionalidad Web App (manifest, SW, botón instalar,
 *          Wake Lock y degradación automática de FPS).
 * Prefijo: pwa_ / PWA_
 * ==========================================================================*/

/* ---- Inicialización de PWA --------------------------------------------------*/
function pwa_init() {
  /* Crear estado.pwa */
  try {
    estado.pwa = {
      swEstado: '',
      instalable: false,
      wakeLock: null,
      fpsUsuario: estado.cfg.fps,
    };
  } catch (e) {
    console.warn('[pwa] error creando estado.pwa:', e && e.message);
  }

  /* Bloque 1: Generar e inyectar manifest inline (icono SVG + canvas) */
  try {
    const icono512 = pwa_generarIcono(512);
    const icono192 = pwa_generarIcono(192);
    const manifest = {
      name: CONFIG.NOMBRE_APP,
      short_name: 'Vigía',
      start_url: '.',
      display: 'standalone',
      background_color: '#0b0f14',
      theme_color: '#0b0f14',
      icons: [
        { src: icono512, sizes: '512x512', type: 'image/png' },
        { src: icono192, sizes: '192x192', type: 'image/png' },
      ],
    };
    const manifestStr = JSON.stringify(manifest);
    const manifestDataUri = 'data:application/manifest+json,' + encodeURIComponent(manifestStr);
    const linkManifest = document.createElement('link');
    linkManifest.rel = 'manifest';
    linkManifest.href = manifestDataUri;
    document.head.appendChild(linkManifest);
  } catch (e) {
    console.warn('[pwa] error inyectando manifest:', e && e.message);
  }

  /* Bloque 2: Metas Apple e inyectar si no existen */
  try {
    const metasApple = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    ];
    metasApple.forEach((meta) => {
      if (!document.querySelector('meta[name="' + meta.name + '"]')) {
        const el = document.createElement('meta');
        el.name = meta.name;
        el.content = meta.content;
        document.head.appendChild(el);
      }
    });
    /* Apple touch icon */
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const linkApple = document.createElement('link');
      linkApple.rel = 'apple-touch-icon';
      linkApple.href = pwa_generarIcono(192);
      document.head.appendChild(linkApple);
    }
  } catch (e) {
    console.warn('[pwa] error inyectando metas Apple:', e && e.message);
  }

  /* Bloque 3: Favicon */
  try {
    if (!document.querySelector('link[rel="icon"]')) {
      const linkFavicon = document.createElement('link');
      linkFavicon.rel = 'icon';
      linkFavicon.href = pwa_generarIcono(192);
      document.head.appendChild(linkFavicon);
    }
  } catch (e) {
    console.warn('[pwa] error inyectando favicon:', e && e.message);
  }

  /* Bloque 4: Service Worker con caché cache-first */
  try {
    const swCode = `
      const CACHE_NAME = 'vigia-v1';
      const URLS_CACHE = ['cdn.jsdelivr.net', 'storage.googleapis.com', 'tfhub.dev'];

      self.addEventListener('install', (evt) => {
        self.skipWaiting();
      });

      self.addEventListener('activate', (evt) => {
        evt.waitUntil(
          caches.keys().then((names) => {
            return Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
          })
        );
        self.clients.claim();
      });

      self.addEventListener('fetch', (evt) => {
        if (evt.request.method !== 'GET') return;
        const url = evt.request.url;
        const esCDN = URLS_CACHE.some((origen) => url.indexOf(origen) !== -1);
        if (!esCDN) return;

        evt.respondWith(
          caches.match(evt.request).then((cached) => {
            if (cached) return cached;
            return fetch(evt.request).then((resp) => {
              if (!resp || resp.status !== 200 || resp.type === 'error') return resp;
              const clon = resp.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(evt.request, clon);
              });
              return resp;
            }).catch(() => {
              return cached || new Response('No disponible offline', { status: 503 });
            });
          })
        );
      });
    `;
    const blob = new Blob([swCode], { type: 'text/javascript' });
    const swUrl = URL.createObjectURL(blob);
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register(swUrl).then((reg) => {
        estado.pwa.swEstado = 'activo';
      }).catch((err) => {
        console.warn('[pwa] SW register rechazado:', err && err.message);
        estado.pwa.swEstado = 'no disponible en este navegador (los modelos usarán la caché normal)';
      });
    }
  } catch (e) {
    console.warn('[pwa] error registrando SW:', e && e.message);
    estado.pwa.swEstado = 'no disponible en este navegador (los modelos usarán la caché normal)';
  }

  /* Bloque 5: Botón "Instalar app" y beforeinstallprompt */
  try {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      estado.pwa.instalable = true;
      const btn = document.getElementById('pwa-instalar');
      if (!btn) {
        const nuevoBt = document.createElement('button');
        nuevoBt.id = 'pwa-instalar';
        nuevoBt.className = 'btn btn-mini';
        nuevoBt.textContent = '⬇ Instalar app';
        nuevoBt.style.cssText =
          'position:fixed;bottom:12px;right:12px;z-index:700;' +
          'padding:8px 12px;background-color:#2ee584;color:#0b0f14;border:none;' +
          'border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;';
        document.body.appendChild(nuevoBt);
        nuevoBt.addEventListener('click', () => {
          e.prompt();
          e.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
              nuevoBt.remove();
            }
          });
        });
      }
    });
    /* iOS: detectar y mostrar aviso */
    if (/iPhone|iPad/i.test(navigator.userAgent) && !window.navigator.standalone) {
      const yaAvisado = nuc_cargar('pwa_iosAviso', false);
      if (!yaAvisado) {
        if (typeof ui_toast === 'function') {
          ui_toast('📱 Para instalar: Compartir → Añadir a pantalla de inicio', 'info');
        }
        nuc_guardar('pwa_iosAviso', true);
      }
    }
  } catch (e) {
    console.warn('[pwa] error con beforeinstallprompt:', e && e.message);
  }

  /* Bloque 6: Wake Lock — escuchar video:listo y activar */
  try {
    bus.on('video:listo', () => {
      pwa_wakeLock(true).catch((err) => {
        console.warn('[pwa] error al pedir wake lock al estar listo el vídeo:', err && err.message);
      });
    });
  } catch (e) {
    console.warn('[pwa] error suscribiendo a video:listo para wake lock:', e && e.message);
  }

  /* Bloque 7: Degradación automática de FPS cada 5s */
  try {
    let ultimosCiclos = [];
    let banderaFpsUsuario = false;
    const INTERVALO_FPS = 5000;

    setInterval(() => {
      try {
        const ms = estado.video.msInferencia;
        if (ms > 0) {
          ultimosCiclos.push(ms);
          if (ultimosCiclos.length > 10) ultimosCiclos.shift();
        }
        const mediaMs = ultimosCiclos.length > 0
          ? ultimosCiclos.reduce((a, b) => a + b, 0) / ultimosCiclos.length
          : 0;
        const presupuesto = 1000 / estado.cfg.fps;
        if (mediaMs > 0.66 * presupuesto && estado.cfg.fps > 3) {
          estado.cfg.fps--;
          nuc_guardar('cfg', estado.cfg);
          bus.emit('rendimiento:fpsBajado', { fps: estado.cfg.fps });
          bus.emit('cfg:cambio', { clave: 'fps' });
          banderaFpsUsuario = false;
        } else if (mediaMs < 0.3 * presupuesto && estado.cfg.fps < estado.pwa.fpsUsuario) {
          estado.cfg.fps++;
          nuc_guardar('cfg', estado.cfg);
          bus.emit('cfg:cambio', { clave: 'fps' });
          banderaFpsUsuario = false;
        }
      } catch (e) {
        console.warn('[pwa] error en degradación FPS:', e && e.message);
      }
    }, INTERVALO_FPS);

    /* Escuchar cambio de fps por el usuario */
    bus.on('cfg:cambio', (datos) => {
      try {
        if (datos.clave === 'fps') {
          if (!banderaFpsUsuario) {
            banderaFpsUsuario = true;
            estado.pwa.fpsUsuario = estado.cfg.fps;
            setTimeout(() => {
              banderaFpsUsuario = false;
            }, 100);
          }
        }
      } catch (e) {
        console.warn('[pwa] error en listener cfg:cambio:', e && e.message);
      }
    });
  } catch (e) {
    console.warn('[pwa] error configurando degradación de FPS:', e && e.message);
  }
}

/* ---- Generar icono en canvas ------------------------------------------------*/
function pwa_generarIcono(tamaño) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = tamaño;
    canvas.height = tamaño;
    const ctx = canvas.getContext('2d');

    /* Fondo oscuro */
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, tamaño, tamaño);

    /* Círculo verde (escudo) */
    const radio = tamaño * 0.35;
    ctx.fillStyle = '#2ee584';
    ctx.beginPath();
    ctx.arc(tamaño / 2, tamaño / 2, radio, 0, 2 * Math.PI);
    ctx.fill();

    /* Pictograma cámara: rectángulo redondeado + lente + soporte */
    const margenCamara = tamaño * 0.15;
    const anchoBody = tamaño * 0.5;
    const altoBody = tamaño * 0.35;
    const xBody = tamaño / 2 - anchoBody / 2;
    const yBody = tamaño / 2 - altoBody / 2;

    ctx.fillStyle = '#0b0f14';

    /* Cuerpo: rectángulo redondeado */
    ctx.beginPath();
    const radio2 = 4;
    ctx.moveTo(xBody + radio2, yBody);
    ctx.lineTo(xBody + anchoBody - radio2, yBody);
    ctx.quadraticCurveTo(xBody + anchoBody, yBody, xBody + anchoBody, yBody + radio2);
    ctx.lineTo(xBody + anchoBody, yBody + altoBody - radio2);
    ctx.quadraticCurveTo(xBody + anchoBody, yBody + altoBody, xBody + anchoBody - radio2, yBody + altoBody);
    ctx.lineTo(xBody + radio2, yBody + altoBody);
    ctx.quadraticCurveTo(xBody, yBody + altoBody, xBody, yBody + altoBody - radio2);
    ctx.lineTo(xBody, yBody + radio2);
    ctx.quadraticCurveTo(xBody, yBody, xBody + radio2, yBody);
    ctx.closePath();
    ctx.fill();

    /* Lente circular */
    const radioLente = tamaño * 0.12;
    ctx.fillStyle = '#0b0f14';
    ctx.beginPath();
    ctx.arc(tamaño / 2, tamaño / 2 - tamaño * 0.05, radioLente, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#2ee584';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    /* Soporte (triángulo abajo) */
    ctx.fillStyle = '#2ee584';
    ctx.beginPath();
    ctx.moveTo(tamaño / 2 - tamaño * 0.1, yBody + altoBody);
    ctx.lineTo(tamaño / 2 + tamaño * 0.1, yBody + altoBody);
    ctx.lineTo(tamaño / 2, yBody + altoBody + tamaño * 0.08);
    ctx.closePath();
    ctx.fill();

    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[pwa] error generando icono canvas:', e && e.message);
    return '';
  }
}

/* ---- Wake Lock: mantener pantalla encendida ---------------------------------*/
async function pwa_wakeLock(on) {
  try {
    if (!navigator.wakeLock) {
      if (on) {
        /* Aviso UNA sola vez */
        const yaAvisadoWL = nuc_cargar('pwa_wlAviso', false);
        if (!yaAvisadoWL) {
          bus.emit('error:general', {
            msg: 'Tu navegador no permite mantener la pantalla encendida: desactiva el apagado automático en los ajustes del móvil.',
          });
          nuc_guardar('pwa_wlAviso', true);
        }
      }
      return;
    }

    if (on) {
      try {
        estado.pwa.wakeLock = await navigator.wakeLock.request('screen');
        /* Re-adquirir si vuelve a ser visible */
        const manejadorVisibilidad = () => {
          try {
            if (document.visibilityState === 'visible' && estado.pwa.wakeLock === null) {
              navigator.wakeLock.request('screen').then((lock) => {
                estado.pwa.wakeLock = lock;
              }).catch(() => {});
            }
          } catch (e) {}
        };
        if (!document.getElementById('pwa_vizListenerRegistrado')) {
          document.addEventListener('visibilitychange', manejadorVisibilidad);
          document.id = 'pwa_vizListenerRegistrado';
        }
      } catch (e) {
        console.warn('[pwa] error pidiendo wake lock:', e && e.message);
        estado.pwa.wakeLock = null;
      }
    } else {
      if (estado.pwa.wakeLock) {
        try {
          await estado.pwa.wakeLock.release();
        } catch (e) {
          console.warn('[pwa] error liberando wake lock:', e && e.message);
        }
        estado.pwa.wakeLock = null;
      }
    }
  } catch (e) {
    console.warn('[pwa] error en pwa_wakeLock:', e && e.message);
  }
}
