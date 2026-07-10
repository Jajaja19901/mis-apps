# WiFi Pentester Pro - Guía de Compilación Android

## 📱 Crear la app Android profesional para tu equipo

---

## **REQUISITOS PREVIOS**

### Opción A: Compilar tú mismo (recomendado para distribución)
1. **Android Studio** (descarga gratuita)
   - https://developer.android.com/studio
   - Instala en tu PC

2. **JDK 11+** (Java Development Kit)
   - Incluido en Android Studio

3. **Git** (opcional pero recomendado)

### Opción B: Usar APK compilado (más fácil)
- Solo instala el APK en el móvil
- No necesitas Android Studio

---

## **PASO 1: CLONAR/DESCARGAR PROYECTO**

```bash
# Si tienes Git:
git clone <url-del-repo> WiFiPentesterPro
cd WiFiPentesterPro

# Si descargas ZIP:
# Descomprime en una carpeta
```

---

## **PASO 2: ABRIR EN ANDROID STUDIO**

1. Abre Android Studio
2. Click en "Open an Existing Project"
3. Selecciona la carpeta del proyecto
4. Espera a que gradle sincronice (abajo mostrará progreso)

```
Gradle build files detected. Would you like to add Gradle wrapper?
→ Click "OK"
```

5. Android Studio descargará automáticamente:
   - Android SDK
   - Gradle
   - Dependencias

---

## **PASO 3: CONFIGURAR PROYECTO**

### Editar `android-app-build.gradle`:

```gradle
defaultConfig {
    applicationId "com.pentester.wifisecurity"  // ID único de tu app
    minSdk 24  // Android 7.0+
    targetSdk 34  // Android 14
    versionCode 1
    versionName "1.0.0"
}
```

Si quieres cambiar el ID:
```gradle
applicationId "com.tuempresa.wifisecurity"
```

### Strings y recursos (`res/values/strings.xml`):

```xml
<string name="app_name">WiFi Pentester Pro</string>
<string name="app_version">1.0.0</string>
<string name="company_name">Tu Empresa</string>
```

---

## **PASO 4: AGREGAR PERMISOS**

El archivo `AndroidManifest.xml` ya incluye todos los permisos necesarios:

✅ Wi-Fi Scanning  
✅ Ubicación (requerida para Wi-Fi en Android 6.0+)  
✅ Almacenamiento  
✅ Cámara (para documentación)  

---

## **PASO 5: COMPILAR LA APP**

### Método A: Compilar en modo DEBUG (desarrollo)

```
En Android Studio:
1. Build → Build Bundle(s) / APK(s) → Build APK(s)
2. Espera a que compile (2-3 minutos)
3. En parte inferior: "Build successful"
4. Click en "Locate" para encontrar el APK
```

Ubicación del APK generado:
```
app/build/outputs/apk/debug/app-debug.apk
```

### Método B: Compilar en modo RELEASE (producción)

```
1. Build → Generate Signed Bundle/APK
2. Selecciona "APK"
3. Click "Next"
4. Crear o seleccionar keystore (certificado)
   - Rellenar datos de tu empresa
   - Guardar en lugar seguro
5. Click "Next"
6. Seleccionar "release"
7. Click "Finish"
```

Ubicación del APK:
```
app/build/outputs/apk/release/app-release.apk
```

**⚠️ IMPORTANTE**: Guarda el keystore en lugar seguro. Lo necesitarás para futuras actualizaciones.

---

## **PASO 6: TRANSFERIR A MÓVIL**

### Opción 1: USB Direct

```bash
# En tu PC (Windows):
adb install app-release.apk

# En Mac/Linux:
./adb install app-release.apk
```

Asegúrate que:
- USB Debugging está activado en el móvil
- Móvil conectado por USB

### Opción 2: Enviar por email/Drive

1. Envía el APK a tu email
2. Descarga en el móvil
3. Abre el archivo
4. Autoriza la instalación

### Opción 3: QR Code

1. Sube APK a servidor
2. Genera QR que apunte al APK
3. Tus empleados escanean y descargan

---

## **PASO 7: INSTALAR EN MÓVIL**

1. Descarga el APK en tu Android
2. Abre el archivo
3. Click en "Instalar"
4. Autoriza permisos si te lo pide
5. ¡Listo! La app aparecerá en tu home

---

## **DISTRIBUCIÓN A EMPLEADOS**

### Opción 1: APK Directo
```
1. Comparte APK por email/WhatsApp
2. Tus empleados lo instalan
```

