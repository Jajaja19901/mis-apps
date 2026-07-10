"""
Generador de reportes de seguridad Wi-Fi
Presenta análisis en formato legible y exportable
"""

from datetime import datetime
from typing import Dict, List
import json


class ReportGenerator:
    def __init__(self):
        self.report = {}
        self.timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    def generate_report(self, network_analysis: Dict, devices: List[Dict],
                       scan_details: Dict = None) -> str:
        """Genera un reporte completo en formato texto"""
        report_lines = []

        report_lines.append(self._header())
        report_lines.append(self._network_section(network_analysis))
        report_lines.append(self._vulnerabilities_section(network_analysis))
        report_lines.append(self._password_section(network_analysis))
        report_lines.append(self._devices_section(devices))
        report_lines.append(self._signal_section(network_analysis))
        report_lines.append(self._recommendations_section(network_analysis))
        report_lines.append(self._footer())

        return '\n'.join(report_lines)

    def _header(self) -> str:
        """Encabezado del reporte"""
        return f"""
╔════════════════════════════════════════════════════════════════╗
║           ANÁLISIS DE SEGURIDAD RED WI-FI                      ║
║                                                                ║
║  Fecha y hora: {self.timestamp}
╚════════════════════════════════════════════════════════════════╝
"""

    def _network_section(self, analysis: Dict) -> str:
        """Sección de información de la red"""
        lines = [
            "\n📡 INFORMACIÓN DE LA RED",
            "─" * 64,
        ]

        lines.append(f"SSID:                {analysis.get('ssid', 'N/A')}")
        lines.append(f"Tipo de Cifrado:     {analysis.get('encryption', 'Unknown')}")
        lines.append(f"Canal:               {analysis.get('channel', 'N/A')}")
        lines.append(f"Frecuencia:          {analysis.get('frequency', 'N/A')}")
        lines.append(f"Intensidad Señal:    {analysis.get('signal_strength', 'N/A')} dBm")

        if analysis.get('encryption_status'):
            lines.append(f"Estado Cifrado:      {analysis['encryption_status']}")

        return '\n'.join(lines)

    def _vulnerabilities_section(self, analysis: Dict) -> str:
        """Sección de vulnerabilidades detectadas"""
        lines = [
            "\n🔍 VULNERABILIDADES DETECTADAS",
            "─" * 64,
        ]

        vulnerabilities = analysis.get('vulnerabilities', [])

        if not vulnerabilities:
            lines.append("✅ No se detectaron vulnerabilidades críticas")
            return '\n'.join(lines)

        # Agrupa por severidad
        critical = [v for v in vulnerabilities if v.get('severity') == 'critical']
        high = [v for v in vulnerabilities if v.get('severity') == 'high']
        medium = [v for v in vulnerabilities if v.get('severity') == 'medium']

        if critical:
            lines.append("\n🔴 CRÍTICAS:")
            for vuln in critical:
                lines.extend(self._format_vulnerability(vuln))

        if high:
            lines.append("\n🟠 ALTAS:")
            for vuln in high:
                lines.extend(self._format_vulnerability(vuln))

        if medium:
            lines.append("\n🟡 MEDIAS:")
            for vuln in medium:
                lines.extend(self._format_vulnerability(vuln))

        return '\n'.join(lines)

    def _format_vulnerability(self, vuln: Dict) -> List[str]:
        """Formatea una vulnerabilidad individual"""
        lines = [f"\n  {vuln.get('title', 'Unknown')}"]
        lines.append(f"  Descripción: {vuln.get('description', 'N/A')}")
        lines.append(f"  Impacto: {vuln.get('impact', 'N/A')}")

        if vuln.get('details'):
            lines.append(f"  Detalles:")
            for key, value in vuln['details'].items():
                lines.append(f"    - {key}: {value}")

        return lines

    def _password_section(self, analysis: Dict) -> str:
        """Sección de análisis de contraseña"""
        lines = [
            "\n🔐 ANÁLISIS DE CONTRASEÑA",
            "─" * 64,
        ]

        pwd_analysis = analysis.get('password_analysis')

        if not pwd_analysis:
            lines.append("No se proporcionó contraseña para análisis")
            return '\n'.join(lines)

        strength = pwd_analysis.get('strength', '').replace('_', ' ').title()
        lines.append(f"Fortaleza: {strength}")
        lines.append(f"Puntuación: {pwd_analysis.get('score', 0)}/100")
        lines.append(f"Longitud: {pwd_analysis.get('length', 0)} caracteres")

        details = pwd_analysis.get('details', {})
        lines.append(f"\nCaracterísticas:")
        lines.append(f"  ✓ Minúsculas (a-z): {'Sí' if details.get('has_lowercase') else 'No'}")
        lines.append(f"  ✓ Mayúsculas (A-Z): {'Sí' if details.get('has_uppercase') else 'No'}")
        lines.append(f"  ✓ Números (0-9): {'Sí' if details.get('has_digits') else 'No'}")
        lines.append(f"  ✓ Símbolos: {'Sí' if details.get('has_special') else 'No'}")
        lines.append(f"  ✓ Bits de Entropía: {details.get('entropy_bits', 0)}")

        if pwd_analysis.get('suggestions'):
            lines.append(f"\nSugerencias de mejora:")
            for suggestion in pwd_analysis['suggestions']:
                lines.append(f"  • {suggestion}")

        return '\n'.join(lines)

    def _devices_section(self, devices: List[Dict]) -> str:
        """Sección de dispositivos conectados"""
        lines = [
            "\n📱 DISPOSITIVOS CONECTADOS",
            "─" * 64,
        ]

        if not devices:
            lines.append("No se detectaron dispositivos")
            return '\n'.join(lines)

        suspicious = [d for d in devices if d.get('is_suspicious')]
        trusted = [d for d in devices if not d.get('is_suspicious')]

        lines.append(f"Total de dispositivos: {len(devices)}")

        if suspicious:
            lines.append(f"\n⚠️ Dispositivos Sospechosos: {len(suspicious)}")
            for device in suspicious:
                lines.extend(self._format_device(device, True))

        if trusted:
            lines.append(f"\n✅ Dispositivos Confiables: {len(trusted)}")
            for device in trusted[:5]:  # Muestra solo los primeros 5
                lines.extend(self._format_device(device, False))

            if len(trusted) > 5:
                lines.append(f"... y {len(trusted) - 5} más")

        return '\n'.join(lines)

    def _format_device(self, device: Dict, is_suspicious: bool) -> List[str]:
        """Formatea información de un dispositivo"""
        marker = "⚠️ " if is_suspicious else "✓ "
        lines = [
            f"\n  {marker}IP: {device.get('ip', 'N/A')}",
            f"    MAC: {device.get('mac', 'N/A')}",
            f"    Tipo: {device.get('type', 'Desconocido')}",
        ]

        if device.get('hostname') and device['hostname'] != 'Unknown':
            lines.append(f"    Hostname: {device['hostname']}")

        return lines

    def _signal_section(self, analysis: Dict) -> str:
        """Sección de análisis de señal"""
        lines = [
            "\n📊 ANÁLISIS DE SEÑAL",
            "─" * 64,
        ]

        signal = analysis.get('signal_analysis', {})
        lines.append(f"Intensidad: {signal.get('strength_dbm', 'N/A')} dBm")
        lines.append(f"Calidad: {signal.get('quality', 'N/A')}")

        # Escala visual
        dbm = signal.get('strength_dbm', -100)
        if dbm >= -50:
            bar = "████████████████████ 100%"
        elif dbm >= -60:
            bar = "██████████████░░░░░░ 80%"
        elif dbm >= -70:
            bar = "███████████░░░░░░░░░ 60%"
        elif dbm >= -80:
            bar = "██████░░░░░░░░░░░░░░ 40%"
        else:
            bar = "███░░░░░░░░░░░░░░░░░ 20%"

        lines.append(f"Escala: {bar}")

        return '\n'.join(lines)

    def _recommendations_section(self, analysis: Dict) -> str:
        """Sección de recomendaciones"""
        lines = [
            "\n💡 RECOMENDACIONES PRINCIPALES",
            "─" * 64,
        ]

        vulnerabilities = analysis.get('vulnerabilities', [])

        if not vulnerabilities:
            lines.append("✅ Tu red está bien configurada. Continúa con estas prácticas:")
            lines.extend([
                "  1. Realiza escaneos periódicos",
                "  2. Mantén el firmware del router actualizado",
                "  3. Usa una contraseña fuerte",
                "  4. Desactiva WPS si no lo necesitas"
            ])
            return '\n'.join(lines)

        recommendations_shown = set()

        for vuln in vulnerabilities:
            if vuln.get('type') not in recommendations_shown:
                recommendations_shown.add(vuln['type'])
                lines.append(f"\n▸ {vuln.get('title', 'Problema')}")
                for rec in vuln.get('recommendation', []):
                    lines.append(f"  {rec}")

        return '\n'.join(lines)

    def _footer(self) -> str:
        """Pie de página del reporte"""
        return """
╔════════════════════════════════════════════════════════════════╗
║  Recuerda: La seguridad Wi-Fi es un proceso continuo.          ║
║  Realiza escaneos periódicamente y mantén tus dispositivos     ║
║  y router actualizados.                                        ║
╚════════════════════════════════════════════════════════════════╝
"""

    def export_json(self, network_analysis: Dict, devices: List[Dict]) -> str:
        """Exporta el análisis en formato JSON"""
        export_data = {
            'timestamp': self.timestamp,
            'network_analysis': network_analysis,
            'devices': devices,
            'summary': {
                'total_vulnerabilities': len(network_analysis.get('vulnerabilities', [])),
                'total_devices': len(devices),
                'suspicious_devices': sum(1 for d in devices if d.get('is_suspicious')),
                'overall_risk': network_analysis.get('overall_risk', 'unknown')
            }
        }

        return json.dumps(export_data, indent=2, ensure_ascii=False)

    def export_csv(self, devices: List[Dict]) -> str:
        """Exporta dispositivos en formato CSV"""
        lines = ['IP,MAC,Type,Hostname,Suspicious']

        for device in devices:
            lines.append(
                f"{device.get('ip', '')},{device.get('mac', '')},{device.get('type', '')},"
                f"{device.get('hostname', '')},{device.get('is_suspicious', False)}"
            )

        return '\n'.join(lines)
