# Plugins de Fragua

Un plugin es una carpeta dentro del directorio `plugins/` de los datos de la app
(en Linux `~/.config/Fragua/plugins/`; el panel de Plugins muestra la ruta exacta):

```
plugins/
└── mi-plugin/
    ├── plugin.json    # manifiesto
    └── main.js        # módulo CommonJS
```

## Manifiesto (`plugin.json`)

```json
{
  "id": "mi-plugin",
  "name": "Mi plugin",
  "version": "1.0.0",
  "description": "Qué hace",
  "main": "main.js",
  "contributes": {
    "commands": [{ "id": "hacer-algo", "title": "Hacer algo" }]
  }
}
```

Reglas: `id` en kebab-case; `main` debe existir y ser `.js`; cada comando declarado
debe estar exportado (si no, el panel muestra el error).

## Módulo (`main.js`)

```js
'use strict';

exports.commands = {
  // cada comando recibe un contexto y devuelve texto (o una promesa de texto)
  async 'hacer-algo'(ctx) {
    // ctx.projectPath  → ruta absoluta del proyecto activo (o null)
    // ctx.arg          → argumento que el usuario tecleó al ejecutarlo
    // ctx.listFiles()  → rutas relativas de los ficheros del proyecto
    // ctx.readFile(rel)          → contenido de un fichero del proyecto
    // ctx.writeFile(rel, texto)  → escribe (con versión previa en el historial)
    // ctx.chat(prompt)           → pregunta al modelo local activo
    const ficheros = ctx.listFiles();
    const resumen = await ctx.chat(`Resume este proyecto: ${ficheros.slice(0, 50).join(', ')}`);
    return `El proyecto tiene ${ficheros.length} ficheros.\n\n${resumen}`;
  }
};
```

La salida se muestra en un modal. Los errores se capturan por llamada: un plugin
roto no afecta al resto de la aplicación.

## Ciclo de vida

- **Cargar/recargar**: botón ↻ del panel (recarga en caliente, sin reiniciar).
- **Activar/desactivar**: persistente; un plugin desactivado no se ejecuta ni carga.
- **Ejemplo incluido**: en la primera ejecución se instala `contador-lineas`
  (cuenta líneas por extensión), útil como plantilla de partida.

## Modelo de seguridad (léelo)

Los plugins son **código local que tú instalas** y se ejecutan en el proceso principal
con los mismos privilegios que la aplicación —igual que las extensiones de VS Code—.
El contexto (`ctx`) acota las operaciones cómodas al proyecto activo, y las escrituras
pasan por el anti-traversal y el historial de versiones, pero **no es un sandbox**:
instala solo plugins cuyo código hayas revisado o cuya fuente sea de confianza.
