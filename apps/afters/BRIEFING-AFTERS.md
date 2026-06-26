# 🌙 BRIEFING COMPLETO — AFTERS (para empezar conversación nueva)

> Copia TODO este texto y pégaselo a Claude en un chat nuevo. Contiene TODOS
> los datos técnicos reales para que no empiece a ciegas.

═══════════════════════════════════════════════════════
## 1. QUIÉN SOY Y CÓMO TRATARME
═══════════════════════════════════════════════════════

Soy Jaime, de Arucas (Gran Canaria). Programo SOLO desde el móvil (Samsung S22), sin ordenador. Escribo por voz a texto → hay erratas, interprétalas ("Netflix"=Netlify, "cloud/cloudfier"=Cloudflare, "fire base"=Firebase).

MIS REGLAS (de mi CLAUDE.md) — IMPORTANTÍSIMO:
- HONESTIDAD BRUTAL. Nunca "está perfecto" / "todo funciona" / "100%" sin comprobarlo de verdad.
- Al decir "verificado", di QUÉ probaste y QUÉ NO pudiste probar.
- Tus tests NO ven bugs visuales (botones tapados, que faltan, pantallas superpuestas) ni cosas que solo se ven con 2 móviles reales. Avísame ANTES.
- No me hagas mil preguntas en círculo. Si lo puedes mirar en el código, míralo tú.
- Antes de "no se pierde nada" o "arreglado", traza los efectos.
- Plan antes de tocar código. Cambios mínimos. Si algo se desvía, para.
- Archivos para descargar: dámelos en .json o .zip (.txt me falla en el móvil).
- localStorage siempre (nunca window.storage). Nunca AbortSignal (usa Promise.race). Fallbacks legacy para clipboard/geo/notificaciones.

Contexto: la sesión pasada me pasé un día oyendo "no hay fallos" y encontré 10 bugs yo solo a ojo. Prefiero cien "esto no lo garantizo" antes que un "perfecto" mentira.

═══════════════════════════════════════════════════════
## 2. QUÉ ES AFTERS (la idea)
═══════════════════════════════════════════════════════

PWA de UN solo archivo HTML (~600KB) para grupos cerrados (amigos/parejas/familias) de fiesta o de noche. Para no perder a tu gente y comunicaros rápido.

Funciones: mapa GPS en vivo del grupo (Leaflet) · anécdotas anónimas · chat de grupo · chat privado cifrado E2E (CryptoJS AES) · foto efímera (se borra al abrirla) · SOS · radar de la manada (avisa si alguien se aleja) · recorrido/rastro de cada uno · puntos de quedada · La Ola (vibración en cadena) · Reagrupar · timer compartido · walkie-talkie · emotes y frases sobre el avatar · modo discreto · volver a casa · coche aparcado · notificaciones push.

Visual: oscuro electro-party, magenta #ff0080 sobre negro #0a0a0f. Fuentes Bebas Neue, Space Mono, DM Sans.

═══════════════════════════════════════════════════════
## 3. DATOS TÉCNICOS REALES (TODO lo que necesitas)
═══════════════════════════════════════════════════════

ARCHIVOS (5, para desplegar): index.html · sw.js · manifest.json · icon-192.png · icon-512.png

--- FIREBASE (proyecto afters-52efb) — FUNCIONA, NO TOCAR ---
- apiKey: AIzaSyDpbYPR-gwEhCt_6h-hJ-rUjtUO1oX_uXQ
- authDomain: afters-52efb.firebaseapp.com
- databaseURL: https://afters-52efb-default-rtdb.europe-west1.firebasedatabase.app
- projectId: afters-52efb
- storageBucket: afters-52efb.firebasestorage.app
- messagingSenderId: 113781443463
- appId: 1:113781443463:web:a7e9a03c8e752b118aa122
- Login anónimo de Firebase Auth. Las reglas de la Realtime Database están publicadas y funcionan.
- Estructura de un grupo en la BD: grupos/{CODIGO}/ con: meta/admin_uid, miembros/, solicitudes/, anecdotas/, ubicaciones/, rastros/, chatsPrivados/, puntosQuedada/, pushSubs/, alejados/, reagrupar/, ola/, timer/, frases/, etc.

--- CLOUDFLARE WORKER (notificaciones push) — DESPLEGADO, NO TOCAR ---
- URL del Worker: https://aged-bar-11be.incubatunegociowebapps.workers.dev/push
- Mi subdominio Cloudflare: incubatunegociowebapps
- Auth del Worker: OAuth2 con cuenta de servicio (JWT RS256). Las 4 variables están configuradas en Cloudflare: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, FIREBASE_URL, FIREBASE_SERVICE_ACCOUNT (el JSON completo de cuenta de servicio).
- VAPID pública (en la app): BIAANtHrNtiGXCR1_s9NUK7BgDhaZ-9tKIQ4kGbXhO90MHGvWzuCQcL2ro2ClUkfFcXPt_COGrgP2aTpJ3g2vq4
- (La VAPID privada y el JSON de cuenta de servicio están guardados en Cloudflare, no en la app.)

--- NETLIFY (donde está la web) ---
- Web actual: https://afters-gps-social.netlify.app
- Versión ONLINE: v90 (vieja, con bugs)
- PROBLEMA: sin créditos este mes. Cada deploy de producción = 15 créditos, de 300/mes = 20 subidas. Gastadas.

