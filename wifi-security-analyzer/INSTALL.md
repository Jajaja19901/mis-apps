# Guía de Instalación - WiFi Security Analyzer

## Requisitos Previos

### Python
- **Versión mínima**: Python 3.7
- **Verificar versión**:
  ```bash
  python3 --version
  ```

### Herramientas del Sistema

#### Linux (Debian/Ubuntu)
```bash
# Instalar NetworkManager (recomendado)
sudo apt-get update
sudo apt-get install network-manager

# O instalar herramientas de escaneo alternativas
sudo apt-get install net-tools
sudo apt-get install nmap  # Opcional

# Verificar nmcli
nmcli --version
```

#### Linux (Red Hat/CentOS/Fedora)
```bash
# Instalar NetworkManager
sudo dnf install NetworkManager

# Instalar herramientas de red
sudo dnf install net-tools

# Verificar
nmcli --version
```

#### Linux (Arch)
```bash
# Instalar NetworkManager
sudo pacman -S networkmanager

# Herramientas de red
sudo pacman -S net-tools

# Verificar
nmcli --version
```

#### Windows
- **netsh**: Ya incluido en Windows (no requiere instalación)
- **wlanapi.dll**: Incluido en Windows Vista y superior

Verificar:
```cmd
netsh wlan show networks mode=Bssid
```

#### macOS
- **airport**: Incluido en macOS (parte de AirPort Utility)
- **arp**: Incluido en macOS

Verificar:
```bash
which airport
arp -a
```

## Instalación del Proyecto

### Opción 1: Instalación Manual Rápida

```bash
# 1. Clonar o descargar el repositorio
git clone <url-repositorio>
cd wifi-security-analyzer

# 2. Verificar que Python esté disponible
python3 --version

# 3. Ejecutar directamente
python3 wifi_analyzer.py --help
```

### Opción 2: Instalación con Alias (Recomendado)

#### Linux/macOS

```bash
# 1. Hacer el script ejecutable
chmod +x wifi_analyzer.py

# 2. Crear alias en tu shell
# Para bash (~/.bashrc)
echo "alias wifi-analyzer='python3 $(pwd)/wifi_analyzer.py'" >> ~/.bashrc
source ~/.bashrc

# Para zsh (~/.zshrc)
echo "alias wifi-analyzer='python3 $(pwd)/wifi_analyzer.py'" >> ~/.zshrc
source ~/.zshrc

# 3. Verificar alias
wifi-analyzer --help
```

#### Windows (PowerShell)

```powershell
# Crear un .bat para ejecutable
$scriptPath = Get-Location
$batContent = "@echo off`npython3 $scriptPath\wifi_analyzer.py %*"
$batContent | Out-File -Encoding ASCII "wifi-analyzer.bat"

# Añadir a PATH (necesita admin)
# O simplemente usar: python3 wifi_analyzer.py
```

### Opción 3: Instalación Global en Linux

```bash
# 1. Copiar a directorio del sistema
sudo cp wifi_analyzer.py /usr/local/bin/wifi-analyzer
sudo chmod +x /usr/local/bin/wifi-analyzer

