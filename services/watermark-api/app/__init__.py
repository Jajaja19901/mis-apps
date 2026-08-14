"""Watermark API — backend del Gestor de Marcas de Agua IA.

Servicio FastAPI que detecta y elimina marcas de agua de IA:
- Marcas OCULTAS (metadatos/procedencia): C2PA, EXIF, XMP, IPTC, chunks PNG, firmas de IA.
- Marcas VISIBLES (sellos de generador): vía remove-ai-watermarks (opencv, CPU).
- Marcas INVISIBLES (SynthID): vía remove-ai-watermarks[diffusion] (requiere GPU/CUDA).

El motor real es `wiltodelta/remove-ai-watermarks` (Apache-2.0). Si no está instalado,
un motor nativo ligero cubre la detección y el borrado de metadatos en CPU.
"""
__version__ = "0.1.0"