--- MI GRUPO REAL ---
- Código: AFT-C6S (enlace: https://afters-gps-social.netlify.app/?g=AFT-C6S)
- TIENE GENTE dentro. NO borrar nada.

═══════════════════════════════════════════════════════
## 4. EL PROBLEMA Nº1 — RESOLVER ANTES QUE NADA
═══════════════════════════════════════════════════════

No puedo ver los arreglos porque NO PUEDO SUBIR LA APP.
- Online tengo la v90. Hay una v91 con 10 arreglos, sin subir (está en el ZIP que tengo).
- No puedo subir a Netlify: sin créditos este mes.
- La app de Claude (móvil) no me deja descargar archivos (sale "descargando" y no baja).
- claude.ai en el navegador no me carga.

→ LO PRIMERO: cómo subo la v91. Opción recomendada:

CLOUDFLARE PAGES (gratis, subidas ILIMITADAS, y YA tengo cuenta Cloudflare):
1. Entrar en dash.cloudflare.com → Workers & Pages → Create → Pages → "Upload assets" (subir archivos directos, sin Git).
2. Subir los 5 archivos de la v91 (o el ZIP descomprimido).
3. Cloudflare da un enlace tipo https://afters-xxx.pages.dev → ahí pruebo TODOS los arreglos gratis, sin gastar créditos.
4. Si va bien, me quedo en Cloudflare Pages y me olvido del límite de Netlify.
IMPORTANTE para el asistente: guíame paso a paso con capturas, porque voy desde el móvil. No des por hecho que sé hacerlo.

Mientras esto no se resuelva, da igual lo que se arregle: sigo viendo la v90 con bugs.

═══════════════════════════════════════════════════════
## 5. LOS 10 FALLOS ARREGLADOS EN LA v91 (pendientes de que YO los pruebe)
═══════════════════════════════════════════════════════

Todos los encontré yo a ojo tras oír "está todo bien":

1. "Esperando aprobación" al crear mi propio grupo → el creador entraba pidiendo permiso. ARREGLADO.
2. Botón "+ CREAR" de puntos de quedada → había DESAPARECIDO en un cambio. DEVUELTO.
3. Menú de Acciones → el último item ("Hueco en el coche") quedaba tapado por la barra de abajo. ARREGLADO.
4. Popup de la persona en el mapa → se bajaba solo y tapaba la pantalla. ARREGLADO (autoPan off).
5. Botón del Radar → lo activabas y se quedaba en "DESACTIVADO". ARREGLADO (ahora refresca).
6. Foto efímera del chat privado → llegaba CIFRADA y el amigo no la abría. ARREGLADO (ahora se descifra al abrir).
7. NAVEGAR hacia un amigo (brújula) → no hacía nada. ARREGLADO (busca por apodo o uid, no muere si falta mi ubicación).
8. Recorrido/rastro → tenía los puntos pero NO dibujaba la línea (un render() la borraba justo después). ARREGLADO. Además ya no se pierde al dejar de compartir ubicación (se guarda por uid).
9. Trabado por pantallas superpuestas → abrir ajustes y luego el tablón sin cerrar = trabado. ARREGLADO (cerrarModalesSueltos al navegar).
10. Botón SOS → solo salía si authView era exactamente 'ok', tras crear grupo NO SALÍA. ARREGLADO (sale siempre dentro del grupo). Y notificaciones push → la condición de enviar estaba AL REVÉS (nunca enviaba) + URL duplicada (/push/push). ARREGLADO.

HONESTIDAD: los fallos 5, 6, 7, 8 y las push solo se confirman del todo con 2 móviles reales en la calle. Arreglados en código y probados en lo simulable, pero la prueba final la hago YO. Las push además solo llegan con el móvil bloqueado o en otra app (no si tienes AFTERS abierto a la vista).

═══════════════════════════════════════════════════════
## 6. QUÉ QUIERO HACER (en orden)
═══════════════════════════════════════════════════════

1. Resolver cómo subir la v91 (punto 4). Probablemente Cloudflare Pages. SIN ESTO NO AVANZO.
2. Subir la v91 y probar cada uno de los 10 fallos a ojo, con calma.
3. Lo que siga roto: arreglarlo de uno en uno, probándolo de verdad, sin decir "perfecto".
4. Recuperar mi rol de admin en AFT-C6S: al limpiar datos del navegador, mi uid anónimo de Firebase cambió y se rompió el vínculo admin↔grupo (ahora entro a mi propio grupo como si pidiera acceso). Solución: poner mi uid NUEVO como admin_uid en Firebase → consola firebase.google.com → proyecto afters-52efb → Realtime Database → grupos/AFT-C6S/meta/admin_uid → cambiar por mi uid nuevo. NO tocar miembros/, anecdotas/, ni nada más. (Para conseguir mi uid nuevo: enviar solicitud desde la pantalla "solicitar acceso" y mirar en grupos/AFT-C6S/solicitudes/.)

═══════════════════════════════════════════════════════
## 7. RESUMEN DE LA SESIÓN ANTERIOR
═══════════════════════════════════════════════════════

Sesión larga y dura. Empezó desplegando la app (Firebase + Cloudflare Worker + Netlify, todo quedó funcionando). Luego horas encontrando bugs que se decían arreglados y no lo estaban. Se gastaron los créditos de Netlify subiendo versiones a medias. Acabé sin créditos y sin poder ver los arreglos. Se arreglaron 10 bugs reales pero ninguno probado por no poder subir. Lecciones grabadas en mi CLAUDE.md: no decir "perfecto" sin pruebas reales; avisar de lo que solo se prueba con 2 móviles; avisar del coste de recursos (créditos) ANTES de gastarlos; trazar efectos secundarios antes de decir "no pierdes nada" (ej: limpiar datos del navegador cambia el uid de Firebase = pierdes el admin).

═══════════════════════════════════════════════════════

Trátame con honestidad total. Si algo no se puede, dilo. Si no lo sabes, dilo. Si solo se prueba con 2 móviles, dilo antes. Nada de humo.
