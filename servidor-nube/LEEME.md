# VIGÍA · Servidor-cerebro en la nube 🖥️

El móvil no calcula nada pesado. Saca un fotograma pequeño de la cámara, lo
manda a un **ordenador potente** y este devuelve las cajas ya pensadas. La app
las dibuja al instante. Así el móvil va fluido y el cerebro grande vive fuera.

> Esto es DISTINTO de la carpeta `vigia-cerebro/` (esa conecta cámaras IP por
> RTSP y vigila 24 h en un aparato tuyo). Aquí es más simple: **la cámara del
> propio móvil** manda fotos a un ordenador que corre YOLO. Ideal para PROBAR
> a máxima potencia y para el caso "quiero el cerebro en un ordenador y el móvil
> solo mira".

## Lo que hace el servidor

- Un único endpoint: `POST /detectar` con `{ "imagen": "data:image/jpeg;base64,…" }`
- Responde: `{ "detecciones": [ {clase, score, x, y, an, al}, … ] }`
  con las cajas **normalizadas 0-1** (la app las escala a su vídeo).
- CORS abierto para que el navegador del móvil pueda llamarlo.

---

## Opción A — Google Colab (gratis, con GPU, para PROBAR) ⭐ la más fácil

1. Entra en <https://colab.research.google.com> → **Nuevo cuaderno**.
2. Menú **Entorno de ejecución → Cambiar tipo de entorno → GPU (T4)**.
3. Abre el archivo `colab_vigia.py` de esta carpeta, **copia TODO** y pégalo en
   una celda del cuaderno.
4. Pulsa ▶ (ejecutar). Espera 1-2 min. Al final imprime una dirección así:

   ```
   ✅ SERVIDOR LISTO. Pega ESTA dirección en la app:

       https://algo-algo.trycloudflare.com/detectar
   ```

5. En la app: **Ajustes → Motor de detección → 🖥️ Servidor en la nube**. Pega
   la dirección, pulsa **«Probar servidor»**. Si dice **✅ SIRVE**, ya está.

⚠ **Honesto:** Colab gratis se desconecta tras un rato sin actividad y no sirve
para vigilar día y noche. Es perfecto para comprobar que todo funciona a tope.
Cada vez que lo arrancas te da una dirección nueva (hay que volver a pegarla).

---

## Opción B — Tu propio PC o un servidor (para dejarlo encendido)

En un ordenador con Python (mejor si tiene GPU NVIDIA):

```bash
pip install -r requirements.txt
python servidor.py            # escucha en http://0.0.0.0:8420
```

Para llegar a él desde el móvil por internet (https), abre un túnel gratis de
Cloudflare (sin registro):

```bash
# descarga cloudflared una vez desde https://github.com/cloudflare/cloudflared/releases
cloudflared tunnel --url http://localhost:8420
```

Te dará una dirección `https://…trycloudflare.com`. Úsala + `/detectar` en la app.

> Si el móvil y el ordenador están en la **misma wifi**, ni túnel: usa
> `http://LA-IP-DEL-PC:8420/detectar` (pero muchos navegadores móviles exigen
> https para la cámara; el túnel de Cloudflare da https gratis y evita líos).

---

## Más precisión (pillar a la persona lejana que roba al fondo)

Por defecto usa `yolo11n.pt` (nano, rapidísimo). Si el servidor tiene GPU, sube
el modelo para que vea más y más lejos:

- En `servidor.py`: variable de entorno `VIGIA_MODELO=yolo11s.pt` (o `m`, `x`).
- En `colab_vigia.py`: cambia `MODELO = "yolo11n.pt"` por `"yolo11s.pt"` / `"yolo11m.pt"`.

`x` es el más preciso y el más lento; `n` el más rápido. Con la GPU de Colab,
`s` o `m` van muy bien.

---

## Formato exacto (por si montas otro servidor tú)

**Entra:** `POST /detectar`  ·  cuerpo JSON `{ "imagen": "<dataURL o base64>" }`

**Sale:** JSON
```json
{ "detecciones": [
    { "clase": "person", "score": 0.91, "x": 0.12, "y": 0.30, "an": 0.18, "al": 0.55 }
] }
```
- `clase`: nombre COCO en inglés (`person`, `car`, `knife`, `backpack`…). La app
  ya los traduce.
- `score`: 0-1.
- `x, y, an, al`: caja **normalizada 0-1** (esquina + ancho/alto). Si prefieres,
  el servidor también acepta devolverlas en píxeles (la app lo detecta), pero
  normalizado es lo recomendado.
