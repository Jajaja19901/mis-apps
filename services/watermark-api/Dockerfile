# Imagen CPU del servicio (identify + metadata + visible). Para SynthID/invisible usa una
# imagen con CUDA y añade el extra [diffusion].
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv

# ffmpeg lo usa remove-ai-watermarks para el borrado de metadatos de vídeo (opcional).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-engine.txt ./
RUN pip install -r requirements.txt && pip install -r requirements-engine.txt

COPY app ./app
COPY tools ./tools

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