### Opción 2: Google Play (requiere cuenta desarrollador)
```
1. Crear cuenta Google Play Developer ($25 USD)
2. Subir APK
3. Configurar listado de app (privada)
4. Compartir enlace con empleados
```

### Opción 3: Sistema Interno
```
1. Subir APK a servidor interno
2. Crear QR o enlace privado
3. Solo empleados con acceso instalan
```

### Opción 4: MDM (Mobile Device Management)
```
Si tu empresa usa MDM (Intune, Jamf, etc):
1. Distribuir APK automáticamente
2. Control centralizado
3. Actualización automática
```

---

## **ESTRUCTURA DEL PROYECTO**

```
WiFiPentesterPro/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/
│   │   │   │   └── com/pentester/wifisecurity/
│   │   │   │       ├── core/
│   │   │   │       │   ├── WiFiScannerEngine.kt
│   │   │   │       │   └── VulnerabilityAnalyzer.kt
│   │   │   │       └── ui/
│   │   │   │           ├── MainActivity.kt
│   │   │   │           ├── ScanActivity.kt
│   │   │   │           ├── AnalysisActivity.kt
│   │   │   │           └── ... más activities
│   │   │   ├── res/
│   │   │   │   ├── layout/
│   │   │   │   ├── drawable/
│   │   │   │   └── values/
│   │   │   └── AndroidManifest.xml
│   │   └── test/
│   └── build.gradle
├── build.gradle
├── settings.gradle
└── gradle.properties
```

---

## **PRIMERA EJECUCIÓN EN LA APP**

1. Abre la app
2. Ve a Settings/⚙️ Configuración
3. Ingresa datos:
   - Nombre de tu empresa
   - Tu email
   - Teléfono de contacto
   - Logo (si tienes)
4. Guarda
5. ¡Lista para auditorías!

---

## **ACTUALIZACIONES**

Cuando hagas cambios al código:

```
1. Edita código en Android Studio
2. Build → Build APK again
3. Comparte nuevo APK con empleados
```

Si usas Google Play, Play automáticamente notificará a usuarios de actualizaciones disponibles.

---

## **SOLUCIÓN DE PROBLEMAS**

### "Error: Gradle sync failed"
```
→ Build → Clean Project
→ Build → Rebuild Project
→ File → Invalidate Caches → Restart
```

### "Permission denied during build"
```
→ Asegúrate que tienes permisos de escritura en la carpeta
→ Ejecuta Android Studio como administrador (Windows)
```

### "APK not installing"
```
→ Verifica que el APK es compatible con tu Android version
→ Desinstala versión anterior
→ Intenta instalar nuevamente
```

### "App crashes on startup"
```
→ Revisa que todos los permisos estén autorizados
→ Abre Settings del móvil > Apps > WiFi Pentester
→ Autoriza: Ubicación, Wi-Fi, Almacenamiento
```

---

## **SEGURIDAD Y DISTRIBUCIÓN PROFESIONAL**

### Proteger tu APK

```gradle
// En build.gradle, habilita ProGuard:
buildTypes {
    release {
        minifyEnabled true
        proguardFiles getDefaultProguardFile(
            'proguard-android-optimize.txt'
        ), 'proguard-rules.pro'
    }
}
```

### Firmar APK (IMPORTANTE)

Siempre firma el APK con tu certificado:
```
Build → Generate Signed Bundle / APK → (proceso anterior)
```

### Versionamiento

Cada actualización incrementa versionCode:
```gradle
versionCode 1  // 1.0.0
versionCode 2  // 1.0.1 (bug fixes)
versionCode 3  // 1.1.0 (nuevas features)
```

---

## **COMANDOS ÚTILES**

```bash
# Sincronizar gradle
./gradlew sync

# Compilar debug
./gradlew assembleDebug

# Compilar release
./gradlew assembleRelease

# Ejecutar tests
./gradlew test

# Limpiar build
./gradlew clean
```

---

## **SIGUIENTE PASOS**

1. ✅ Compilar APK
2. ✅ Instalar en tu móvil
3. ✅ Probar funcionalidades
4. ✅ Ingresar datos de tu empresa en Settings
5. ✅ Compartir APK con empleados
6. ✅ ¡Comenzar auditorías profesionales!

---

## **SOPORTE**

Si encuentras problemas:
1. Revisa el logcat en Android Studio (View > Tool Windows > Logcat)
2. Comprueba que tienes todos los permisos del AndroidManifest.xml
3. Verifica que tu móvil tiene versión Android 7.0+ mínimo

---

**¡Tu app Android profesional está lista para auditorías!** 🚀
