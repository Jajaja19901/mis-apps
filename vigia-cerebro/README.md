# VIGÍA CEREBRO

Un "cerebro" que vigila tus cámaras las 24 horas, en un aparato tuyo (no en la
nube de nadie). Analiza lo que ven tus cámaras y te avisa por Telegram si pasa
algo que merece tu atención. **Tus imágenes no salen de tu casa**, salvo los
avisos puntuales que TÚ decides mandarte a ti mismo por Telegram.

No es una alarma profesional ni sustituye a un servicio de seguridad. Es una
herramienta honesta para tener un ojo extra sobre tu comercio o tu casa.

---

## ¿Qué necesito?

1. **Cámaras IP** que ya tengas en casa o el negocio (Tapo, Ezviz, Reolink,
   Imou, Hikvision u otras que hablen RTSP).
2. **Un aparato que esté siempre encendido** y conectado a la misma red que
   las cámaras: un mini PC, una Raspberry Pi, o (con limitaciones) un móvil
   Android viejo. Ese aparato es el "cerebro".
3. **El móvil desde el que quieras vigilar** (con la app VIGÍA instalada o
   abierta en el navegador).

## ¿Qué hardware me hace falta? (límites honestos)

| Aparato | Cámaras recomendadas | Gestos de ocultación | Notas |
|---|---|---|---|
| **Mini PC (Intel N100 o similar)** | 4-6 | Sí | La opción más estable y potente. Recomendada si vas en serio. |
| **Raspberry Pi 4 / 5** | 2-4 sin gestos, 1-2 con gestos | Sí, pero baja el número de cámaras | Buena relación precio/consumo. La Pi 5 rinde bastante mejor que la 4. |
| **Android + Termux** | 1-2 | No (no instala en la mayoría de móviles) | Experimental. Sirve para probar o para un caso muy pequeño, no para producción seria. |

Estos números son orientativos: dependen de la resolución de tus cámaras, de
cuánta gente/movimiento haya delante y de qué más esté haciendo el aparato.
Si notas que va lento, baja el número de cámaras en modo `prioridad 3`, baja
`fps_objetivo` en `config.yaml`, o quita cámaras de menor prioridad.

## Instalación en 5 pasos

1. **Descarga el proyecto** en tu mini PC / Raspberry Pi:
   ```bash
   git clone <URL-del-repositorio>
   cd vigia-cerebro
   ```
   (o descarga el ZIP desde GitHub y descomprímelo).

2. **Ejecuta el instalador**:
   ```bash
   chmod +x instalar.sh
   ./instalar.sh
   ```

3. **Sigue el asistente**: te preguntará por tus cámaras (marca, IP, usuario,
   contraseña), el modo de cada una (comercio/casa/parking), y opcionalmente
   tu Telegram para recibir avisos con foto y vídeo.

4. Al final verás una **URL pública** y un **código QR** en la terminal.
   **Escanea ese QR desde la app VIGÍA** (o pega la URL y el token a mano si
   no puedes escanear).

5. **Listo.** El cerebro ya está vigilando. Si quieres que arranque solo cada
   vez que enciendas el equipo, el propio instalador te ofrece instalar el
   servicio automático (systemd) al final.

> ¿Tienes Android en vez de un mini PC? Ejecuta en su lugar
> `termux/instalar-termux.sh` desde Termux. Es más limitado (ver tabla de
> arriba) — léelo antes de empezar.

## Cómo conectar la app (modo mando)

La app VIGÍA tiene un botón **"🧠 Mando"** en la cabecera. Al activarlo te
pedirá:

- **URL** del cerebro (la que te dio el instalador, algo como
  `https://xxxxx.trycloudflare.com`).
- **Token** (el código de 32 letras/números que también te dio el instalador).

Puedes pegarlos a mano, o pegar el contenido completo del QR
(`vigia://URL#TOKEN`) y la app lo separa sola. Desde ahí verás el vídeo de tus
cámaras, podrás armar/desarmar, recibir alertas en vivo y revisar el
historial — todo igual que si estuvieras delante del cerebro.

## URL fija (para no tener que escanear el QR cada vez)

Por defecto, el instalador usa el **túnel rápido y gratuito** de Cloudflare
(`trycloudflare.com`). Es cómodo y no requiere cuenta, pero **la URL cambia
cada vez que el túnel se reinicia** (por ejemplo, al reiniciar el equipo).

Si quieres una URL que **nunca cambie**:

