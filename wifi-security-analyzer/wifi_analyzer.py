#!/usr/bin/env python3
"""
WiFi Security Analyzer
Herramienta completa de análisis de seguridad para redes inalámbricas
Versión: 1.0.0

Uso:
    python wifi_analyzer.py scan                           # Escanea redes disponibles
    python wifi_analyzer.py analyze --ssid "Mi Red"        # Analiza una red específica
    python wifi_analyzer.py devices                        # Detecta dispositivos
    python wifi_analyzer.py password --check "miPassword"  # Evalúa contraseña
    python wifi_analyzer.py full                           # Análisis completo

Requisitos:
    - Python 3.7+
    - nmcli, arp, netsh o airport (según el SO)
"""

import sys
import os

# Añade el directorio src al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from cli import WiFiSecurityCLI


def main():
    """Punto de entrada principal"""
    print("""
╔════════════════════════════════════════════════════════════════╗
║       WiFi Security Analyzer v1.0.0                           ║
║       Herramienta de Análisis de Seguridad Wi-Fi             ║
╚════════════════════════════════════════════════════════════════╝
    """)

    cli = WiFiSecurityCLI()
    cli.run()


if __name__ == '__main__':
    main()
