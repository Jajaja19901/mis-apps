#!/usr/bin/env python3
"""
Ejemplos de uso del WiFi Security Analyzer
Demuestra todas las funcionalidades principales
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from password_analyzer import PasswordAnalyzer
from vulnerability_analyzer import VulnerabilityAnalyzer
from report_generator import ReportGenerator


def example_password_analysis():
    """Ejemplo: Análisis de contraseña"""
    print("\n" + "="*80)
    print("EJEMPLO 1: Análisis de Contraseña")
    print("="*80)

    analyzer = PasswordAnalyzer()

    test_passwords = [
        '123456',                    # Muy débil
        'password123',               # Débil
        'MyPassword123!',            # Moderada
        'K9@mL2xP!qW7vN#sR4bT',    # Fuerte
    ]

    for pwd in test_passwords:
        analysis = analyzer.analyze(pwd)
        strength = analysis['strength'].replace('_', ' ').title()
        score = analysis['score']

        print(f"\nContraseña: {pwd}")
        print(f"  Fortaleza: {strength}")
        print(f"  Puntuación: {score}/100")
        print(f"  Longitud: {analysis['length']} caracteres")

        if analysis['suggestions']:
            print(f"  Sugerencias:")
            for suggestion in analysis['suggestions'][:2]:
                print(f"    • {suggestion}")

    # Genera una contraseña fuerte
    print("\n" + "-"*80)
    print("Contraseña Fuerte Generada:")
    strong_pwd = analyzer.generate_strong_password(16)
    analysis = analyzer.analyze(strong_pwd)
    print(f"  {strong_pwd}")
    print(f"  Puntuación: {analysis['score']}/100")


def example_vulnerability_analysis():
    """Ejemplo: Análisis de vulnerabilidades"""
    print("\n" + "="*80)
    print("EJEMPLO 2: Análisis de Vulnerabilidades Wi-Fi")
    print("="*80)

    analyzer = VulnerabilityAnalyzer()

    test_networks = [
        {
            'ssid': 'Red Vulnerable',
            'security': 'WEP',
            'signal_strength': -65,
            'channel': 6,
            'frequency': '2.4GHz',
            'wps': True
        },
        {
            'ssid': 'Red Segura',
            'security': 'WPA3',
            'signal_strength': -50,
            'channel': 36,
            'frequency': '5GHz',
            'wps': False
        },
        {
            'ssid': 'Red Abierta',
            'security': 'Open',
            'signal_strength': -75,
            'channel': 11,
            'frequency': '2.4GHz'
        }
    ]

    for network in test_networks:
        print(f"\n📡 Red: {network['ssid']}")
        print("-" * 80)

        analysis = analyzer.analyze_network(network)

        vulnerabilities = analysis.get('vulnerabilities', [])
        print(f"Vulnerabilidades encontradas: {len(vulnerabilities)}")

        if vulnerabilities:
            for vuln in vulnerabilities:
                severity_icon = {
                    'critical': '🔴',
                    'high': '🟠',
                    'medium': '🟡',
                    'low': '🟢'
                }.get(vuln['severity'], '❓')

                print(f"\n{severity_icon} {vuln['title']}")
                print(f"   Descripción: {vuln['description']}")
        else:
            print("✅ No se detectaron vulnerabilidades")


def example_report_generation():
    """Ejemplo: Generación de reportes"""
    print("\n" + "="*80)
    print("EJEMPLO 3: Generación de Reportes")
    print("="*80)

    analyzer = VulnerabilityAnalyzer()
    generator = ReportGenerator()

    network = {
        'ssid': 'Mi Red Principal',
        'security': 'WPA2',
        'signal_strength': -55,
        'channel': 6,
        'frequency': '2.4GHz',
    }

    devices = [
        {
            'ip': '192.168.1.2',
            'mac': '00:1A:2B:3C:4D:5E',
            'type': 'iPhone',
            'hostname': 'iphone-usuario',
            'is_suspicious': False
        },
        {
            'ip': '192.168.1.3',
            'mac': '00:50:F2:AB:CD:EF',
            'type': 'Laptop Windows',
            'hostname': 'laptop-casa',
            'is_suspicious': False
        },
        {
            'ip': '192.168.1.4',
            'mac': 'AA:BB:CC:DD:EE:FF',
            'type': 'Desconocido',
            'hostname': 'unknown',
            'is_suspicious': True
        }
    ]

    # Realiza análisis
    analysis = analyzer.analyze_network(network, 'miPassword123')

    # Genera reporte
    report = generator.generate_report(analysis, devices)
    print(report)

    # Ejemplo de exportación JSON
    print("\n" + "="*80)
    print("EXPORTACIÓN JSON (primeras líneas):")
    print("="*80)
    json_report = generator.export_json(analysis, devices)
    print(json_report[:500] + "...\n")


def example_password_strength_evaluation():
    """Ejemplo: Evaluación de fortaleza de contraseña"""
    print("\n" + "="*80)
    print("EJEMPLO 4: Escala de Fortaleza de Contraseña")
    print("="*80)

    analyzer = PasswordAnalyzer()

    print("""
