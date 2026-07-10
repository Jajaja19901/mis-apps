# 🚀 Inicio Rápido - Compilar en Termux (Sin PC)

## ¿Qué necesitas?
- ✅ Termux instalado (ya lo tienes)
- ✅ OpenJDK-21 (ya instalado)
- ✅ Gradle (ya instalado)
- 🔄 Android SDK (lo instalaremos)

## 3 Comandos para Compilar

### 1️⃣ Clonar y entrar al proyecto

```bash
cd ~ && git clone https://github.com/Jajaja19901/mis-apps.git
cd mis-apps/wifi-security-analyzer
```

### 2️⃣ Descargar Android SDK (primera vez)

```bash
pkg install android-sdk
export ANDROID_SDK_ROOT=$PREFIX/opt/android-sdk
```

### 3️⃣ Compilar APK

```bash
gradle assembleDebug
```

✅ Cuando termine, verás: `BUILD SUCCESSFUL`

## ¿Dónde está el APK?

```bash
# El APK compilado está en:
app/build/outputs/apk/debug/app-debug.apk

# Copiarlo a tu carpeta de Descargas:
cp app/build/outputs/apk/debug/app-debug.apk ~/storage/downloads/
```

## Instalar en tu móvil

**Opción 1 - Directamente en Termux:**
```bash
pm install app/build/outputs/apk/debug/app-debug.apk
```

**Opción 2 - Manual:**
1. Ve a Archivos (Files)
2. Busca `app-debug.apk` en Descargas
3. Toca para instalar

## 📤 Compartir con empleados

El archivo para distribuir es:
```bash
app/build/outputs/apk/release/app-release.apk
```

Para crear la versión RELEASE:
```bash
gradle assembleRelease
```

Luego envía `app-release.apk` por:
- WhatsApp
- Google Drive
- Email
- Telegram
- Cualquier app de mensajería

## ⏱️ Tiempos

- **Primera vez**: ~2 horas (descargar SDK)
- **Compilaciones siguientes**: 15-30 minutos
- **Instalación en móvil**: 2 minutos

## 🆘 Si se cuelga o falla

```bash
# Limpiar y reintentar
gradle clean
gradle assembleDebug

# Si sale error de memoria:
export _JAVA_OPTIONS="-Xmx2048m"
gradle assembleDebug

# Ver detalles del error:
gradle assembleDebug --stacktrace
```

## ✅ Listo cuando veas esto:

```
BUILD SUCCESSFUL in 25m 30s
```

---

**Para más detalles**, lee `TERMUX_COMPILATION_GUIDE.md`
