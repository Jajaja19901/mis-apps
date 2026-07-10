"""
Configuración y constantes del analizador de seguridad Wi-Fi
"""

SECURITY_LEVELS = {
    'low': '🟢 BAJO',
    'medium': '🟡 MEDIO',
    'high': '🔴 ALTO',
    'critical': '🔴 CRÍTICO'
}

ENCRYPTION_STANDARDS = {
    'WEP': {'risk': 'critical', 'description': 'Cifrado obsoleto y débil'},
    'WPA': {'risk': 'high', 'description': 'Cifrado débil, vulnerable a ataques'},
    'WPA2': {'risk': 'low', 'description': 'Cifrado seguro (mínimo recomendado)'},
    'WPA3': {'risk': 'low', 'description': 'Cifrado más moderno y seguro'},
    'Open': {'risk': 'critical', 'description': 'Sin cifrado, acceso público'},
    'Unknown': {'risk': 'medium', 'description': 'Tipo de cifrado desconocido'}
}

PASSWORD_STRENGTH = {
    'very_weak': {'score': 1, 'description': 'Muy débil', 'risk': 'critical'},
    'weak': {'score': 2, 'description': 'Débil', 'risk': 'high'},
    'moderate': {'score': 3, 'description': 'Moderada', 'risk': 'medium'},
    'strong': {'score': 4, 'description': 'Fuerte', 'risk': 'low'},
    'very_strong': {'score': 5, 'description': 'Muy fuerte', 'risk': 'low'}
}

RECOMMENDATIONS = {
    'weak_encryption': [
        '1. Accede a la configuración del router (generalmente 192.168.1.1)',
        '2. Busca la sección de "Seguridad" o "Wireless Security"',
        '3. Cambia el tipo de cifrado a WPA2 o WPA3',
        '4. Guarda los cambios y reinicia el router'
    ],
    'wps_enabled': [
        '1. Accede a la configuración del router',
        '2. Busca "WPS" (Wi-Fi Protected Setup)',
        '3. Desactívalo completamente',
        '4. Guarda los cambios'
    ],
    'weak_password': [
        '1. Crea una contraseña con:',
        '   - Mínimo 16 caracteres',
        '   - Mayúsculas, minúsculas, números y símbolos',
        '   - Evita palabras del diccionario',
        '2. Accede a la configuración del router',
        '3. Cambia la contraseña Wi-Fi',
        '4. Conéctate con la nueva contraseña'
    ],
    'channel_interference': [
        '1. Descarga una app de análisis de canales Wi-Fi',
        '2. Identifica los canales menos saturados',
        '3. En la configuración del router, cambia a un canal libre',
        '4. Para 5GHz, prueba canales como 36, 40, 44, 48',
        '5. Para 2.4GHz, prueba 1, 6 o 11'
    ],
    'outdated_firmware': [
        '1. Anota la marca y modelo del router',
        '2. Visita el sitio web del fabricante',
        '3. Descarga la última versión del firmware',
        '4. En la configuración del router, busca "System" o "Firmware"',
        '5. Sigue las instrucciones para actualizar'
    ],
    'open_network': [
        '1. Accede a la configuración del router',
        '2. Busca "SSID Broadcast" o "Network Name"',
        '3. Establece un nombre claro (sin datos sensibles)',
        '4. Activa "SSID Broadcast" para que sea visible',
        '5. Configura una contraseña fuerte'
    ]
}

MIN_PASSWORD_LENGTH = 12
RECOMMENDED_PASSWORD_LENGTH = 16

SIGNAL_STRENGTH = {
    'excellent': (-30, -67, '🟢 Excelente'),
    'good': (-67, -70, '🟢 Buena'),
    'fair': (-70, -80, '🟡 Aceptable'),
    'weak': (-80, -90, '🟡 Débil'),
    'very_weak': (-90, -120, '🔴 Muy débil')
}

COMMON_DEVICES = {
    'router': ['RouterOS', 'OpenWrt', 'DD-WRT', 'Firmware Router'],
    'phone': ['iPhone', 'Android', 'Samsung', 'Xiaomi', 'Huawei', 'OnePlus'],
    'laptop': ['Linux', 'Windows', 'macOS', 'Lenovo', 'Dell', 'HP'],
    'iot': ['ESP32', 'Arduino', 'Raspberry', 'Smart', 'Philips Hue', 'Alexa'],
    'other': ['Unknown', 'Device']
}
