---
title: Vigia Cerebro
emoji: 🖥️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# VIGÍA · servidor-cerebro (Hugging Face Space)

Servidor de detección para la app VIGÍA. El móvil manda un fotograma y este
servidor devuelve las cajas (personas, coches, objetos…). Se monta una vez y
queda encendido solo, con una dirección fija.

- Endpoint: `POST /detectar`  con  `{ "imagen": "data:image/jpeg;base64,…" }`
- Responde: `{ "detecciones": [ {clase, score, x, y, an, al}, … ] }` (cajas 0-1)

En la app: Ajustes → Motor → 🖥️ Servidor en la nube → pega
`https://TU-USUARIO-vigia-cerebro.hf.space/detectar`
