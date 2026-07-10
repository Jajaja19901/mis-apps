"""
Detección de dispositivos conectados a la red
Identifica IPs, MACs y tipos de dispositivos
"""

import subprocess
import re
import platform
from typing import List, Dict
from config import COMMON_DEVICES


class DeviceDetector:
    def __init__(self, gateway_ip: str = '192.168.1.1'):
        self.gateway_ip = gateway_ip
        self.system = platform.system()
        self.devices = []

    def scan_devices(self) -> List[Dict]:
        """Escanea dispositivos conectados a la red"""
        if self.system == 'Linux':
            return self._scan_linux()
        elif self.system == 'Windows':
            return self._scan_windows()
        elif self.system == 'Darwin':
            return self._scan_macos()
        else:
            return self._get_mock_devices()

    def _scan_linux(self) -> List[Dict]:
        """Escanea dispositivos en Linux usando arp-scan o nmap"""
        devices = []

        try:
            result = subprocess.run(
                ['arp', '-n'],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode == 0:
                devices = self._parse_arp_output(result.stdout)
                if devices:
                    return devices

        except Exception as e:
            print(f"Error en ARP scan: {e}")

        # Fallback: intenta ping
        return self._scan_with_ping()

    def _parse_arp_output(self, output: str) -> List[Dict]:
        """Parsea salida del comando arp"""
        devices = []

        for line in output.strip().split('\n')[1:]:  # Skip header
            parts = line.split()
            if len(parts) >= 4:
                ip = parts[0]
                mac = parts[2]

                # Filtra el gateway mismo
                if ip != self.gateway_ip:
                    devices.append({
                        'ip': ip,
                        'mac': mac,
                        'type': self._identify_device(mac),
                        'hostname': self._get_hostname(ip),
                        'is_suspicious': self._check_suspicious(mac)
                    })

        return devices

    def _scan_windows(self) -> List[Dict]:
        """Escanea dispositivos en Windows usando arp"""
        devices = []

        try:
            result = subprocess.run(
                ['arp', '-a'],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode == 0:
                devices = self._parse_windows_arp_output(result.stdout)
                if devices:
                    return devices

        except Exception as e:
            print(f"Error en ARP scan Windows: {e}")

        return self._get_mock_devices()

    def _parse_windows_arp_output(self, output: str) -> List[Dict]:
        """Parsea salida de arp -a en Windows"""
        devices = []
        current_interface = None

        for line in output.split('\n'):
            if 'Interface' in line:
                current_interface = line.split('Interface:')[1].strip().split()[0]
            elif re.match(r'^\s+\d+\.\d+\.\d+\.\d+', line):
                parts = line.split()
                if len(parts) >= 3:
                    ip = parts[0].strip()
                    mac = parts[1]

                    if ip != self.gateway_ip:
                        devices.append({
                            'ip': ip,
                            'mac': mac,
                            'type': self._identify_device(mac),
                            'hostname': self._get_hostname(ip),
                            'is_suspicious': self._check_suspicious(mac)
                        })

        return devices

    def _scan_macos(self) -> List[Dict]:
        """Escanea dispositivos en macOS"""
        devices = []

        try:
            result = subprocess.run(
                ['arp', '-a'],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode == 0:
                devices = self._parse_macos_arp_output(result.stdout)
                if devices:
                    return devices

        except Exception as e:
            print(f"Error en ARP scan macOS: {e}")

        return self._get_mock_devices()

    def _parse_macos_arp_output(self, output: str) -> List[Dict]:
        """Parsea salida de arp -a en macOS"""
        devices = []

        for line in output.strip().split('\n'):
            parts = re.findall(r'([0-9.]+).*?([0-9a-f:]{17})', line)
            if parts:
                ip, mac = parts[0]

                if ip != self.gateway_ip:
                    devices.append({
                        'ip': ip,
                        'mac': mac.upper(),
                        'type': self._identify_device(mac),
                        'hostname': self._get_hostname(ip),
                        'is_suspicious': self._check_suspicious(mac)
                    })

        return devices

    def _scan_with_ping(self) -> List[Dict]:
        """Escanea usando ping (fallback)"""
        devices = []
        base_ip = '.'.join(self.gateway_ip.split('.')[:3])

        for i in range(1, 255):
            ip = f"{base_ip}.{i}"
            if ip == self.gateway_ip:
                continue

            try:
                result = subprocess.run(
                    ['ping', '-c', '1', '-W', '100', ip] if self.system == 'Linux' else ['ping', '-n', '1', '-w', '100', ip],
                    capture_output=True,
                    timeout=1
                )

                if result.returncode == 0:
                    devices.append({
                        'ip': ip,
                        'mac': 'Unknown',
                        'type': 'Unknown',
                        'hostname': self._get_hostname(ip),
                        'is_suspicious': False
                    })

            except:
                pass

        return devices

    def _identify_device(self, mac: str) -> str:
        """Identifica el tipo de dispositivo basado en el OUI de la MAC"""
        mac_upper = mac.upper().replace(':', '-')
        prefix = mac_upper[:8]

        # Base de datos simplificada de OUI (primeros 3 octetos)
        oui_db = {
            '00-1A-2B': 'Apple iPhone',
            '00-1F-F3': 'Apple',
            '08-00-27': 'VirtualBox',
            '52-54-00': 'QEMU',
            '00-0C-29': 'VMware',
            '00-50-F2': 'Microsoft',
            '00-13-10': 'Linksys',
            '00-1D-7E': 'Netgear',
            '00-18-4D': 'D-Link',
            '00-90-CC': 'Nortel',
            'B4-2F-50': 'Xiaomi',
            '5C-F9-DD': 'Huawei',
            'F0-79-59': 'OnePlus',
            '00-1B-44': 'Intel',
            '00-25-86': 'Apple',
        }

        for oui, device_type in oui_db.items():
            if prefix.startswith(oui[:8]):
                return device_type

        # Intenta identificar por patrones comunes
        if mac.lower().startswith(('00:1a:2b', '00:1f:f3', '52:54:00')):
            return 'Apple Device'
        elif mac.lower().startswith('08:00:27'):
            return 'Virtual Machine'
        else:
            return 'Dispositivo Desconocido'

    def _get_hostname(self, ip: str) -> str:
        """Obtiene el nombre del host basado en la IP"""
        try:
            import socket
            hostname = socket.gethostbyaddr(ip)[0]
            return hostname
        except:
            return 'Unknown'

    def _check_suspicious(self, mac: str) -> bool:
        """Detecta MACs potencialmente sospechosas"""
        mac_lower = mac.lower()

        # MACs spoofed suelen tener patrones específicos
        suspicious_patterns = [
            '00:00:00',  # Todos ceros
            'ff:ff:ff',  # Todos unos
        ]

        for pattern in suspicious_patterns:
            if mac_lower.startswith(pattern):
                return True

        # Check si es MAC unicast válida (bit menos significativo del primer octeto debe ser 0)
        first_octet = int(mac_lower.replace(':', '')[0:2], 16)
        return (first_octet & 1) != 0  # Si es impar, es broadcast/multicast

    def _get_mock_devices(self) -> List[Dict]:
        """Retorna dispositivos simulados para demostración"""
        return [
            {
                'ip': '192.168.1.2',
                'mac': '00:1A:2B:3C:4D:5E',
                'type': 'Apple iPhone',
                'hostname': 'iphone-juan',
                'is_suspicious': False
            },
            {
                'ip': '192.168.1.3',
                'mac': '00:50:F2:C0:DE:AD',
                'type': 'Windows Laptop',
                'hostname': 'laptop-casa',
                'is_suspicious': False
            },
            {
                'ip': '192.168.1.4',
                'mac': '00:13:10:AB:CD:EF',
                'type': 'Linksys Device',
                'hostname': 'unknown-device',
                'is_suspicious': False
            },
            {
                'ip': '192.168.1.5',
                'mac': 'AA:BB:CC:DD:EE:FF',
                'type': 'Desconocido',
                'hostname': 'suspicious-device',
                'is_suspicious': True
            }
        ]

    def get_trusted_devices(self) -> List[Dict]:
        """Retorna solo los dispositivos confiables"""
        return [d for d in self.devices if not d.get('is_suspicious', False)]

    def get_suspicious_devices(self) -> List[Dict]:
        """Retorna dispositivos potencialmente sospechosos"""
        return [d for d in self.devices if d.get('is_suspicious', False)]

    def get_device_count(self) -> int:
        """Retorna el número de dispositivos conectados"""
        return len(self.devices)
