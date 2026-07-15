FROM python:3.11-slim

# Librerías del sistema que necesita la visión (OpenCV dentro de ultralytics).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Que ultralytics escriba SIEMPRE aquí (evita líos de permisos en el Space).
ENV HOME=/app YOLO_CONFIG_DIR=/app MPLCONFIGDIR=/app

RUN pip install --no-cache-dir ultralytics fastapi "uvicorn[standard]" pillow

# Descarga el cerebro (YOLO11n) DENTRO de la imagen: así el primer aviso no tarda.
RUN python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"

COPY app.py /app/app.py

# Hugging Face expone el puerto 7860.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
