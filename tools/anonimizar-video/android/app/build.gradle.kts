plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "es.incubatunegocio.anonimizador"
    compileSdk = 34

    defaultConfig {
        applicationId = "es.incubatunegocio.anonimizador"
        minSdk = 29          // Android 10+; WebCodecs necesita un System WebView moderno
        targetSdk = 34
        // en CI, el nº de ejecución del workflow: cada build publicado es "más nuevo"
        // y la auto-actualización de la app lo detecta sola
        versionCode = (System.getenv("VERSION_CODE") ?: "2").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "1.1-local"
    }

    // Firma fija del repo: así cada APK nuevo ACTUALIZA al anterior en vez de
    // pedir desinstalar (la clave debug de cada runner de CI cambiaría siempre).
    signingConfigs {
        create("propia") {
            storeFile = file("firma.p12")
            storeType = "pkcs12"
            storePassword = "anonimizador"
            keyAlias = "anonimizador"
            keyPassword = "anonimizador"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("propia")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("propia")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
    defaultConfig.ndk.abiFilters += listOf("arm64-v8a")
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.19.2")
}