# 2. Copiar módulos
sudo cp -r src/* /usr/local/lib/wifi-analyzer/

# 3. Usar desde cualquier lugar
wifi-analyzer scan
```

## Verificación de Instalación

### Verificar Python y módulos
```bash
python3 --version
python3 -c "import sys; print('Python OK' if sys.version_info >= (3,7) else 'Versión insuficiente')"
```

### Verificar herramientas del sistema

#### Linux
```bash
# Verificar nmcli
nmcli --version

# Alternativa: verificar arp
which arp
arp --help
```

#### Windows
```cmd
# Verificar netsh
netsh /?
netsh wlan /?
```

#### macOS
```bash
# Verificar airport
/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -h

# Verificar arp
arp --help
```

## Ejecución del Programa

### Opción A: Ejecución Directa
```bash
python3 wifi_analyzer.py scan
```

### Opción B: Con Alias
```bash
wifi-analyzer scan
```

### Opción C: Como Módulo Python
```python
import sys
sys.path.insert(0, '/ruta/a/wifi-security-analyzer/src')
from cli import WiFiSecurityCLI

cli = WiFiSecurityCLI()
cli.run(['scan'])
```

## Solución de Problemas

### Error: "No module named 'src'"

**Solución**:
```bash
# Asegúrate de ejecutar desde el directorio correcto
cd wifi-security-analyzer
python3 wifi_analyzer.py scan

# O ejecuta desde cualquier lugar con ruta absoluta
python3 /ruta/completa/a/wifi_analyzer.py scan
```

### Error: "nmcli: command not found" (Linux)

**Solución**:
```bash
# Instala NetworkManager
sudo apt-get install network-manager  # Debian/Ubuntu
sudo dnf install NetworkManager       # Fedora/CentOS

# Verifica que esté activo
sudo systemctl status NetworkManager
sudo systemctl start NetworkManager
```

### Error: "Permission denied" (Linux)

**Solución 1 - Con sudo**:
```bash
sudo python3 wifi_analyzer.py scan
```

**Solución 2 - Añadir usuario a grupo**:
```bash
sudo usermod -a -G sudo $USER
# O para network manager
sudo usermod -a -G netdev $USER
# Logout y login
```

### Error: "No networks detected" (Windows)

**Solución**:
```cmd
# Verifica que el driver Wi-Fi esté activo
netsh wlan show drivers

# Reinicia el servicio WLAN
netsh wlan set autoconfig enabled=yes interface="Wi-Fi"

# Ejecuta con permisos de admin
# Click derecho en CMD/PowerShell > "Run as administrator"
```

### Error: "airport command not found" (macOS)

**Solución**:
```bash
# Verifica la ruta completa
/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s

# Crea un alias
alias airport='/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport'
echo "alias airport='/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport'" >> ~/.zshrc
source ~/.zshrc
```

## Configuración Avanzada

### Variables de Entorno

```bash
# Linux
export WIFI_ANALYZER_GATEWAY=192.168.0.1
export WIFI_ANALYZER_TIMEOUT=10

# Windows (PowerShell)
$env:WIFI_ANALYZER_GATEWAY = "192.168.0.1"
```

### Permisos Necesarios

#### Linux
- **Para scaneo de redes**: nmcli (requiere NetworkManager)
- **Para detección de dispositivos**: ARP (generalmente accesible)
- **Para firmware**: Acceso de lectura a `/sys/class/net/`

#### Windows
- **Para scaneo**: Permisos de usuario normal
- **Para dispositivos**: Permisos de administrador (netsh)

#### macOS
- **Para scaneo**: Permisos normales
- **Para dispositivos**: Permisos de usuario

## Próximos Pasos

1. **Ver ejemplos**:
   ```bash
   python3 tests/test_examples.py
   ```

2. **Primer uso**:
   ```bash
   python3 wifi_analyzer.py scan
   ```

3. **Análisis completo**:
   ```bash
   python3 wifi_analyzer.py full
   ```

4. **Leer documentación**:
   ```bash
   cat README.md
   ```

## Desinstalación

### Remover Alias
```bash
# bash
sed -i "/alias wifi-analyzer=/d" ~/.bashrc
source ~/.bashrc

# zsh
sed -i "/alias wifi-analyzer=/d" ~/.zshrc
source ~/.zshrc
```

### Remover Instalación Global (Linux)
```bash
sudo rm /usr/local/bin/wifi-analyzer
sudo rm -rf /usr/local/lib/wifi-analyzer/
```

## Soporte

Si encuentras problemas:

1. Verifica los requisitos previos
2. Ejecuta con `--help` para ver opciones
3. Intenta con `sudo` si es necesario
4. Consulta la documentación en `docs/`
5. Abre un issue en el repositorio

---

**¡Listo para usar WiFi Security Analyzer!**
