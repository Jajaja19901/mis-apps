#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
comparar-voces — ¿Son la misma voz dos (o más) audios?

Compara la "huella de voz" (speaker embedding) de cada audio con un modelo
biométrico local (WeSpeaker ResNet34 / VoxCeleb, vía sherpa-onnx). Todo corre
en local: los audios NO se suben a ningún servicio.

Uso:
    pip3 install sherpa-onnx soundfile numpy imageio-ffmpeg   # una vez
    python3 tools/comparar-voces.py audio1.ogg audio2.mp3 [audio3 ...]

Acepta wav/mp3/ogg/opus/flac directamente; m4a y demás formatos se convierten
solos si hay ffmpeg (el paquete imageio-ffmpeg lo trae incluido). La primera
vez descarga el modelo (~26 MB) a ~/.cache/comparar-voces/.

Veredicto (similitud coseno, calibrado en este repo con voces Piper es-ES;
misma voz con textos distintos dio 0.94–0.95, voces distintas 0.43–0.51
incluso pronunciando la misma frase):
    ≥ 0.60          ✅ MISMA VOZ (probable)
    0.45 – 0.60     ⚠  DUDOSO (no concluyente)
    < 0.45          ❌ VOCES DISTINTAS (probable)

OJO: es una estimación probabilística, NO una prueba pericial. Ruido, micrófonos
muy distintos, clips de <5s, afonías o voces clonadas por IA pueden alterarla.

Código de salida: 0 = análisis realizado (sea cual sea el veredicto); 2 = error.
"""

import os
import subprocess
import sys
import tempfile

MODEL_NAME = "wespeaker_en_voxceleb_resnet34.onnx"
MODEL_URLS = [
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/" + MODEL_NAME,
    "https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/main/" + MODEL_NAME,
]
CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "comparar-voces")
UMBRAL_MISMA = 0.60
UMBRAL_DUDOSO = 0.45
MAX_SEGUNDOS = 120  # con 2 minutos de voz sobra para la huella

def fallo(msg):
    print(f"❌ ERROR: {msg}", file=sys.stderr)
    sys.exit(2)

def deps():
    try:
        import numpy, sherpa_onnx, soundfile  # noqa: F401
    except ImportError as e:
        fallo(f"falta una librería ({e.name}). Instala con:\n"
              "   pip3 install sherpa-onnx soundfile numpy imageio-ffmpeg")

def modelo():
    path = os.path.join(CACHE_DIR, MODEL_NAME)
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        return path
    os.makedirs(CACHE_DIR, exist_ok=True)
    for url in MODEL_URLS:
        print(f"⬇ Descargando modelo de huella de voz (~26 MB)…")
        r = subprocess.run(["curl", "-sSL", "--fail", "-o", path + ".tmp", url])
        if r.returncode == 0 and os.path.getsize(path + ".tmp") > 1_000_000:
            os.replace(path + ".tmp", path)
            return path
    fallo("no se pudo descargar el modelo (¿sin red?). Descárgalo a mano a:\n"
          f"   {path}\n   desde: {MODEL_URLS[0]}")

def ffmpeg_bin():
    from shutil import which
    if which("ffmpeg"):
        return "ffmpeg"
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None

def cargar_audio(path):
    """Devuelve (muestras float32 mono, sample_rate). Convierte con ffmpeg si hace falta."""
    import numpy as np
    import soundfile as sf
    if not os.path.exists(path):
        fallo(f"no existe el archivo: {path}")
    try:
        datos, sr = sf.read(path, dtype="float32", always_2d=True)
    except Exception:
        fmpg = ffmpeg_bin()
        if not fmpg:
            fallo(f"no sé leer '{path}' y no hay ffmpeg para convertirlo. "
                  "Instala: pip3 install imageio-ffmpeg (o conviértelo tú a WAV/MP3).")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            wav = tmp.name
        r = subprocess.run([fmpg, "-y", "-v", "error", "-i", path,
                            "-ac", "1", "-ar", "16000", wav])
        if r.returncode != 0:
            os.unlink(wav)
            fallo(f"ffmpeg no pudo convertir '{path}' (¿archivo corrupto?)")
        datos, sr = sf.read(wav, dtype="float32", always_2d=True)
        os.unlink(wav)
    muestras = datos.mean(axis=1)          # a mono
    muestras = muestras[: sr * MAX_SEGUNDOS]
    dur = len(muestras) / sr
    if dur < 1.0:
        fallo(f"'{path}' dura {dur:.1f}s: demasiado corto para sacar huella de voz.")
    if dur < 3.0:
        print(f"⚠ AVISO: '{os.path.basename(path)}' dura solo {dur:.1f}s; "
              "con menos de ~5s de voz la fiabilidad baja.")
    if float(np.sqrt((muestras ** 2).mean())) < 1e-4:
        print(f"⚠ AVISO: '{os.path.basename(path)}' está casi en silencio.")
    return muestras, sr

def veredicto(sim):
    if sim >= UMBRAL_MISMA:
        return "✅ MISMA VOZ (probable)"
    if sim >= UMBRAL_DUDOSO:
        return "⚠  DUDOSO (no concluyente)"
    return "❌ VOCES DISTINTAS (probable)"

def main(argv):
    if len(argv) < 2:
        print(__doc__)
        sys.exit(2)
    deps()
    import numpy as np
    import sherpa_onnx

    extractor = sherpa_onnx.SpeakerEmbeddingExtractor(
        sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=modelo(), num_threads=2)
    )

    nombres, embs = [], []
    for path in argv:
        muestras, sr = cargar_audio(path)
        stream = extractor.create_stream()
        stream.accept_waveform(sample_rate=sr, waveform=muestras)
        stream.input_finished()
        embs.append(np.array(extractor.compute(stream)))
        nombres.append(os.path.basename(path))

    print("\n— Comparación de huellas de voz —")
    for i in range(len(embs)):
        for j in range(i + 1, len(embs)):
            a, b = embs[i], embs[j]
            sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
            print(f"  {nombres[i]}  vs  {nombres[j]}")
            print(f"    similitud: {sim:.3f}  →  {veredicto(sim)}")
    print("\nNota: estimación probabilística (no vale como prueba pericial). "
          "Ruido, micros muy distintos,\nclips cortos o voces clonadas por IA "
          "pueden alterar el resultado.")
    sys.exit(0)

if __name__ == "__main__":
    main(sys.argv[1:])
