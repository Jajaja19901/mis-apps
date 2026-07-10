# WiFi Security Analyzer - Versión Web

**Interfaz gráfica interactiva basada en navegador**

## 🌐 ¿Qué es?

Una versión web **100% autocontenida** del WiFi Security Analyzer que funciona directamente en tu navegador sin necesidad de:
- ❌ Instalar Python
- ❌ Instalar dependencias
- ❌ Configurar línea de comandos
- ✅ Solo abre `index.html` en tu navegador

## 🚀 Cómo Usar

### Opción 1: Abrir Localmente
1. Descarga o clona el proyecto
2. Abre `index.html` con tu navegador favorito
3. ¡Listo! La aplicación funciona inmediatamente

```bash
# Linux/macOS
open wifi-security-analyzer/index.html

# Windows
start wifi-security-analyzer/index.html

# O simplemente arrastra el archivo a tu navegador
```

### Opción 2: Servir Localmente
```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx http-server

# Luego abre: http://localhost:8000/wifi-security-analyzer/
```

## 📱 Características

### 1. 📡 **Escanear Redes Wi-Fi**
- Detecta todas las redes disponibles
- Muestra seguridad, canal, frecuencia y señal
- Icono visual de riesgo por tipo de cifrado

### 2. 🔍 **Analizar Vulnerabilidades**
- Ingresa nombre y contraseña de tu red
- Detecta automáticamente:
  - Cifrado débil (WEP, WPA)
  - Redes sin cifrado
  - WPS activado
  - Contraseñas débiles
- Proporciona soluciones paso a paso

### 3. 🔐 **Evaluador de Contraseña**
- Análisis en tiempo real mientras escribes
- Puntuación 0-100
- Características detectadas (mayús, números, símbolos)
- Bits de entropía criptográfica
- Sugerencias automáticas
- **Generador de contraseña fuerte** con un clic

### 4. 📱 **Detectar Dispositivos**
- Lista todos los dispositivos conectados
- Identifica dispositivos sospechosos
- Agrupa en "Confiables" y "Sospechosos"
- Muestra IP, MAC y tipo de dispositivo

### 5. 📊 **Generar Reporte Completo**
- Análisis integral de seguridad
- Reporte formateado profesional
- **Exportar a JSON** para análisis posterior
- **Exportar a CSV** para dispositivos

## 🎨 Características de la Interfaz

### Diseño Responsivo
- ✅ Funciona perfecto en desktop
- ✅ Optimizado para tablets
- ✅ Móvil-friendly (ajusta automáticamente)

### Tema Automático
- 🌞 Tema claro (Light)
- 🌙 Tema oscuro (Dark)
- Se adapta a las preferencias del sistema

### Animaciones Suave
- Transiciones elegantes
- Loading spinners
- Cambio de secciones fluido

### Iconos Intuitivos
- 🟢 = Seguro / Bien
- 🟡 = Advertencia
- 🟠 = Problema importante
- 🔴 = Crítico / Muy inseguro

## 📊 Ejemplos de Pantallas

### Pantalla: Escanear Redes
```
[Iniciar Escaneo]

✅ Se encontraron 4 red(es):

1. Mi Red Principal
   🟡 Seguridad: WPA2
   🟡 Señal: -55 dBm
   📡 Canal: 6 | Frecuencia: 2.4GHz

2. Red Vecino
   🔴 Seguridad: WEP
   🔴 Señal: -72 dBm
   ...
```

### Pantalla: Evaluador de Contraseña
```
Contraseña a Evaluar: [miPassword123___]

         45
        /100

Fortaleza: 🟡 Moderada
Longitud: 13 caracteres
Entropía: 77.4 bits

Características:
✓ Minúsculas: Sí
✓ Mayúsculas: Sí
✓ Números: Sí
✓ Símbolos: No

Sugerencias:
• Se recomienda 16+ caracteres
• Añade símbolos especiales

[⚡ Generar Contraseña Fuerte]
```

### Pantalla: Reporte Completo
```
╔════════════════════════════════════════════════╗
║   ANÁLISIS DE SEGURIDAD RED WI-FI             ║
║   Fecha: 10/07/2026 10:30:45                  ║
╚════════════════════════════════════════════════╝

📡 INFORMACIÓN DE LA RED
─────────────────────────────────────────────────
SSID:          Mi Red Principal
Seguridad:     WPA2
Canal:         6 | Frecuencia: 2.4GHz

🔍 VULNERABILIDADES
─────────────────────────────────────────────────
🟠 Contraseña Débil (45/100)
   La contraseña tiene baja complejidad
   Vulnerable a ataques de diccionario
```

## 🔐 Funcionalidades Técnicas

### Análisis de Contraseña
```
Puntuación = (Longitud) + (Complejidad) + (Bonificación)

0-20:   🔴 Muy Débil
21-40:  🟠 Débil
41-60:  🟡 Moderada
61-80:  🟢 Fuerte
81-100: 🟢 Muy Fuerte
```

### Detección de Vulnerabilidades
- ✅ Identifica WEP (crítico)
- ✅ Identifica Open networks (crítico)
- ✅ Detecta WPS activo (alto)
- ✅ Evalúa contraseña (alto si es débil)
- ✅ Analiza señal (medio si es débil)

### Generador de Contraseña
- Mínimo 16 caracteres
- Incluye mayúsculas, minúsculas, números y símbolos
- Aleatorio y único cada vez
- Fácil copiar al portapapeles

## 📤 Exportación de Datos

