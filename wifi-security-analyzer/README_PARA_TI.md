# 📱 WiFi Pentester Pro — Cómo instalar y usar la app

App Android real para auditar la seguridad de redes Wi-Fi propias o con
autorización escrita del titular. **No necesitas PC ni compilar nada:** el APK
ya está compilado y se descarga desde GitHub.

---

## 1. Descargar el APK

Abre este enlace en el navegador del teléfono:

```
https://github.com/Jajaja19901/mis-apps/releases/tag/apk-latest
```

En **Assets**, descarga **`wifi-pentester-pro.apk`**.

Enlace directo:
```
https://github.com/Jajaja19901/mis-apps/releases/download/apk-latest/wifi-pentester-pro.apk
```

## 2. Instalar

1. Toca la notificación de descarga (o ve a **Archivos → Descargas**).
2. Abre `wifi-pentester-pro.apk` → **Instalar**.
3. Si avisa de "instalar apps desconocidas" → **Permitir** → **Instalar**.

## 3. Usar

1. Abre **WiFi Pentester Pro**.
2. Pulsa **"Escanear redes Wi-Fi"**.
3. Concede el **permiso de ubicación** (Android lo exige para ver redes) y
   ten el **Wi-Fi encendido**.
4. Verás cada red con su seguridad, canal, señal y su vulnerabilidad
   principal: **por qué ocurre, cómo entraría un atacante y cómo corregirlo.**

---

## Para tus empleados

Comparte el **mismo enlace** de descarga. Cada uno lo abre en su móvil,
descarga el APK e instala. Sin PC, sin Termux, sin herramientas.

## Cuando quieras cambios

Se edita el código del proyecto (carpeta `wifi-security-analyzer/`), GitHub
recompila solo mediante el workflow `.github/workflows/build-apk.yml` y el
enlace de descarga se actualiza con el APK nuevo.

---

## Nota técnica (por qué NO con Termux)

Compilar un APK necesita las herramientas del SDK de Android (`aapt2`, `d8`),
que son binarios de Linux de PC y **no se ejecutan dentro de Termux** (usa otro
sistema). Por eso la compilación se hace en los servidores de GitHub, que sí
tienen esas herramientas. El APK resultante es un programa Android normal: al
instalarlo en el teléfono accede al Wi-Fi real del dispositivo.

## Aviso legal

Uso exclusivo sobre redes propias o con **autorización escrita** del titular.
Auditar redes ajenas sin permiso es ilegal.
