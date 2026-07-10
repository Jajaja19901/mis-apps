# WiFi Security Analyzer

**Herramienta profesional de análisis de seguridad para redes inalámbricas**

Una aplicación completa diseñada para evaluar y mejorar la seguridad de tu red Wi-Fi mediante análisis profundos de vulnerabilidades, detección de dispositivos y evaluación de contraseñas.

## 🎯 Características

### 1. **Escaneo de Redes Wi-Fi**
- Detecta todas las redes inalámbricas disponibles
- Obtiene información sobre cifrado, canales y potencia de señal
- Compatible con Linux, Windows y macOS

### 2. **Análisis de Vulnerabilidades**
Detecta y analiza automáticamente:
- 🔴 **Cifrado débil**: WEP, WPA obsoleto
- 🔴 **Redes sin cifrado**: Acceso público
- 🟠 **WPS activado**: Vulnerable a ataques de fuerza bruta
- 🟡 **Contraseñas débiles**: Evaluación por complejidad y longitud
- 🟡 **Canales saturados**: Interferencias y solapamientos
- 🟡 **Señal débil**: Cobertura insuficiente

### 3. **Evaluación de Contraseñas**
- Análisis de fortaleza basado en:
  - Longitud
  - Complejidad (mayúsculas, minúsculas, números, símbolos)
  - Patrones comunes débiles
  - Cálculo de entropía en bits
- Sugerencias automáticas de mejora
- Generador de contraseñas fuertes

### 4. **Detección de Dispositivos**
- Escanea dispositivos conectados a la red
- Identifica MACs y tipos de dispositivo (teléfono, laptop, IoT, etc.)
- Detecta dispositivos sospechosos o desconocidos
- Resuelve hostnames cuando es posible

### 5. **Análisis de Señal**
- Medición de potencia en dBm
- Clasificación de calidad de señal
- Identificación de puntos débiles de cobertura
- Recomendaciones de posicionamiento

### 6. **Reportes Profesionales**
- Reporte completo en formato texto
- Exportación a JSON para automatización
- Exportación a CSV de dispositivos
- Nivel de riesgo general (Bajo, Medio, Alto, Crítico)

## 📋 Requisitos

### Sistema Operativo
- **Linux**: Requiere `nmcli` (NetworkManager) o `arp`
- **Windows**: Requiere `netsh` (incluido en Windows)
- **macOS**: Requiere comandos nativos `airport` y `arp`

### Python
- Python 3.7 o superior

### Instalación de Dependencias

```bash
# Linux (Debian/Ubuntu)
sudo apt-get install network-manager

# Linux (Red Hat/CentOS)
sudo dnf install NetworkManager

# macOS (opcional)
brew install nmap

# Windows
# netsh ya viene incluido
```

## 🚀 Instalación

### Opción 1: Clonación desde repositorio
```bash
git clone <repositorio>
cd wifi-security-analyzer
python wifi_analyzer.py --help
```

### Opción 2: Descarga directa
1. Descarga los archivos
2. Navega a la carpeta
3. Ejecuta: `python wifi_analyzer.py --help`

## 💻 Uso

### Comandos Básicos

#### 1. Escanear Redes Disponibles
```bash
python wifi_analyzer.py scan
```
**Salida:**
```
✅ Se encontraron 4 red(es):

1. Mi Red Principal
   🟡 Seguridad: WPA2
   🟢 Señal: -55 dBm
   📡 Canal: 6 | Frecuencia: 2.4GHz

2. Red Vecino
   🔴 Seguridad: WEP
   🟡 Señal: -72 dBm
   📡 Canal: 11 | Frecuencia: 2.4GHz
```

#### 2. Analizar una Red Específica
```bash
python wifi_analyzer.py analyze --ssid "Mi Red"

# Con contraseña para análisis completo
python wifi_analyzer.py analyze --ssid "Mi Red" --password "miContraseña123!"
```

#### 3. Detectar Dispositivos Conectados
```bash
python wifi_analyzer.py devices

# Especificar gateway diferente
python wifi_analyzer.py devices --gateway 192.168.0.1
```