### Formato JSON
```json
{
  "timestamp": "2026-07-10T15:30:45",
  "network": {
    "ssid": "Mi Red",
    "security": "WPA2"
  },
  "vulnerabilities": [...],
  "summary": {
    "totalVulnerabilities": 1,
    "overallRisk": "HIGH"
  }
}
```

### Formato CSV
```csv
IP,MAC,Type,Suspicious
192.168.1.2,00:1A:2B:3C:4D:5E,iPhone,No
192.168.1.3,00:50:F2:AB:CD:EF,Laptop,No
192.168.1.4,AA:BB:CC:DD:EE:FF,Unknown,Yes
```

## 🎓 Datos de Demostración

La versión web incluye datos simulados para que puedas:
- ✅ Practicar sin tener herramientas del sistema
- ✅ Ver todas las funcionalidades funcionando
- ✅ Entender cómo se ven los reportes
- ✅ Probar el análisis de vulnerabilidades

**Redes de demostración:**
- Mi Red Principal (WPA2, Segura)
- Red Vecino (WEP, Muy insegura)
- Red Pública (Open, Crítica)
- Red 5GHz (WPA3, Muy segura)

**Dispositivos de demostración:**
- iPhone, Laptop, Dispositivos sospechosos

## 🛡️ Seguridad

### Lo que hace la aplicación
- ✅ Analiza datos localmente (todo en tu navegador)
- ✅ No envía nada a servidores
- ✅ No requiere conexión a internet
- ✅ No guarda historial

### Lo que NO hace
- ❌ No accede a tu red Wi-Fi real
- ❌ No escanea dispositivos reales
- ❌ No intercepta datos
- ❌ No necesita permisos especiales

## 💻 Compatibilidad

### Navegadores Soportados
- ✅ Chrome/Chromium (80+)
- ✅ Firefox (75+)
- ✅ Safari (13+)
- ✅ Edge (80+)
- ✅ Opera (67+)

### Sistemas Operativos
- ✅ Windows 7+
- ✅ macOS 10.12+
- ✅ Linux (cualquier distribución)
- ✅ Android (navegadores modernos)
- ✅ iOS (Safari)

### Requisitos Mínimos
- Navegador moderno
- JavaScript habilitado
- ~500 KB de espacio en disco

## 🚀 Primeros Pasos

### 1. Abre el archivo
```bash
# macOS
open wifi-security-analyzer/index.html

# Windows (click derecho > Abrir con > Navegador)

# Linux
xdg-open wifi-security-analyzer/index.html
```

### 2. Explora las 5 secciones
- 📡 Escanear
- 🔍 Analizar  
- 🔐 Contraseña
- 📱 Dispositivos
- 📊 Reporte

### 3. Prueba las funcionalidades
- Haz clic en "Iniciar Escaneo"
- Ingresa una contraseña para analizar
- Genera una contraseña fuerte
- Crea un reporte completo

### 4. Descarga tus resultados
- Exporta a JSON
- Exporta a CSV
- Guarda la información

## 📝 Notas Técnicas

### Código Incluido
- **HTML**: Estructura y layout
- **CSS**: Estilos y responsividad
- **JavaScript**: Toda la lógica de análisis

### Tamaño
- Archivo: ~50 KB
- Sin dependencias externas
- Funciona offline completamente

### Personalización
El archivo es editable. Puedes:
- Cambiar colores (variables CSS)
- Agregar más redes de demostración
- Modificar el layout
- Añadir nuevas funcionalidades

## 🆘 Solución de Problemas

### "El archivo no abre"
**Solución**: Asegúrate de abrirlo con un navegador (no texto)

### "Los estilos no se ven correctamente"
**Solución**: Actualiza la página (Ctrl+F5 o Cmd+Shift+R)

### "No funciona sin internet"
**Solución**: La app no necesita internet, pero comprueba que JavaScript esté habilitado

### "Veo datos en blanco"
**Solución**: Abre la consola (F12) para ver errores

## 📚 Comparativa: CLI vs Web

| Característica | CLI | Web |
|---|---|---|
| Instalación | Requiere Python | Solo navegador |
| Facilidad | Línea de comandos | Interfaz gráfica |
| Velocidad | Rápida | Instantánea |
| Funcionalidades | Todas | Las principales |
| Datos reales | Sí | No (demo) |
| Offline | Sí | Sí |
| Compartible | No | Sí (solo archivo) |

## 🎯 Casos de Uso

### Para Aprender
- Entender análisis de seguridad Wi-Fi
- Aprender qué hace un pentester
- Educación en ciberseguridad

### Para Demostración
- Mostrar vulnerabilidades Wi-Fi
- Presentaciones
- Charlas de seguridad

### Para Análisis
- Simular análisis de redes
- Entrenar sobre reportes
- Entender recomendaciones

## 🔄 Versiones

- **CLI** (`wifi_analyzer.py`): Para línea de comandos
- **Web** (`index.html`): Para navegador
- **Python** (`src/`): Módulos reutilizables

## 📞 Soporte

Para dudas sobre la versión web:
- Abre la consola (F12) para ver logs
- Verifica que JavaScript esté habilitado
- Prueba en otro navegador
- Lee el código comentado

## 📄 Licencia

MIT License - Libre para usar, modificar y distribuir

---

## ✅ Resumen

**La versión web es:**
- ✅ Rápida y fácil de usar
- ✅ No requiere instalación
- ✅ Funciona en cualquier navegador
- ✅ Perfecta para aprender y demostrar
- ✅ Segura y offline

**Abre `index.html` y comienza ahora mismo** 🚀
