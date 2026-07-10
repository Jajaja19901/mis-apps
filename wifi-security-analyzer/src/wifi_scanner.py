"""
Scanner de redes Wi-Fi disponibles
Detecta redes, obtiene información de seguridad y canales
"""

import subprocess
import json
import platform
import re
from typing import List, Dict, Optional


class WiFiScanner:
    def __init__(self):
        self.system = platform.system()
        self.networks = []

    def scan_networks(self) -> List[Dict]:
        """
        Escanea redes Wi-Fi disponibles según el sistema operativo
        Retorna lista de redes con detalles de seguridad
        """
        if self.system == 'Linux':
            return self._scan_linux()
        elif self.system == 'Windows':
            return self._scan_windows()
        elif self.system == 'Darwin':  # macOS
            return self._scan_macos()
        else:
            print(f"Sistema operativo no soportado: {self.system}")
            return []

    def _scan_linux(self) -> List[Dict]:
        """Escanea usando nmcli o iwlist en Linux"""
        try:
            # Intenta primero con nmcli (NetworkManager)
            result = subprocess.run(
                ['nmcli', '-t', '-f', 'SSID,SECURITY,SIGNAL,CHAN', 'dev', 'wifi'],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                return self._parse_nmcli_output(result.stdout)

            print("⚠ nmcli no disponible, intenta instalar NetworkManager")
            return self._scan_linux_iwlist()

        except Exception as e:
            print(f"Error en scan Linux: {e}")
            return self._get_mock_networks()

    def _parse_nmcli_output(self, output: str) -> List[Dict]:
        """Parsea la salida de nmcli"""
        networks = []

        for line in output.strip().split('\n'):
            if not line:
                continue

            parts = line.split(':')
            if len(parts) >= 4:
                networks.append({
                    'ssid': parts[0].strip(),
                    'security': parts[1].strip() or 'Open',
                    'signal_strength': int(parts[2].strip() or -100),
                    'channel': self._parse_channel(parts[3].strip()),
                    'frequency': self._channel_to_frequency(self._parse_channel(parts[3].strip()))
                })

        return networks

    def _scan_linux_iwlist(self) -> List[Dict]:
        """Alternativa usando iwlist si nmcli no está disponible"""
        try:
            result = subprocess.run(
                ['sudo', 'iwlist', 'scan'],
                capture_output=True,
                text=True,
                timeout=15
            )

            if result.returncode == 0:
                return self._parse_iwlist_output(result.stdout)
        except Exception as e:
            print(f"Error iwlist: {e}")

        return self._get_mock_networks()

    def _parse_iwlist_output(self, output: str) -> List[Dict]:
        """Parsea salida de iwlist"""
        networks = []
        current = None

        for line in output.split('\n'):
            if 'ESSID:' in line:
                if current:
                    networks.append(current)
                current = {
                    'ssid': line.split('ESSID:')[1].strip('"'),
                    'security': 'Unknown',
                    'signal_strength': -100,
                    'channel': 0,
                    'frequency': '2.4GHz'
                }
            elif 'Signal level' in line:
                try:
                    strength = int(line.split('=')[1].split('/')[0].strip())
                    if current:
                        current['signal_strength'] = strength
                except:
                    pass
            elif 'Frequency:' in line:
                if current:
                    current['frequency'] = self._extract_frequency(line)

        if current:
            networks.append(current)

        return networks

    def _scan_windows(self) -> List[Dict]:
        """Escanea redes Wi-Fi en Windows usando netsh"""
        try:
            result = subprocess.run(
                ['netsh', 'wlan', 'show', 'network', 'mode=Bssid'],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                return self._parse_windows_output(result.stdout)

        except Exception as e:
            print(f"Error en scan Windows: {e}")

        return self._get_mock_networks()

    def _parse_windows_output(self, output: str) -> List[Dict]:
        """Parsea salida de netsh en Windows"""
        networks = []
        current = None

        for line in output.split('\n'):
            if 'SSID' in line and ':' in line:
                parts = line.split(':', 1)
                if len(parts) == 2:
                    if current:
                        networks.append(current)
                    current = {
                        'ssid': parts[1].strip(),
                        'security': 'Unknown',
                        'signal_strength': -100,
                        'channel': 0,
                        'frequency': '2.4GHz'
                    }
            elif 'Authentication' in line and current:
                current['security'] = line.split(':', 1)[1].strip() if ':' in line else 'Unknown'
            elif 'Signal' in line and current:
                try:
                    signal = int(line.split(':')[1].strip().split('%')[0]) - 100
                    current['signal_strength'] = signal
                except:
                    pass

        if current:
            networks.append(current)

        return networks

    def _scan_macos(self) -> List[Dict]:
        """Escanea redes Wi-Fi en macOS"""
        try:
            result = subprocess.run(
                ['/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport', '-s'],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                return self._parse_macos_output(result.stdout)

        except Exception as e:
            print(f"Error en scan macOS: {e}")

        return self._get_mock_networks()

    def _parse_macos_output(self, output: str) -> List[Dict]:
        """Parsea salida de airport en macOS"""
        networks = []

        for line in output.strip().split('\n')[1:]:  # Skip header
            if not line.strip():
                continue

            parts = line.split()
            if len(parts) >= 7:
                networks.append({
                    'ssid': parts[0],
                    'bssid': parts[1],
                    'signal_strength': int(parts[2]),
                    'channel': int(parts[3]),
                    'security': ' '.join(parts[4:]),
                    'frequency': self._channel_to_frequency(int(parts[3]))
                })

        return networks

    def _parse_channel(self, channel_str: str) -> int:
        """Extrae el número de canal"""
        try:
            return int(re.search(r'\d+', channel_str).group())
        except:
            return 0

    def _extract_frequency(self, line: str) -> str:
        """Extrae la frecuencia (2.4GHz o 5GHz)"""
        try:
            freq = float(line.split('=')[1].strip().split('GHz')[0])
            return '5GHz' if freq > 3 else '2.4GHz'
        except:
            return 'Unknown'

    def _channel_to_frequency(self, channel: int) -> str:
        """Convierte número de canal a banda de frecuencia"""
        if 1 <= channel <= 14:
            return '2.4GHz'
        elif 36 <= channel <= 165:
            return '5GHz'
        elif 1 <= channel <= 7:  # WiFi 6E (6GHz)
            return '6GHz'
        else:
            return 'Unknown'

    def _get_mock_networks(self) -> List[Dict]:
        """Retorna datos simulados para pruebas/demostración"""
        return [
            {
                'ssid': 'Mi Red Principal',
                'security': 'WPA2',
                'signal_strength': -55,
                'channel': 6,
                'frequency': '2.4GHz',
                'wps': True,
                'firmware': 'TP-Link'
            },
            {
                'ssid': 'Red Vecino',
                'security': 'WEP',
                'signal_strength': -72,
                'channel': 11,
                'frequency': '2.4GHz'
            },
            {
                'ssid': 'Red Pública',
                'security': 'Open',
                'signal_strength': -85,
                'channel': 1,
                'frequency': '2.4GHz'
            },
            {
                'ssid': 'Red 5GHz',
                'security': 'WPA3',
                'signal_strength': -65,
                'channel': 36,
                'frequency': '5GHz'
            }
        ]

    def get_network_details(self, ssid: str) -> Optional[Dict]:
        """Obtiene detalles específicos de una red"""
        for network in self.networks:
            if network.get('ssid') == ssid:
                return network
        return None

    def get_signal_quality(self, signal_strength: int) -> str:
        """Clasifica la calidad de señal"""
        if signal_strength >= -50:
            return 'Excelente'
        elif signal_strength >= -60:
            return 'Muy buena'
        elif signal_strength >= -70:
            return 'Buena'
        elif signal_strength >= -80:
            return 'Aceptable'
        else:
            return 'Débil'