#### 4. Evaluar una Contraseña
```bash
# Analizar una contraseña existente
python wifi_analyzer.py password --check "miContraseña"

# Generar una contraseña fuerte
python wifi_analyzer.py password --generate
```

#### 5. Análisis Completo
```bash
python wifi_analyzer.py full

# Con red específica
python wifi_analyzer.py full --ssid "Mi Red" --password "miContraseña"

# Exportar resultados
python wifi_analyzer.py full --export json
python wifi_analyzer.py full --export csv
```

## 📊 Interpretación de Resultados

### Niveles de Riesgo

| Riesgo | Color | Descripción |
|--------|-------|-------------|
| 🟢 Bajo | Verde | Configuración segura |
| 🟡 Medio | Amarillo | Algunas mejoras recomendadas |
| 🟠 Alto | Naranja | Problemas de seguridad importantes |
| 🔴 Crítico | Rojo | Vulnerabilidades graves |

### Evaluación de Contraseña

| Puntuación | Nivel | Recomendación |
|-----------|-------|--------------|
| 0-20 | Muy Débil | ⛔ No usar |
| 21-40 | Débil | ⚠️ Cambiar urgentemente |
| 41-60 | Moderada | 🟡 Mejorar |
| 61-80 | Fuerte | ✅ Aceptable |
| 81-100 | Muy Fuerte | ✅ Excelente |

### Señal Wi-Fi

| dBm | Calidad | Velocidad |
|-----|---------|-----------|
| -30 a -50 | 🟢 Excelente | Máxima |
| -50 a -60 | 🟢 Muy buena | Muy buena |
| -60 a -70 | 🟡 Buena | Buena |
| -70 a -80 | 🟡 Aceptable | Aceptable |
| < -80 | 🔴 Débil | Lenta |

## 🔐 Recomendaciones de Seguridad

### Contraseña Wi-Fi
- ✅ Mínimo 16 caracteres (recomendado)
- ✅ Incluir mayúsculas, minúsculas, números y símbolos
- ✅ Evitar palabras del diccionario
- ✅ Evitar secuencias obvias (123, abc)

### Configuración del Router
1. **Cifrado**: WPA2 o WPA3 (nunca WEP)
2. **WPS**: Desactivar siempre
3. **Canal**: 1, 6 u 11 para 2.4GHz (sin solapamiento)
4. **Firmware**: Mantener actualizado
5. **Contraseña de admin**: Cambiar la contraseña por defecto

### Posicionamiento
- Coloca el router en un lugar central
- A la vista de los dispositivos (evita ser invisible)
- Lejos de obstáculos (paredes de hormigón, metal)
- Elevado (en un estante o pared)

## 📁 Estructura del Proyecto

```
wifi-security-analyzer/
├── wifi_analyzer.py          # Script principal
├── src/
│   ├── __init__.py
│   ├── config.py             # Configuración y constantes
│   ├── password_analyzer.py  # Análisis de contraseñas
│   ├── wifi_scanner.py       # Escaneo de redes
│   ├── vulnerability_analyzer.py  # Detección de vulnerabilidades
│   ├── device_detector.py    # Detección de dispositivos
│   ├── report_generator.py   # Generación de reportes
│   └── cli.py                # Interfaz de línea de comandos
├── tests/
│   └── test_examples.py      # Ejemplos y pruebas
├── docs/
│   └── GUIDE.md              # Guía completa
└── README.md
```

## 🧪 Ejemplos de Uso

### Ejemplo 1: Análisis Rápido de Red
```bash
python wifi_analyzer.py scan
# Ver qué redes hay disponibles
```

### Ejemplo 2: Auditoría Completa de Tu Red
```bash
python wifi_analyzer.py full --ssid "Mi Red Principal" --password "miPassword123!"
```

### Ejemplo 3: Generar Contraseña Fuerte
```bash
python wifi_analyzer.py password --generate
# Sugerencia: aB7$xK2mP!q9wN4vR8tY

python wifi_analyzer.py password --check "aB7\$xK2mP!q9wN4vR8tY"
# Fortaleza: Muy Fuerte
# Puntuación: 92/100
```

