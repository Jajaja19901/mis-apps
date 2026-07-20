# 📱 Guía paso a paso desde el móvil (Samsung Galaxy S22)

App de **lectura de labios** (Visual Speech Recognition): transcribe un vídeo **sin usar el audio**.
Todo corre en **Google Colab con GPU gratis**; tú solo pulsas.

## 1) Abrir el notebook en Colab
1. Sube `lectura_labios_vsr.ipynb` a tu Google Drive (o ábrelo desde GitHub en Colab).
2. Ábrelo con **Google Colab** (app o navegador).

## 2) Activar la GPU T4 (gratis)
- Menú **⋮ → Entorno de ejecución → Cambiar tipo de entorno de ejecución**.
- En "Acelerador por hardware" elige **GPU (T4)** → **Guardar**.

## 3) Ejecutar por fases (de arriba abajo)
Pulsa el ▶️ de cada celda **en orden** y espera a que termine antes de la siguiente.
El notebook está dividido en **fases**, cada una con una celda **✅ VERIFICACIÓN**:

| Fase | Qué hace | Qué verificas |
|---|---|---|
| **1** | Instala todo + carga el modelo español | Se imprime PyTorch/GPU y "Modelo ESPAÑOL cargado" |
| **2** | Recorta los labios de tu vídeo | Ves 5 fotogramas con la **boca centrada** |
| **3** | Transcribe 1 vídeo ES y 1 EN | Compara texto real vs obtenido y % de acierto |
| **4** | Web Gradio con enlace público | Aparece un enlace `https://....gradio.live` |
| **5** | Añade francés, portugués y mandarín | Pruebas un vídeo por idioma |

> Si una verificación falla, **para ahí** y no sigas: casi siempre es el vídeo (perfil / poca luz)
> o una descarga de pesos que no cuadró (lo dice la propia celda).

## 4) Vídeos de prueba: ya vienen incluidos (casi todos)
- El notebook **crea solo** dos vídeos de prueba desde los GIFs de demo del propio repo:
  `/content/test_en.mp4` (inglés) y `/content/test_fr.mp4` (francés), **con el texto real conocido**
  → inglés y francés se verifican sin que grabes nada.
- Para **español** (y portugués/mandarín) sí necesitas un vídeo tuyo: panel 📁 → **Subir**, y pon la
  ruta (ej. `/content/mi_video_es.mp4`) en la celda de la Fase 3b.
- Vídeo ideal: **cara de frente, buena luz, 2–4 segundos**, un solo hablante.

## 5) Usar la app desde el navegador del móvil
- Cuando ejecutes la **Fase 4**, copia el enlace `gradio.live` que aparece.
- Ábrelo en Chrome del móvil → sube un vídeo → elige idioma → **Transcribir**.
- Verás el **recorte de labios** (para saber si detectó bien la boca) y la **transcripción**.

## ⚠️ Qué esperar (sé realista)
- Es una **demo del estado del arte público**, no un transcriptor fiable.
- **Inglés** es el mejor (~20% de error). **Español falla casi la mitad** de las palabras.
- **Italiano no está**: este modelo no tiene pesos públicos de italiano.
- **No funciona** con: caras de perfil, mala luz, varios hablantes, boca tapada.

## 🔁 Notas
- Colab se desconecta tras un rato de inactividad: si pasa, vuelve a ejecutar desde la Fase 1.
- Los pesos de cada idioma se descargan **la primera vez** que lo usas (fr/pt/zh tardan al estrenarse).