1. Crea una cuenta gratuita en [Cloudflare](https://dash.cloudflare.com) y
   añade un dominio (puede ser uno que ya tengas, o uno gratuito de algún
   proveedor).
2. Instala `cloudflared` como ya tienes en `./bin/cloudflared` y sigue la guía
   oficial de Cloudflare para crear un **túnel con nombre**
   (`cloudflared tunnel create vigia`, `cloudflared tunnel route dns vigia
   tu-subdominio.tu-dominio.com`).
3. Cambia el `ExecStart` de `systemd/vigia-tunel.service` para usar
   `cloudflared tunnel run vigia` en vez de `tunnel --url ...`.
4. A partir de ahí tu URL será siempre la misma: no hará falta volver a
   escanear el QR.

Esto es opcional: sin ello, VIGÍA funciona igual de bien, solo que tendrás que
volver a mirar la URL (con `sudo journalctl -u vigia-tunel -n 20`, o
reejecutando el instalador) si el túnel se reinicia.

## Preguntas frecuentes

### ¿Qué URL RTSP uso para mi cámara?

El asistente de `instalar.sh` ya trae plantillas para las marcas más
habituales. Como referencia:

| Marca | Ruta RTSP típica | Puerto |
|---|---|---|
| TP-Link Tapo | `/stream1` (alta calidad) o `/stream2` (ligero) | 554 |
| Ezviz | `/h264/ch1/main/av_stream` | 554 |
| Reolink | `/Preview_01_main` o `/h264Preview_01_main` | 554 |
| Imou | `/cam/realmonitor?channel=1&subtype=0` | 554 |
| Hikvision | `/Streaming/Channels/101` | 554 |
| Otra marca | Consulta el manual: casi todas usan `rtsp://usuario:clave@IP:554/...` | 554 (normalmente) |

Formato completo: `rtsp://usuario:contraseña@IP:554/ruta`.

### ¿Cuántas cámaras aguanta mi aparato?

Depende del hardware (ver tabla más arriba) y de la carga de cada cámara. Usa
`prioridad: 3` solo en las 1-2 cámaras que más te importan (esas son las que
además analizan gestos de ocultación); el resto con `prioridad: 1` o `2`. Si
ves que `fps_real` (en el panel) va muy por debajo de `fps_objetivo`, hay más
cámaras de las que tu equipo puede analizar con soltura: quita alguna o baja
su `fps_objetivo` en `config.yaml`.

### ¿Y si me roban el aparato?

Los clips de los avisos (sospecha/crítico) ya se han mandado a tu Telegram
en el momento en que ocurrieron, así que esa evidencia **ya voló de casa**
antes de que se llevaran nada. Lo único que se pierde es el histórico local
que no llegó a generar un aviso (por ejemplo, si tenías Telegram sin
configurar). Por eso recomendamos configurar Telegram desde el primer día.

### Legalidad en España (resumen en 4 líneas)

- Si tus cámaras enfocan hacia la vía pública o zonas comunes de vecinos,
  necesitas su consentimiento o limitar el encuadre a tu propiedad.
- Pon un **cartel visible** avisando de que hay videovigilancia.
- Conserva las grabaciones **como máximo 1 mes**, salvo que formen parte de
  una denuncia o investigación en curso.
- **Nada de reconocimiento facial ni lectura de matrículas**: VIGÍA CEREBRO
  no lo hace y no debes añadirlo tú tampoco. (Esto no es asesoría legal;
  ante dudas, consulta con la Agencia Española de Protección de Datos.)

## Problemas frecuentes

**"La cámara no conecta" al probarla en el instalador**
- Prueba la misma URL RTSP en [VLC](https://www.videolan.org/vlc/) (Medio →
  Abrir ubicación de red) para descartar que sea un problema de VIGÍA.
- Revisa usuario/contraseña/IP y que la cámara esté en la misma red que el
  cerebro (o accesible desde ella).
- Algunas cámaras solo aceptan una conexión RTSP a la vez: cierra la app
  oficial de la cámara mientras pruebas.

**"Falta ffmpeg" o "falta python3.11+"**
- El instalador te ofrece instalarlos con `sudo apt install` si tu sistema
  usa `apt` (Debian/Ubuntu/Raspberry Pi OS). En otras distribuciones,
  instálalos tú con el gestor de paquetes de tu sistema y vuelve a ejecutar
  `./instalar.sh`.

**"Puerto ocupado" al arrancar**
- Otro programa está usando el puerto `8420` (API), `1984` o `8554`
  (go2rtc). Para el otro programa, o cambia `puerto_api` en `config.yaml`
  (y el `ExecStart` del túnel si tienes el servicio instalado).

**El cerebro se para solo / se reinicia**
- Si instalaste el servicio systemd, `Restart=always` hace que vuelva a
  arrancar solo a los 5 segundos. Mira el motivo en:
  `sudo journalctl -u vigia-cerebro -n 100 --no-pager` o en
  `datos/cerebro.log`.

**No veo vídeo desde fuera de casa**
- Comprueba que el túnel esté activo: `sudo systemctl status vigia-tunel`
  (si lo instalaste como servicio) o revisa `datos/tunel.log`.
- Recuerda que la URL cambia con cada reinicio del túnel rápido gratuito
  (ver sección "URL fija" más arriba).

---

VIGÍA CEREBRO — parte del proyecto VIGÍA (cerebro + puesto de mando).