### Ejemplo 4: Detectar Intrusos
```bash
python wifi_analyzer.py devices
# ⚠️  DISPOSITIVOS SOSPECHOSOS
# - IP: 192.168.1.150 | MAC: AA:BB:CC:DD:EE:FF
#   Tipo: Desconocido
```

### Ejemplo 5: Exportar Resultados
```bash
python wifi_analyzer.py full --ssid "Mi Red" --password "miPassword" --export json
# ✅ Reporte exportado a: wifi_security_report.json
```

## 🛡️ Consideraciones Legales

Esta herramienta está diseñada para **auditar tu propia red Wi-Fi**. 

⚠️ **ADVERTENCIA LEGAL:**
- ✅ Legal: Analizar la seguridad de tu propia red
- ❌ Ilegal: Acceder o modificar redes ajenas sin autorización
- ❌ Ilegal: Usar para ataques o interferencias
- ❌ Ilegal: Distribuir herramientas de ataque

**Cumple siempre con la legislación local y obtén autorización escrita antes de auditar redes de terceros.**

## 🐛 Solución de Problemas

### "No se detectan redes"
```bash
# Linux: Verifica que NetworkManager esté activo
sudo systemctl status NetworkManager

# O intenta con permisos elevados
sudo python wifi_analyzer.py scan
```

### "No se detectan dispositivos"
```bash
# Verifica que tienes acceso a la tabla ARP
arp -n  # Linux/macOS
arp -a  # Windows
```

### "Permisos denegados"
```bash
# En Linux, algunos comandos requieren sudo
sudo python wifi_analyzer.py devices
```

## 📝 Ejemplos de Salida

### Reporte de Análisis Completo
```
╔════════════════════════════════════════════════════════════════╗
║           ANÁLISIS DE SEGURIDAD RED WI-FI                      ║
║                                                                ║
║  Fecha y hora: 2026-07-10 15:30:45
╚════════════════════════════════════════════════════════════════╝

📡 INFORMACIÓN DE LA RED
────────────────────────────────────────────────────────────────
SSID:                Mi Red Principal
Tipo de Cifrado:     WPA2
Canal:               6
Frecuencia:          2.4GHz
Intensidad Señal:    -55 dBm
Estado Cifrado:      ✅ Cifrado seguro

🔍 VULNERABILIDADES DETECTADAS
────────────────────────────────────────────────────────────────
🟠 ALTAS:

  🟠 Contraseña Débil (weak)
  Descripción: La contraseña tiene una puntuación de 45/100 en complejidad.
  Impacto: Vulnerable a ataques de diccionario o fuerza bruta

🔐 ANÁLISIS DE CONTRASEÑA
────────────────────────────────────────────────────────────────
Fortaleza: Débil
Puntuación: 45/100
Longitud: 12 caracteres

Características:
  ✓ Minúsculas (a-z): Sí
  ✓ Mayúsculas (A-Z): No
  ✓ Números (0-9): Sí
  ✓ Símbolos: No
  • Bits de Entropía: 39.86

Sugerencias de mejora:
  • Añade letras mayúsculas (A-Z)
  • Añade símbolos especiales (!@#$%^&*)
```

## 📚 Documentación Adicional

Para más información, consulta:
- `docs/GUIDE.md` - Guía completa de uso
- Inline help: `python wifi_analyzer.py --help`

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:
1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/mejora`)
3. Commit tus cambios (`git commit -am 'Añade mejora'`)
4. Push a la rama (`git push origin feature/mejora`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo licencia MIT. Ver `LICENSE` para detalles.

## ⚠️ Renuncia de Responsabilidad

Esta herramienta se proporciona "tal cual" sin garantías. El usuario es responsable de asegurar que su uso es legal y cumple con la legislación local. Los autores no serán responsables de ningún daño o consecuencia derivada del uso de esta herramienta.

## 📞 Soporte

Para reportar bugs o solicitar features:
- Abre un issue en el repositorio
- Incluye detalles del SO, versión de Python y pasos para reproducir

---

**WiFi Security Analyzer v1.0.0**
*Mejora la seguridad de tu red Wi-Fi hoy mismo*
