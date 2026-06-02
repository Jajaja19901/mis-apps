# 🌉 Puente de automatización — de 50 prompts a 50 apps

Este es el "puente" que coge los prompts que genera tu web y crea las apps **solas**,
una tras otra, usando la fábrica de 10 agentes de este repositorio.

## Lo que necesitas (una sola vez)
Esto se ejecuta en un **ordenador** (o servidor), no en el móvil, porque hay que correr un programa:

1. Instalar Claude Code:
   ```
   npm install -g @anthropic-ai/claude-code
   ```
2. Iniciar sesión (gratis con tu plan) ejecutando `claude` y siguiendo los pasos.
   - O, si lo quieres totalmente desatendido en un servidor, usar una **API key de pago**:
     ```
     export ANTHROPIC_API_KEY=sk-ant-...
     ```

## Cómo se usa (cada vez)
1. Tu web genera los prompts. **Guarda cada prompt como un archivo `.txt`** dentro de
   `automatizar/prompts/`. Un archivo = una app. (Mira `_ejemplo.txt` para el formato.)
2. Ejecuta el puente:
   ```
   bash automatizar/crear-todas.sh
   ```
3. El programa recorre todos los prompts y, por cada uno, lanza los 10 agentes
   (comando `/crear-app`) que construyen la app.
4. Las apps terminadas aparecen en `apps/`. Cada prompt ya hecho se mueve a `automatizar/hechos/`.
5. Para subirlas a GitHub: `git push`.

## ¿Y enlazarlo con mi web HTML?
Tu web (en el navegador) **no puede crear las apps sola** por seguridad, pero sí puede
**generar y descargar los prompts**. El flujo recomendado es:
- Tu web genera los 50 prompts y te los descarga (o los copias) como archivos `.txt`.
- Los sueltas en `automatizar/prompts/`.
- Ejecutas `bash automatizar/crear-todas.sh` una vez y se crean las 50 apps.

> Si más adelante quieres que sea **100% sin tocar nada** (que tu web mande los prompts y
> las apps se creen solas en un servidor), eso se monta con la API de pago + un pequeño
> servidor. Pídemelo y te lo preparo.
