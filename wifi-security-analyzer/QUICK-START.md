# Quick Start - WiFi Security Analyzer

**Comienza en menos de 5 minutos**

## 1. Verificar Requisitos (1 min)

### Linux
```bash
# Verificar Python
python3 --version

# Instalar herramientas (si es necesario)
sudo apt-get install network-manager  # Debian/Ubuntu
# o
sudo dnf install NetworkManager       # Fedora/CentOS
```

### Windows
```cmd
# Verificar Python
python --version

# Verificar netsh (ya debería estar)
netsh wlan show networks
```

### macOS
```bash
# Verificar Python
python3 --version

# Verificar airport (ya debería estar)
/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s
```

## 2. Descarga/Clona el Proyecto (1 min)

```bash
# Opción A: Clonar
git clone <url-repositorio>
cd wifi-security-analyzer

# Opción B: Descargar ZIP
unzip wifi-security-analyzer.zip
cd wifi-security-analyzer
```

## 3. Ejecuta Tu Primer Comando (2 min)

### Ver Redes Disponibles
```bash
python3 wifi_analyzer.py scan
```

**Salida esperada:**
```
✅ Se encontraron 4 red(es):

1. Mi Red Principal
   🟡 Seguridad: WPA2
   🟢 Señal: -55 dBm
   📡 Canal: 6 | Frecuencia: 2.4GHz
```

### Generar una Contraseña Fuerte
```bash
python3 wifi_analyzer.py password --generate
```

### Analizar Tu Red Principal
```bash
python3 wifi_analyzer.py analyze --ssid "Mi Red Principal" --password "miContraseña"
```

### Detectar Dispositivos Conectados
```bash
# Sin sudo (información limitada)
python3 wifi_analyzer.py devices

# Con sudo (información completa)
sudo python3 wifi_analyzer.py devices
```

### Análisis Completo
```bash
python3 wifi_analyzer.py full --ssid "Mi Red" --password "miPassword"
```

## 4. Interpretar Resultados (2 min)

### Significado de los Iconos

| Icono | Significado |
|-------|-------------|
| 🟢 | Seguro / Bien |
| 🟡 | Advertencia / Mejora recomendada |
| 🟠 | Problema importante |
| 🔴 | Crítico / Muy inseguro |

### Ejemplo: Tu Red es WEP

```
🔴 Cifrado WEP (Obsoleto)
   Descripción: WEP es un cifrado completamente quebrado...
   Impacto: Acceso no autorizado a la red
```

**Acción**: Cambia a WPA2 o WPA3 en la configuración del router.

### Ejemplo: Contraseña Débil

```
Fortaleza: Débil
Puntuación: 45/100
Sugerencias:
  • Aumenta la longitud a mínimo 12 caracteres
  • Añade símbolos especiales (!@#$%^&*)
```

**Acción**: Crea una contraseña más fuerte.

## 5. Mejora Tu Seguridad (3 min)

### Paso 1: Accede al Router
1. Abre tu navegador
2. Ve a `192.168.1.1` o `192.168.0.1`
3. Login (usuario/contraseña por defecto en el router)

### Paso 2: Cambia la Contraseña Wi-Fi
1. Busca "Wireless Security" o "Seguridad Wi-Fi"
2. Copia la contraseña fuerte generada
3. Cambia y guarda

### Paso 3: Mejora la Seguridad
1. Cambia cifrado a **WPA2** o **WPA3**
2. **Desactiva WPS** (muy inseguro)
3. **Actualiza firmware** del router
4. Guarda cambios

### Paso 4: Verifica los cambios
```bash
python3 wifi_analyzer.py scan
# Verifica que ahora muestre WPA2/WPA3
```

## Comandos Más Comunes

```bash
# Ver todas las redes
python3 wifi_analyzer.py scan

# Analizar una red específica
python3 wifi_analyzer.py analyze --ssid "Tu Red"

# Con contraseña
python3 wifi_analyzer.py analyze --ssid "Tu Red" --password "tuPassword"

# Generar contraseña fuerte
python3 wifi_analyzer.py password --generate

# Revisar contraseña
python3 wifi_analyzer.py password --check "miPassword123"

# Detectar quién está conectado
python3 wifi_analyzer.py devices

# Análisis completo
python3 wifi_analyzer.py full --ssid "Tu Red" --password "tuPassword"

# Ayuda general
python3 wifi_analyzer.py --help

# Ayuda de un comando
python3 wifi_analyzer.py scan --help
```

## Ejemplos Prácticos

### Ejemplo 1: Mi Red es Muy Débil

```bash
# 1. Ver redes y señal
python3 wifi_analyzer.py scan

# 2. Busca tu red, si muestra:
#   🔴 Señal: -85 dBm
#   (significa muy débil)

# Soluciones:
# - Acerca el router
# - Evita obstáculos (paredes, metal)
# - Sube el router a una altura mayor
# - Considera un repetidor o sistema mesh
```

### Ejemplo 2: Verificar Intrusos

```bash
# 1. Ver dispositivos conectados
sudo python3 wifi_analyzer.py devices

# 2. Busca dispositivos que no reconozcas
# ⚠️  DISPOSITIVOS SOSPECHOSOS
# - IP: 192.168.1.50 | MAC: AA:BB:CC:DD:EE:FF

# Soluciones:
# - Cambia tu contraseña Wi-Fi
# - Actualiza la contraseña de admin del router
# - Activa filtro de MAC en el router (opcional)
```

### Ejemplo 3: Optimizar Velocidad

```bash
# 1. Escanea redes
python3 wifi_analyzer.py scan

# 2. Si ves muchas redes en canal 6, cambia a canal 1 u 11

# Pasos:
# - Accede a router (192.168.1.1)
# - Busca "Canal"
# - Cambia a 1, 6 u 11 (2.4GHz) o 36-48, 149-165 (5GHz)
# - Guarda y reinicia
```

## Problemas Comunes

### "nmcli: command not found"
```bash
# Instalar NetworkManager
sudo apt-get install network-manager
sudo systemctl start NetworkManager
```

### "Permission denied"
```bash
# Ejecuta con sudo
sudo python3 wifi_analyzer.py scan
```

### "No networks detected"
```bash
# Verifica que tu Wi-Fi esté activo
nmcli radio wifi on  # Linux
netsh interface wifi show interfaces  # Windows
```

### "Module not found"
```bash
# Asegúrate de estar en el directorio correcto
cd wifi-security-analyzer
python3 wifi_analyzer.py scan
```

## Próximos Pasos

1. ✅ **Ejecuta un scan** (`python3 wifi_analyzer.py scan`)
2. ✅ **Genera una contraseña fuerte** (`--password --generate`)
3. ✅ **Analiza tu red** (`analyze --ssid "Mi Red"`)
4. ✅ **Detiene intrusos** (`devices`)
5. ✅ **Lee el README completo** (`cat README.md`)

## Documentación Completa

```bash
# Ver ejemplos detallados
python3 tests/test_examples.py

# Ver guía completa
cat README.md

# Ver guía de instalación
cat INSTALL.md
```

---

**¡Ya estás listo! Comienza a mejorar tu seguridad Wi-Fi ahora.**

Para dudas: `python3 wifi_analyzer.py --help`
