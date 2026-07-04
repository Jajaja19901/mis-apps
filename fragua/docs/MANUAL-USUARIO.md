# Manual de usuario

## Primer arranque

1. `npm install && npm start` (o instala el paquete de `npm run dist`).
2. Conecta un modelo (ver [MODELOS-LOCALES.md](MODELOS-LOCALES.md)) o usa el Simulador.
3. Abre una carpeta con **Abrir proyecto…** (o desde el explorador, botón ＋).

## La interfaz

- **Barra de actividad** (izquierda): Explorador 🗂, Búsqueda 🔎, Conversaciones 💬,
  Plantillas 🧩, Plugins 🔌, Memoria 🧠, Configuración ⚙ y Terminal ⌨.
  Pulsar la vista activa pliega el panel lateral.
- **Centro**: pestañas + editor Monaco. `Ctrl+S` guarda (y crea versión).
  Botón **🕘 Historial** en la barra de pestañas: versiones del fichero activo,
  comparación en diff y restauración.
- **Derecha**: chat con el modelo. `Ctrl+Enter` envía; **Detener** cancela.
- **Abajo**: terminal (atajo `` Ctrl+` ``), múltiples sesiones.
- **Barra de estado**: proyecto, tamaño del índice, salud del modelo.

## Flujos principales

### Preguntar con contexto del proyecto
1. En Búsqueda, pulsa **Indexar proyecto** (una vez; luego es incremental).
2. En el chat, deja activado *Usar contexto del proyecto* y pregunta. Fragua
   recupera los fragmentos relevantes del índice y los inyecta en el prompt.
3. Con 📎 adjuntas el fichero abierto (análisis, explicación o depuración dirigida).

### Aplicar cambios que propone la IA (refactorizar, corregir, documentar)
1. Pide el cambio ("refactoriza X", "añade docstrings a Y", "corrige este error…").
2. En la respuesta pulsa **Revisar cambios propuestos**: verás cada operación con su
   diff. **Aplicar todo** ejecuta el plan; cada fichero tocado guarda versión previa.
3. ¿Algo salió mal? **🕘 Historial → Restaurar**.

### Depurar
1. Ejecuta tu programa en el Terminal integrado.
2. Copia el error al chat (con el fichero adjunto o con contexto del proyecto activado)
   y pide diagnóstico; aplica la corrección propuesta con el revisor de cambios.

### Crear un proyecto desde cero
- **Determinista**: Plantillas → elige una → variables → carpeta destino. Se abre
  como proyecto automáticamente.
- **Con IA**: Plantillas → *Generar proyecto con IA*: describe el proyecto; el modelo
  emite todos los ficheros y los aplicas con el revisor sobre el proyecto activo.

### Buscar código
Búsqueda 🔎 → consulta + modo (léxica / semántica / híbrida). Clic en un resultado
abre el fichero en la línea exacta. La semántica requiere embeddings activados
(Configuración → Indexación) y reindexar.

### Memoria y conversaciones largas
- Memoria 🧠: guarda hechos permanentes ("usamos pnpm", "estilo funcional").
- Las conversaciones se compactan solas al crecer; también manualmente
  (Conversaciones → **Compactar**).

### Copias de seguridad / mover de máquina
Configuración → **Exportar todo…** genera un único `.fragua.json`;
**Importar…** lo restaura (las conversaciones importadas nunca sobrescriben).

## Atajos

| Atajo | Acción |
| --- | --- |
| `Ctrl+S` | Guardar fichero (con versión) |
| `Ctrl+Enter` | Enviar mensaje del chat |
| `` Ctrl+` `` | Mostrar/ocultar terminal |
| `Ctrl+Shift+E` / `Ctrl+Shift+F` | Explorador / Búsqueda |
