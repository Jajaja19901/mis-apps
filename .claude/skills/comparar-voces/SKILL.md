---
name: comparar-voces
description: Dice si dos (o más) audios son de la misma persona comparando su huella de voz con un modelo biométrico que corre en local. Úsala cuando el usuario pase audios y pregunte "¿es la misma voz?", "¿habla la misma persona en estos dos audios?", "compara estas voces" o similar.
---

# Comparar voces: ¿es la misma persona?

Claude no "oye" los audios directamente, pero este repo trae una herramienta que
extrae la **huella de voz** (speaker embedding) de cada audio con un modelo
biométrico local (WeSpeaker ResNet34 / VoxCeleb, vía sherpa-onnx) y las compara.
Los audios NUNCA salen de la máquina.

## Cómo usarla

```bash
pip3 install sherpa-onnx soundfile numpy imageio-ffmpeg    # una vez por sesión
python3 tools/comparar-voces.py audio1.ogg audio2.mp3      # 2 o más audios
```

- La primera vez descarga el modelo (~26 MB) a `~/.cache/comparar-voces/`.
- Formatos: wav/mp3/ogg/opus/flac directos; m4a y demás se convierten solos
  (ffmpeg viene incluido en `imageio-ffmpeg`). Las notas de voz de WhatsApp
  (.ogg/.opus) y los memos de iPhone (.m4a) valen tal cual.
- Con 3+ audios compara todos contra todos (útil para "¿cuál de estos es él?").

## De dónde salen los audios

1. Adjuntos en el chat → usar la ruta donde el harness los deje.
2. Subidos al repo (p. ej. carpeta `audios/`, mejor no commitearlos si son privados).
3. Un enlace de descarga que pase el usuario (si la red de la sesión lo permite).

## Cómo leer el resultado (similitud coseno)

| Similitud   | Veredicto                      |
|-------------|--------------------------------|
| ≥ 0.60      | ✅ MISMA VOZ (probable)        |
| 0.45 – 0.60 | ⚠ DUDOSO (no concluyente)      |
| < 0.45      | ❌ VOCES DISTINTAS (probable)  |

Calibrado en este repo con dos voces Piper es-ES: misma voz con textos distintos
dio 0.94–0.95; voces distintas dieron 0.43–0.51 **incluso diciendo la misma
frase** (compara la voz, no el contenido).

## Reglas de honestidad (obligatorias al responder)

- Da SIEMPRE el número + el veredicto, y di que es **probabilístico**: no es una
  prueba pericial ni vale como prueba legal.
- Avisa de lo que baja la fiabilidad: clips de <5s, mucho ruido, micrófonos muy
  distintos, afonía/resfriado, y voces clonadas por IA (pueden engañar al modelo).
- En zona ⚠ DUDOSO, dilo tal cual y pide audios más largos o más limpios.
- Esta herramienta NO transcribe ni identifica QUIÉN es la persona; solo dice si
  dos muestras se parecen entre sí.
