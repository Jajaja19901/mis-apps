# 📱 Compilar WiFi Pentester Pro en Termux (Sin PC)

Tu app Android está lista para compilar DIRECTAMENTE en tu teléfono usando Termux.

## ✅ LO QUE YA TIENES LISTO

```
✅ Termux instalado en tu móvil
✅ OpenJDK-21 instalado
✅ Gradle 8.14.3 instalado
✅ Proyecto restructurado con Gradle
```

## 🔧 PASO 1: Clonar el proyecto en Termux

En tu Termux, ejecuta:

```bash
# Ir a home directory
cd ~

# Clonar el repositorio
git clone https://github.com/Jajaja19901/mis-apps.git

# Entrar al proyecto
cd mis-apps/wifi-security-analyzer
```

## 🏗️ PASO 2: Descargar SDK de Android

IMPORTANTE: Necesitas descargar el Android SDK. Ejecuta:

```bash
# Instalar Android SDK tools en Termux
pkg install android-tools android-sdk

# Configurar variables de entorno
export ANDROID_SDK_ROOT=$PREFIX/opt/android-sdk
```

Esto descargará ~2GB de archivos SDK. Puede tomar 10-20 minutos según tu conexión.

## 🔨 PASO 3: Compilar el APK

Una vez el SDK esté listo:

```bash
# Estar en el directorio del proyecto
cd ~/mis-apps/wifi-security-analyzer

# Compilar APK en modo DEBUG
gradle assembleDebug

# O compilar en modo RELEASE (producción)
gradle assembleRelease
```

**⏱️ TIEMPO ESTIMADO**: 30-45 minutos en móvil (10-15 minutos en PC)

El proceso:
1. Descarga dependencias (si es primera vez)
2. Compila código Kotlin
3. Genera APK final

## 📂 PASO 4: Encontrar el APK compilado

Una vez termine la compilación (verás `BUILD SUCCESSFUL`):

```bash
# Para DEBUG APK:
ls ~/mis-apps/wifi-security-analyzer/app/build/outputs/apk/debug/

# Para RELEASE APK:
ls ~/mis-apps/wifi-security-analyzer/app/build/outputs/apk/release/
```

El APK se llama:
- `app-debug.apk` (para desarrollo)
- `app-release.apk` (para distribución)

## 📱 PASO 5: Instalar en tu móvil

Opción A - Instalar directamente en el mismo móvil:

```bash
# Instalar APK en el mismo teléfono
pm install ~/mis-apps/wifi-security-analyzer/app/build/outputs/apk/debug/app-debug.apk
```

Opción B - Copiar y instalar manualmente:

```bash
# Copiar APK a carpeta compartida
cp ~/mis-apps/wifi-security-analyzer/app/build/outputs/apk/debug/app-debug.apk ~/storage/downloads/
```

Luego en tu móvil:
1. Abre Archivos (Files)
2. Ve a Downloads
3. Toca app-debug.apk
4. Instala

## 📤 PASO 6: Compartir APK con empleados

Una vez instalado en tu móvil, comparte el APK:

```bash
# Opción 1: Copiar a Google Drive/OneDrive
cp ~/mis-apps/wifi-security-analyzer/app/build/outputs/apk/release/app-release.apk ~/storage/downloads/

# Opción 2: Enviar por WhatsApp
# (Copia el APK a Downloads y comparte desde tu móvil)

# Opción 3: Hospedar en un servidor
# (Sube el APK a tu servidor web)
```

Tus empleados solo necesitan:
1. Descargar el APK
2. Instalarlo
3. Autorizar permisos

## 🔑 CONFIGURACIÓN INICIAL EN LA APP

Cuando abras la app por primera vez:

1. Ve a Settings ⚙️
2. Ingresa:
   - Nombre de tu empresa
   - Tu email
   - Teléfono de contacto
3. Guarda

## 📋 COMANDOS ÚTILES

```bash
# Limpiar compilación anterior
gradle clean

# Compilar solo sin crear APK (verificar errores)
gradle build

# Ver todas las tareas disponibles
gradle tasks

# Compilar con más detalle (si hay errores)
gradle assembleDebug --stacktrace
```

## ⚠️ PROBLEMAS COMUNES

### "Command gradle not found"
```bash
# Reinicia Termux y verifica Gradle está en PATH
gradle --version
```

### "ERROR: ANDROID_SDK_ROOT not set"
```bash
# Configura la variable nuevamente
export ANDROID_SDK_ROOT=$PREFIX/opt/android-sdk
```

### "Out of Memory" (se cuelga el compilador)
```bash
# Aumentar memoria para Gradle
export _JAVA_OPTIONS="-Xmx2048m"
gradle assembleDebug
```

### "Build takes forever" (>1 hora)
- Es normal en móvil, ten paciencia
- O salta a compilar en un PC si tienes disponible

## 🚀 RESUMEN RÁPIDO

```bash
# 1. Clonar
cd ~ && git clone https://github.com/Jajaja19901/mis-apps.git && cd mis-apps/wifi-security-analyzer

# 2. Descargar SDK (primera vez)
pkg install android-sdk && export ANDROID_SDK_ROOT=$PREFIX/opt/android-sdk

# 3. Compilar
gradle assembleDebug

# 4. Instalar
pm install app/build/outputs/apk/debug/app-debug.apk

# 5. ¡Listo! Abre la app en tu móvil
```

## 📞 SOPORTE

Si hay problemas:

1. Verifica que tienes espacio libre en tu móvil (~3GB mínimo)
2. Verifica conexión a internet estable
3. Prueba limpiar caché: `gradle clean`
4. Reinicia Termux

---

**⏰ TIEMPO TOTAL**: ~1-2 horas (primera vez)
**PRÓXIMAS COMPILACIONES**: 15-30 minutos

¡Tu app profesional estará lista para auditar redes Wi-Fi en tu móvil! 🔒
