"""
Interfaz de línea de comandos para el analizador de seguridad Wi-Fi
"""

import argparse
import sys
from typing import Optional
from wifi_scanner import WiFiScanner
from vulnerability_analyzer import VulnerabilityAnalyzer
from device_detector import DeviceDetector
from password_analyzer import PasswordAnalyzer
from report_generator import ReportGenerator


class WiFiSecurityCLI:
    def __init__(self):
        self.scanner = WiFiScanner()
        self.vulnerability_analyzer = VulnerabilityAnalyzer()
        self.device_detector = DeviceDetector()
        self.password_analyzer = PasswordAnalyzer()
        self.report_generator = ReportGenerator()

    def run(self, args=None):
        """Ejecuta la CLI con los argumentos proporcionados"""
        parser = self._build_parser()
        parsed_args = parser.parse_args(args)

        if not hasattr(parsed_args, 'func'):
            parser.print_help()
            return

        try:
            parsed_args.func(parsed_args)
        except KeyboardInterrupt:
            print("\n\n⚠️  Análisis cancelado por el usuario")
            sys.exit(0)
        except Exception as e:
            print(f"\n❌ Error: {e}")
            sys.exit(1)

    def _build_parser(self) -> argparse.ArgumentParser:
        """Construye el parser de argumentos"""
        parser = argparse.ArgumentParser(
            prog='wifi-security-analyzer',
            description='Herramienta completa de análisis de seguridad Wi-Fi',
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
Ejemplos de uso:
  %(prog)s scan                           # Escanea redes disponibles
  %(prog)s analyze --ssid "Mi Red"        # Analiza una red específica
  %(prog)s analyze --ssid "Mi Red" --password "contraseña"
  %(prog)s devices                        # Detecta dispositivos conectados
  %(prog)s password --check "miPassword"  # Evalúa una contraseña
  %(prog)s full                           # Análisis completo
            """
        )

        subparsers = parser.add_subparsers(title='Comandos disponibles')

        # Comando: scan
        scan_parser = subparsers.add_parser(
            'scan',
            help='Escanea redes Wi-Fi disponibles'
        )
        scan_parser.set_defaults(func=self.cmd_scan)

        # Comando: analyze
        analyze_parser = subparsers.add_parser(
            'analyze',
            help='Analiza vulnerabilidades de una red específica'
        )
        analyze_parser.add_argument(
            '--ssid', '-s',
            help='Nombre de la red a analizar',
            required=False
        )
        analyze_parser.add_argument(
            '--password', '-p',
            help='Contraseña Wi-Fi para análisis (optional)',
            required=False
        )
        analyze_parser.set_defaults(func=self.cmd_analyze)

        # Comando: devices
        devices_parser = subparsers.add_parser(
            'devices',
            help='Detecta dispositivos conectados a la red'
        )
        devices_parser.add_argument(
            '--gateway', '-g',
            default='192.168.1.1',
            help='IP del gateway (default: 192.168.1.1)'
        )
        devices_parser.set_defaults(func=self.cmd_devices)

        # Comando: password
        password_parser = subparsers.add_parser(
            'password',
            help='Evalúa la fortaleza de una contraseña'
        )
        password_parser.add_argument(
            '--check', '-c',
            help='Contraseña a evaluar',
            required=False
        )
        password_parser.add_argument(
            '--generate', '-g',
            action='store_true',
            help='Genera una contraseña fuerte sugerida'
        )
        password_parser.set_defaults(func=self.cmd_password)

        # Comando: full
        full_parser = subparsers.add_parser(
            'full',
            help='Realiza un análisis completo de seguridad'
        )
        full_parser.add_argument(
            '--ssid', '-s',
            help='Red específica a analizar',
            required=False
        )
        full_parser.add_argument(
            '--password', '-p',
            help='Contraseña Wi-Fi',
            required=False
        )
        full_parser.add_argument(
            '--export', '-e',
            choices=['json', 'csv'],
            help='Exportar resultados'
        )
        full_parser.set_defaults(func=self.cmd_full)

        return parser

    def cmd_scan(self, args):
        """Comando: Escanea redes disponibles"""
        print("\n🔍 Escaneando redes Wi-Fi disponibles...\n")

        networks = self.scanner.scan_networks()

        if not networks:
            print("❌ No se detectaron redes Wi-Fi")
            return

        print(f"✅ Se encontraron {len(networks)} red(es):\n")
        print("─" * 80)

        for i, network in enumerate(networks, 1):
            ssid = network.get('ssid', 'Hidden Network')
            security = network.get('security', 'Unknown')
            signal = network.get('signal_strength', -100)
            channel = network.get('channel', '?')
            frequency = network.get('frequency', '?')

            # Icono de seguridad
            if 'WEP' in security or 'Open' in security:
                security_icon = '🔴'
            elif 'WPA' in security and 'WPA2' not in security and 'WPA3' not in security:
                security_icon = '🟠'
            elif 'WPA3' in security:
                security_icon = '🟢'
            else:
                security_icon = '🟡'

            # Calidad de señal
            if signal >= -50:
                signal_icon = '🟢'
            elif signal >= -70:
                signal_icon = '🟡'
            else:
                signal_icon = '🔴'

            print(f"{i}. {ssid}")
            print(f"   {security_icon} Seguridad: {security}")
            print(f"   {signal_icon} Señal: {signal} dBm")
            print(f"   📡 Canal: {channel} | Frecuencia: {frequency}")
            print()

    def cmd_analyze(self, args):
        """Comando: Analiza vulnerabilidades de una red"""
        ssid = args.ssid
        password = args.password

        if not ssid:
            print("\n❌ Debes especificar un SSID con --ssid")
            return

        print(f"\n🔍 Analizando red: {ssid}\n")

        # Busca la red en el escaneo
        networks = self.scanner.scan_networks()
        network = next((n for n in networks if n.get('ssid') == ssid), None)

        if not network:
            print(f"⚠️  No se encontró la red '{ssid}' en el escaneo")
            print("Continuando con análisis limitado...\n")
            network = {'ssid': ssid}

        # Realiza análisis
        analysis = self.vulnerability_analyzer.analyze_network(network, password)

        # Genera reporte
        report = self.report_generator.generate_report(analysis, [])
        print(report)

    def cmd_devices(self, args):
        """Comando: Detecta dispositivos conectados"""
        gateway = args.gateway

        print(f"\n📱 Escaneando dispositivos en red {gateway}...\n")

        self.device_detector.gateway_ip = gateway
        devices = self.device_detector.scan_devices()

        if not devices:
            print("❌ No se detectaron dispositivos")
            return

        print(f"✅ Se encontraron {len(devices)} dispositivo(s):\n")
        print("─" * 80)

        suspicious = [d for d in devices if d.get('is_suspicious')]
        trusted = [d for d in devices if not d.get('is_suspicious')]

        if suspicious:
            print("\n⚠️  DISPOSITIVOS SOSPECHOSOS:\n")
            for device in suspicious:
                self._print_device(device)

        if trusted:
            print("\n✅ DISPOSITIVOS CONFIABLES:\n")
            for device in trusted:
                self._print_device(device)

        print(f"\n📊 Resumen: {len(trusted)} confiables, {len(suspicious)} sospechosos")

    def cmd_password(self, args):
        """Comando: Evalúa fortaleza de contraseña"""
        if args.generate:
            print("\n🔐 Generando contraseña fuerte...\n")
            password = self.password_analyzer.generate_strong_password()
            print(f"Sugerencia: {password}\n")

            # Analiza la contraseña generada
            analysis = self.password_analyzer.analyze(password)
            self._print_password_analysis(analysis)

        elif args.check:
            print(f"\n🔐 Analizando contraseña...\n")
            analysis = self.password_analyzer.analyze(args.check)
            self._print_password_analysis(analysis)

        else:
            print("\n❌ Debes usar --check para evaluar o --generate para crear una")

    def cmd_full(self, args):
        """Comando: Análisis completo de seguridad"""
        print("\n" + "=" * 80)
        print("ANÁLISIS COMPLETO DE SEGURIDAD WI-FI")
        print("=" * 80)

        ssid = args.ssid
        password = args.password

        # Escaneo de redes
        print("\n[1/4] Escaneando redes Wi-Fi...")
        networks = self.scanner.scan_networks()
        print(f"✅ {len(networks)} red(es) encontrada(s)")

        if not ssid and networks:
            # Usa la primera red
            ssid = networks[0].get('ssid', 'Unknown')
            print(f"    (Analizando: {ssid})")

        # Análisis de vulnerabilidades
        print(f"\n[2/4] Analizando vulnerabilidades...")
        network = next((n for n in networks if n.get('ssid') == ssid), {'ssid': ssid})
        analysis = self.vulnerability_analyzer.analyze_network(network, password)
        print(f"✅ {len(analysis['vulnerabilities'])} vulnerabilidad(es) detectada(s)")

        # Detección de dispositivos
        print(f"\n[3/4] Escaneando dispositivos conectados...")
        devices = self.device_detector.scan_devices()
        print(f"✅ {len(devices)} dispositivo(s) encontrado(s)")

        # Generación de reporte
        print(f"\n[4/4] Generando reporte...")
        report = self.report_generator.generate_report(analysis, devices)
        print(report)

        # Exporta si se solicita
        if args.export:
            self._export_results(analysis, devices, args.export)

    def _print_device(self, device: dict):
        """Imprime información de un dispositivo"""
        icon = "⚠️ " if device.get('is_suspicious') else "✓ "
        print(f"{icon} IP: {device.get('ip')} | MAC: {device.get('mac')}")
        print(f"   Tipo: {device.get('type')}")
        if device.get('hostname') != 'Unknown':
            print(f"   Hostname: {device.get('hostname')}")
        print()

    def _print_password_analysis(self, analysis: dict):
        """Imprime análisis de contraseña"""
        strength = analysis['strength'].replace('_', ' ').title()
        score = analysis['score']

        print(f"Fortaleza: {strength}")
        print(f"Puntuación: {score}/100")
        print(f"Longitud: {analysis['length']} caracteres")
        print()

        details = analysis['details']
        print("Características:")
        print(f"  ✓ Minúsculas: {'Sí' if details['has_lowercase'] else 'No'}")
        print(f"  ✓ Mayúsculas: {'Sí' if details['has_uppercase'] else 'No'}")
        print(f"  ✓ Números: {'Sí' if details['has_digits'] else 'No'}")
        print(f"  ✓ Símbolos: {'Sí' if details['has_special'] else 'No'}")
        print(f"  • Entropía: {details['entropy_bits']} bits\n")

        if analysis['suggestions']:
            print("Sugerencias de mejora:")
            for suggestion in analysis['suggestions']:
                print(f"  • {suggestion}")
        else:
            print("✅ Contraseña fuerte - No hay sugerencias")

        print()

    def _export_results(self, analysis: dict, devices: list, format: str):
        """Exporta resultados en el formato especificado"""
        filename = f"wifi_security_report.{format}"

        if format == 'json':
            content = self.report_generator.export_json(analysis, devices)
        else:  # csv
            content = self.report_generator.export_csv(devices)

        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)

        print(f"\n✅ Reporte exportado a: {filename}")


def main():
    cli = WiFiSecurityCLI()
    cli.run()


if __name__ == '__main__':
    main()