ESCALA DE FORTALEZA (0-100 puntos):

0-20   🔴 Muy Débil     ⛔ No usar bajo ninguna circunstancia
       Ejemplos: "123456", "password", "admin"

21-40  🟠 Débil         ⚠️  Cambiar urgentemente
       Ejemplos: "abc123456", "password123"

41-60  🟡 Moderada      🟡 Usar con precaución
       Ejemplos: "MyPass123", "Winter2024!"

61-80  🟢 Fuerte        ✅ Buena opción
       Ejemplos: "K9mL2x!qW7vN3s", "P@ssw0rd#2024!"

81-100 🟢 Muy Fuerte    ✅ Excelente, máxima seguridad
       Ejemplos: "K9@mL2xP!qW7vN#sR4bT8y", "X2$vN1mK&qL3@pQ4!"
    """)

    # Demonstración con entropia
    print("\nFACTORES DE PUNTUACIÓN:")
    print("  • Longitud: Máximo 30 puntos")
    print("  • Letras minúsculas: 10 puntos")
    print("  • Letras mayúsculas: 15 puntos")
    print("  • Números: 15 puntos")
    print("  • Símbolos especiales: 20 puntos")
    print("  • Penalización por patrones débiles: -20 puntos")
    print("  • Bonificación por muy larga (20+ chars): +10 puntos")


def example_signal_analysis():
    """Ejemplo: Análisis de señal Wi-Fi"""
    print("\n" + "="*80)
    print("EJEMPLO 5: Clasificación de Señal Wi-Fi")
    print("="*80)

    print("""
INTENSIDAD DE SEÑAL (en dBm):

  -30 a -50 dBm: 🟢 EXCELENTE
    • Velocidad máxima
    • Conexión muy estable
    • Ideal para streaming 4K

  -50 a -60 dBm: 🟢 MUY BUENA
    • Buena velocidad
    • Conexión estable
    • Ideal para video HD

  -60 a -70 dBm: 🟡 BUENA
    • Velocidad aceptable
    • Algunos picos de latencia
    • Ok para browsing y email

  -70 a -80 dBm: 🟡 ACEPTABLE
    • Velocidad lenta
    • Conexión inestable
    • Posibles desconexiones

  < -80 dBm: 🔴 DÉBIL
    • Muy lenta
    • Muy inestable
    • Desconexiones frecuentes
    • Considerar mover el router

RECOMENDACIONES:
  1. Mantén el router en lugar elevado y central
  2. Evita obstáculos grandes (paredes, metal)
  3. Usa canales no saturados (1, 6, 11 para 2.4GHz)
  4. Considera usar 5GHz (menos interferencias)
  5. Coloca antenas perpendiculares entre sí
    """)


def example_channel_recommendations():
    """Ejemplo: Recomendaciones de canales"""
    print("\n" + "="*80)
    print("EJEMPLO 6: Canales Wi-Fi Recomendados")
    print("="*80)

    print("""
BANDA 2.4GHz (más alcance, más interferencias):

  Canales recomendados (sin solapamiento):
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ Canal 1 │  │ Canal 6 │  │Canal 11 │
  └─────────┘  └─────────┘  └─────────┘

  • Usa UNO de estos tres canales
  • Evita canales intermedios (2,3,4,5,7,8,9,10)
  • Verifica canales menos saturados con apps de análisis

BANDA 5GHz (menos alcance, menos interferencias):

  Canales recomendados (depende de región):
  • América: 36-48, 149-165
  • Europa: 36-48, 52-144
  • Japón: 36-48, 52-144
  • China: 36-48, 149-165

  • Más canales disponibles = menos congestión
  • Mejor para velocidad y estabilidad
  • Menor penetración de paredes

RECOMENDACIÓN:
  Usa 5GHz si tus dispositivos lo soportan
  Mantén 2.4GHz para dispositivos antiguos
    """)


def main():
    """Ejecuta todos los ejemplos"""
    print("""
╔════════════════════════════════════════════════════════════════╗
║   WiFi Security Analyzer - Ejemplos de Uso                    ║
║   Demuestra todas las funcionalidades principales             ║
╚════════════════════════════════════════════════════════════════╝
    """)

    try:
        example_password_analysis()
        example_vulnerability_analysis()
        example_report_generation()
        example_password_strength_evaluation()
        example_signal_analysis()
        example_channel_recommendations()

        print("\n" + "="*80)
        print("✅ TODOS LOS EJEMPLOS COMPLETADOS")
        print("="*80)
        print("""
PRÓXIMOS PASOS:

1. Ejecuta el analizador real:
   python wifi_analyzer.py scan
   python wifi_analyzer.py full

2. Lee la documentación:
   cat README.md

3. Interpreta los resultados y mejora tu seguridad:
   • Cambia a WPA2/WPA3
   • Usa contraseña fuerte
   • Desactiva WPS
   • Actualiza el firmware

¡Mejora tu seguridad Wi-Fi hoy mismo!
        """)

    except Exception as e:
        print(f"\n❌ Error en los ejemplos: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()
