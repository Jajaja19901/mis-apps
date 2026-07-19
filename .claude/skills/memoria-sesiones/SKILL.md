---
name: memoria-sesiones
description: Memoria compartida entre conversaciones de este repositorio. Úsala SIEMPRE al empezar a trabajar (lee docs/MEMORIA.md para saber qué se hizo en sesiones anteriores) y antes de terminar cualquier trabajo importante (apunta lo hecho). También cuando el usuario pregunte "¿qué hicimos?", "¿en qué quedamos?", "¿cómo va X?" o mencione otra conversación.
---

# Memoria entre sesiones

Cada conversación de Claude empieza de cero: no ve las demás conversaciones. Este
repositorio resuelve eso con un cuaderno de bitácora compartido: `docs/MEMORIA.md`.

## Al EMPEZAR una sesión de trabajo

1. Lee `docs/MEMORIA.md` (las últimas ~10 entradas bastan; están las más nuevas arriba).
2. Si el usuario pregunta por algo de "otra conversación", búscalo ahí y también en
   `git log --oneline -30` (los commits cuentan la historia del repo).
3. Si aun así no está, dilo honestamente y pide el dato mínimo para continuar.

## Al TERMINAR un trabajo importante

Añade una entrada ARRIBA del todo de `docs/MEMORIA.md` con este formato:

```
## 2026-07-18 — [título corto]
- Qué se hizo: ...
- Archivos tocados: ...
- Pendiente / siguiente paso: ...
- Datos a confirmar con el cliente: ...
```

Reglas:
- Entradas cortas (máx. 6 líneas). Es un índice, no un diario.
- SIEMPRE en la misma sesión en la que se hace el trabajo, junto al commit.
- Nunca borres entradas antiguas; solo añade arriba.
- Sin datos sensibles (contraseñas, teléfonos de clientes) — para eso está cada app.

## Qué NO es esta memoria

- No da acceso a las conversaciones de claude.ai en sí (eso se activa en claude.ai →
  Ajustes → llamada "Memoria" / "Buscar chats anteriores").
- No sustituye a los commits: el commit dice QUÉ cambió; la memoria dice POR QUÉ y
  qué falta.
