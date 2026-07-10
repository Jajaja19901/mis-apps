"""
Análisis de fortaleza de contraseña basado en complejidad y longitud
"""

import re
from typing import Dict, Tuple
from config import PASSWORD_STRENGTH, MIN_PASSWORD_LENGTH, RECOMMENDED_PASSWORD_LENGTH


class PasswordAnalyzer:
    def __init__(self):
        self.min_length = MIN_PASSWORD_LENGTH
        self.recommended_length = RECOMMENDED_PASSWORD_LENGTH

    def analyze(self, password: str) -> Dict:
        """
        Analiza la fortaleza de una contraseña basándose en:
        - Longitud
        - Complejidad (mayúsculas, minúsculas, números, símbolos)
        - Patrones comunes débiles
        """
        if not password:
            return self._get_result('very_weak', 0, 'Contraseña vacía')

        score = self._calculate_score(password)
        strength = self._get_strength_level(score)
        suggestions = self._get_suggestions(password)

        return {
            'strength': strength,
            'score': score,
            'length': len(password),
            'is_weak': strength in ['very_weak', 'weak'],
            'suggestions': suggestions,
            'details': self._get_detailed_analysis(password)
        }

    def _calculate_score(self, password: str) -> float:
        """Calcula una puntuación de 0 a 100 basada en complejidad"""
        score = 0
        length = len(password)

        # Puntuación por longitud (máximo 30 puntos)
        if length < 6:
            score += 0
        elif length < 8:
            score += 10
        elif length < 12:
            score += 20
        elif length < 16:
            score += 25
        else:
            score += 30

        # Puntuación por tipos de caracteres (máximo 70 puntos)
        if re.search(r'[a-z]', password):
            score += 10  # Letras minúsculas
        if re.search(r'[A-Z]', password):
            score += 15  # Letras mayúsculas
        if re.search(r'\d', password):
            score += 15  # Números
        if re.search(r'[!@#$%^&*()_\-+=\[\]{};:\'",.<>?/\\|`~]', password):
            score += 20  # Símbolos especiales

        # Penalización por patrones débiles
        if self._has_weak_patterns(password):
            score = max(0, score - 20)

        # Bonificación por muy larga
        if length >= 20:
            score = min(100, score + 10)

        return min(100, score)

    def _has_weak_patterns(self, password: str) -> bool:
        """Detecta patrones comunes débiles"""
        weak_patterns = [
            r'(.)\1{2,}',  # Caracteres repetidos (aaa, 111)
            r'(012|123|234|345|456|567|678|789|890|abc|bcd|cde)',
            r'(qwerty|password|admin|letmein|welcome|monkey)',
        ]

        for pattern in weak_patterns:
            if re.search(pattern, password, re.IGNORECASE):
                return True
        return False

    def _get_strength_level(self, score: float) -> str:
        """Convierte la puntuación a nivel de fortaleza"""
        if score < 20:
            return 'very_weak'
        elif score < 40:
            return 'weak'
        elif score < 60:
            return 'moderate'
        elif score < 80:
            return 'strong'
        else:
            return 'very_strong'

    def _get_suggestions(self, password: str) -> list:
        """Proporciona sugerencias para mejorar la contraseña"""
        suggestions = []
        length = len(password)

        if length < self.min_length:
            suggestions.append(f'Aumenta la longitud a mínimo {self.min_length} caracteres')

        if length < self.recommended_length:
            suggestions.append(f'Se recomienda al menos {self.recommended_length} caracteres')

        if not re.search(r'[a-z]', password):
            suggestions.append('Añade letras minúsculas (a-z)')

        if not re.search(r'[A-Z]', password):
            suggestions.append('Añade letras mayúsculas (A-Z)')

        if not re.search(r'\d', password):
            suggestions.append('Añade números (0-9)')

        if not re.search(r'[!@#$%^&*()_\-+=\[\]{};:\'",.<>?/\\|`~]', password):
            suggestions.append('Añade símbolos especiales (!@#$%^&*)')

        if self._has_weak_patterns(password):
            suggestions.append('Evita secuencias obvias (123, abc) o palabras comunes')

        return suggestions

    def _get_detailed_analysis(self, password: str) -> Dict:
        """Análisis detallado de características del password"""
        return {
            'has_lowercase': bool(re.search(r'[a-z]', password)),
            'has_uppercase': bool(re.search(r'[A-Z]', password)),
            'has_digits': bool(re.search(r'\d', password)),
            'has_special': bool(re.search(r'[!@#$%^&*()_\-+=\[\]{};:\'",.<>?/\\|`~]', password)),
            'has_spaces': ' ' in password,
            'entropy_bits': self._calculate_entropy(password)
        }

    def _calculate_entropy(self, password: str) -> float:
        """Estima los bits de entropía de la contraseña"""
        charset_size = 0

        if re.search(r'[a-z]', password):
            charset_size += 26
        if re.search(r'[A-Z]', password):
            charset_size += 26
        if re.search(r'\d', password):
            charset_size += 10
        if re.search(r'[!@#$%^&*()_\-+=\[\]{};:\'",.<>?/\\|`~]', password):
            charset_size += 32

        import math
        if charset_size == 0:
            return 0

        entropy = len(password) * math.log2(charset_size)
        return round(entropy, 2)

    def _get_result(self, strength: str, score: float, note: str) -> Dict:
        """Genera un diccionario de resultado estándar"""
        return {
            'strength': strength,
            'score': score,
            'note': note,
            'is_weak': strength in ['very_weak', 'weak'],
            'suggestions': [],
            'details': {}
        }

    def generate_strong_password(self, length: int = 16) -> str:
        """Genera una sugerencia de contraseña fuerte"""
        import random
        import string

        lowercase = string.ascii_lowercase
        uppercase = string.ascii_uppercase
        digits = string.digits
        special = '!@#$%^&*_-+=[]{}()'

        password = [
            random.choice(lowercase),
            random.choice(uppercase),
            random.choice(digits),
            random.choice(special)
        ]

        all_chars = lowercase + uppercase + digits + special
        password += [random.choice(all_chars) for _ in range(length - 4)]

        random.shuffle(password)
        return ''.join(password)
