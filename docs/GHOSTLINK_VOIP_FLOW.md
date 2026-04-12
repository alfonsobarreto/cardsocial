# Ghost-Link VoIP + FaceCall — Flujo de llamadas

> Documento de referencia para llamadas de voz y video via Ghost-Link.
> El numero real de ambos participantes permanece 100% oculto.
> Ultima actualizacion: 12 abril 2026

---

## Regla fundamental: UNA sola tarjeta

En cada llamada Ghost-Link existe **una unica tarjeta** que conecta a ambos participantes:
la tarjeta que el **receptor (dueno)** compartio con el **caller**.

- El caller NO necesita haber compartido una tarjeta propia.
- La tarjeta en comun es siempre la del dueno/receptor.

---

## Tipos de llamada

| Tipo | callType | Descripcion |
|---|---|---|
| **Ghost-Link Voice** | `audio` | Llamada de voz (como telefono) |
| **Ghost-Link FaceCall** | `video` | Videollamada con camara (como FaceTime) |

Ambos tipos comparten el mismo flujo de invitacion, el mismo canal Agora, los mismos endpoints.
La unica diferencia es que FaceCall activa la camara y muestra video remoto + PiP local.

---

## Tipos de tarjeta y su efecto en la UI

| Aspecto | **Business Card** | **Smart Card (personal)** |
|---|---|---|
| Avatar en llamada | Logo / imagen custom del negocio | Foto de perfil del dueno |
| Nombre en llamada | Nombre del negocio (ej: "RESTAURANTE BARRETO") | Nombre de la tarjeta personal (ej: "Alfonso Barreto") |
| Logica del flujo | Identica | Identica |

---

## Flujo completo paso a paso

### Paso 1 — Iniciar llamada (Caller)

- El caller esta viendo la tarjeta del receptor en su vault.
- Toca el **icono VoIP (Ghost-Link)** o el **icono Video (FaceCall)**.
- Se abre un **modal de confirmacion** (`ConfirmView`):
  - **Avatar**: foto/logo de **la tarjeta**.
  - **Nombre**: nombre de **la tarjeta**.
  - **Dos botones** siempre visibles:
    - **"Llamada de voz"** (verde) — inicia llamada de audio.
    - **"FaceCall"** (dorado) — inicia videollamada.
  - Boton terciario: **"Cancelar"**.

### Paso 2 — Marcando (Caller confirma)

- El caller toca el boton de confirmar.
- **Permisos**: si es FaceCall, se pide permiso de camara. Si se niega, baja a audio.
- Se abre **pantalla completa** de llamada (`OutgoingView`):
  - **Avatar**: foto/logo de **la tarjeta**.
  - **Nombre**: nombre de **la tarjeta**.
  - Estado: **"Llamando..."**
  - Controles: **Mute** | **Speaker** | **Camera** (toggle on/off)
  - Boton rojo: **"Colgar / End Call"**
  - Pie: _"Tu numero real esta 100% oculto"_
  - **Tono**: ringback de audio o video segun tipo de llamada.

### Paso 3 — Llamada entrante (Receptor)

- El receptor ve la **pantalla de llamada entrante** (`IncomingView`):
  - **Avatar**: foto de perfil **del caller**.
  - **Nombre**: `@nickname` + nombre completo **del caller**.
  - **Badge FaceCall** (solo video): icono camara dorado + "FaceCall".
  - **Texto**: "Llamada Entrante..." o "Videollamada Entrante..."
  - **Badge tarjeta**: "Desde tu tarjeta: [NOMBRE DE LA TARJETA]"
  - Botones: **[ACEPTAR]** (con icono phone o video) | **[RECHAZAR]**
  - **Tono**: ringtone de audio o video segun tipo de llamada.
  - **Vibracion**: patron repetitivo hasta aceptar/rechazar.
  - **Volumen (-)**: primer press silencia tono+vibracion, segundo press rechaza.

### Paso 4 — Llamada conectada (Receptor acepta)

**Llamada de voz** (`ActiveIncomingView` / `OutgoingView`):
- Avatar del **otro** participante.
- Nombre del **otro** participante.
- Nombre de la tarjeta en comun visible para ambos.
- Timer: `En llamada · 00:00`
- Controles: **Mute** | **Speaker** | **Camera** (upgrade mid-call) | **End Call**

**FaceCall** (`ActiveVideoView`):
- **Video remoto**: pantalla completa de fondo.
- **PiP local**: esquina superior derecha, borde dorado, 110x150px.
- **Barra superior**: logo CS + nombre del peer + nombre tarjeta + timer.
- Controles: **Mute** | **Camera off** | **Flip camera** | **Speaker**
- Boton rojo circular: **End Call**

### Paso 5 — Fin de llamada

- Cualquiera toca **"End Call"**.
- Se muestra `EndedView` con mensaje "Llamada finalizada" por 2 segundos.
- Se registra en el log de llamadas (duracion, direccion, tarjeta, callType, etc.).

### Paso 5b — Llamada rechazada

- Si el receptor toca **[RECHAZAR]** o presiona volumen (-) dos veces:
  - La llamada se corta.
  - El caller ve `EndedView` con "Llamada rechazada".
  - Se registra en el log como `rejected`.

### Paso 5c — Llamada no contestada (TTL 45s)

- Si pasan 45 segundos sin respuesta:
  - El caller ve `EndedView` con "Llamada finalizada".
  - Se registra en el log como `missed`.

### Upgrade mid-call: Audio ↔ Video

- En cualquier momento de una llamada activa, cualquier participante puede:
  - **Activar camara**: toca "Camera" → se pide permiso → se activa video.
  - **Desactivar camara**: toca "Camera" de nuevo → vuelve a solo audio.
- El cambio es instantaneo sin cortar la llamada (Agora `updateChannelMediaOptions`).
- Si un lado tiene video y el otro no, el que tiene video ve avatar del otro, el otro ve el video.

---

## Resumen de identidad por pantalla

### Caller (el que llama) ve:

| Campo | Valor |
|---|---|
| Avatar | Foto/logo de **la tarjeta** |
| Nombre | Nombre de **la tarjeta** |
| Badge | Nombre de la tarjeta a quien llama |

### Receptor (el dueno de la tarjeta) ve:

| Campo | Valor |
|---|---|
| Avatar | Foto de perfil **del caller** |
| Nombre | Nombre **del caller** |
| Badge | "Desde tu tarjeta: [NOMBRE TARJETA]" |

---

## Ejemplos

### Business Card — Voz

> Alfonso es dueno de "RESTAURANTE BARRETO". Le dio esa tarjeta a Carlos.

- **Carlos llama**: logo del restaurante + "RESTAURANTE BARRETO" + "Llamando..."
- **Alfonso recibe**: foto de Carlos + "Carlos M." + "Desde tu tarjeta: RESTAURANTE BARRETO"

### Smart Card personal — FaceCall

> Alfonso le compartio su tarjeta personal a Carlos.

- **Carlos videollama**: foto de Alfonso + "Alfonso Barreto" + badge dorado "FaceCall"
- **Alfonso recibe**: foto de Carlos + "Videollamada Entrante..." + badge dorado "FaceCall"
- **Conectados**: Carlos ve video de Alfonso en fullscreen, su PiP arriba-derecha. Alfonso igual.

---

## Tonos de llamada

| Archivo | Cuando suena |
|---|---|
| `ghost-link-ringtone.wav` | Receptor: llamada de voz entrante |
| `ghost-link-ringtone-video.wav` | Receptor: FaceCall entrante |
| `ghost-link-ringback.wav` | Caller: marcando llamada de voz |
| `ghost-link-ringback-video.wav` | Caller: marcando FaceCall |
| `ghost-link-connected.wav` | Beep corto al conectar la llamada (ambos lados) |

Ubicacion: `assets/sounds/`. Reemplazar archivos `.wav` sin tocar codigo.

---

## Estado actual — Lo que YA esta construido

| # | Feature | Estado | Ubicacion principal |
|---|---------|--------|---------------------|
| 1 | Backend: start/incoming/respond + callType | Hecho | `qrRoutes.js` |
| 2 | Backend: Agora token generation | Hecho | `agoraGhostLink.js` |
| 3 | Backend: cardPhoto, cardName, cardType en invite | Hecho | `qrRoutes.js` |
| 4 | Backend: push notifications (Expo Push) | Hecho | `pushNotifications.js` + `qrRoutes.js` |
| 5 | Frontend: API client start/incoming/respond + callType | Hecho | `ghostLinkVoip.ts` |
| 6 | Frontend: Agora audio + video session | Hecho | `ghostLinkAgoraSession.ts` |
| 7 | Frontend: GhostLinkCallProvider (estado global) | Hecho | `GhostLinkCallProvider.tsx` |
| 8 | Frontend: GhostLinkCallOverlay (todas las vistas) | Hecho | `GhostLinkCallOverlay.tsx` |
| 9 | Frontend: ConfirmView (paso 1 modal) | Hecho | `GhostLinkCallOverlay.tsx` |
| 10 | Frontend: OutgoingView (caller marcando/activo) | Hecho | `GhostLinkCallOverlay.tsx` |
| 11 | Frontend: IncomingView (receptor ringing) | Hecho | `GhostLinkCallOverlay.tsx` |
| 12 | Frontend: ActiveVideoView (FaceCall fullscreen) | Hecho | `GhostLinkCallOverlay.tsx` |
| 13 | Frontend: EndedView (finalizada/rechazada/error) | Hecho | `GhostLinkCallOverlay.tsx` |
| 14 | Call logging con duracion real + callType | Hecho | `GhostLinkCallProvider.tsx` + `qrApi.ts` |
| 15 | Llamadas rechazadas registradas | Hecho | `GhostLinkCallProvider.tsx` |
| 16 | Llamadas perdidas / TTL expirado registradas | Hecho | `GhostLinkCallProvider.tsx` |
| 17 | Timer visible en pantalla activa | Hecho | `GhostLinkCallOverlay.tsx` |
| 18 | Auto-cerrar caller cuando receptor rechaza | Hecho | `GhostLinkCallProvider.tsx` |
| 19 | Auto-cerrar caller cuando TTL expira (45s) | Hecho | `GhostLinkCallProvider.tsx` |
| 20 | Iconos de direccion/status en historial | Hecho | `calls.tsx` |
| 21 | Vibracion al recibir llamada | Hecho | `GhostLinkCallProvider.tsx` |
| 22 | Cancelar con volumen (-) | Hecho | `GhostLinkCallProvider.tsx` |
| 23 | Ringtones separados voz / video | Hecho | `GhostLinkCallProvider.tsx` |
| 24 | Rellamar desde historial | Hecho | `calls.tsx` |
| 25 | Agrupar llamadas repetidas | Hecho | `calls.tsx` |
| 26 | Push notification al recibir llamada | Hecho | `pushNotifications.js` + `pushRegistration.ts` |
| 27 | Upgrade mid-call audio ↔ video | Hecho | `ghostLinkAgoraSession.ts` |
| 28 | Flip camera (frontal/trasera) | Hecho | `ghostLinkAgoraSession.ts` |
| 29 | Permisos iOS (camara + mic) en app.json | Hecho | `app.json` |
| 30 | Permisos Android (camara) en app.json | Hecho | `app.json` |
| 31 | Boton FaceCall visible en ConfirmView (voz + video) + historial | Hecho | `GhostLinkCallOverlay.tsx` + `calls.tsx` |
| 32 | Animacion de ring — pulso dorado en avatar durante ringing | Hecho | `GhostLinkCallOverlay.tsx` (PulsingRing) |
| 33 | Haptic feedback al conectar (Success) y colgar (Medium) | Hecho | `GhostLinkCallProvider.tsx` (expo-haptics) |
| 34 | Beep de conexion al pasar a fase active | Hecho | `GhostLinkCallProvider.tsx` + `ghost-link-connected.wav` |
| 35 | Agora onUserJoined — caller transiciona a active automaticamente | Hecho | `GhostLinkCallProvider.tsx` |

---

## Auditoria UX — Lo que FALTA vs competencia

Comparacion con WhatsApp, FaceTime (Apple), WeChat, Telegram, LINE.

### Prioridad CRITICA (sin esto no se siente app de llamadas)

| # | Feature | WhatsApp | FaceTime | WeChat | Nosotros | Esfuerzo |
|---|---------|----------|----------|--------|----------|----------|
| 1 | **Boton de FaceCall visible en UI** — ConfirmView muestra voz + video, historial tiene boton video | Si | Si | Si | **SI** | Bajo |
| 2 | **CallKit (iOS)** — llamada entrante suena como llamada real del sistema, pantalla nativa de iOS incluso con app cerrada | Si | Si | Si | NO | Alto |
| 3 | **Foreground service (Android)** — notificacion persistente tipo "llamada entrante" con botones Accept/Decline, incluso con app en background | Si | N/A | Si | NO | Alto |
| 4 | **Llamadas con app cerrada** — actualmente solo funciona con app abierta (polling + push solo despierta si app esta en foreground/background reciente) | Si | Si | Si | NO | Alto |

### Prioridad ALTA (mejora significativa de experiencia)

| # | Feature | WhatsApp | FaceTime | WeChat | Nosotros | Esfuerzo |
|---|---------|----------|----------|--------|----------|----------|
| 5 | **Reconexion automatica** — si la red cae 2-3 segundos, Agora intenta reconectar sin cortar. Necesitamos UI "Reconectando..." | Si | Si | Si | NO | Medio |
| 6 | **Proximity sensor** — apagar pantalla cuando el telefono esta en la oreja (solo voz) | Si | N/A | Si | NO | Bajo |
| 7 | **Audio routing inteligente** — empezar en earpiece para voz, en speaker para video. Cambiar si conecta Bluetooth | Si | Si | Si | NO | Medio |
| 8 | **Pantalla bloqueada / Do Not Disturb** — respetar modo silencioso del sistema | Si | Si | Si | NO | Medio |
| 9 | **Indicador "el otro esta escribiendo/hablando"** — feedback visual de que el audio del otro esta activo (onda de voz animada) | Si | No | Si | NO | Medio |
| 10 | **Calidad adaptativa** — bajar resolucion de video en redes lentas (Agora lo maneja parcialmente, pero necesitamos configurarlo) | Si | Si | Si | Parcial | Bajo |

### Prioridad MEDIA (pulido profesional)

| # | Feature | WhatsApp | FaceTime | WeChat | Nosotros | Esfuerzo |
|---|---------|----------|----------|--------|----------|----------|
| 11 | **PiP draggable** — mover el video local a cualquier esquina arrastrando | Si | Si | Si | NO | Medio |
| 12 | **Efectos de fondo / blur** — difuminar fondo en video (privacidad) | No | Si | No | NO | Alto |
| 13 | **Picture-in-Picture del sistema** — seguir viendo video al salir de la app (Android PiP / iOS PiP) | Si | Si | No | NO | Alto |
| 14 | **Notas de voz en llamada** — grabar un segmento de la llamada como nota de voz (ya tienes infra de voice notes) | No | No | No | NO | Medio |
| 15 | **Compartir pantalla** — Agora lo soporta, util para business cards | No | No | No | NO | Alto |
| 16 | **Llamada en espera / hold** — poner en espera y retomar | Si | Si | Si | NO | Medio |
| 17 | **Transferir llamada** — redirigir a otro contacto (util para business) | No | No | No | NO | Alto |
| 18 | **Llamada grupal** — 3+ participantes (Agora lo soporta nativamente) | Si | Si (32) | Si (9) | NO | Alto |
| 19 | **Mensaje pre-rechazar** — "Estoy ocupado, te llamo luego" como respuesta rapida al rechazar | Si | Si | No | NO | Bajo |
| 20 | **Estadisticas de llamada** — mostrar calidad de red, bitrate, perdida de paquetes al final de la llamada | No | No | Si | NO | Bajo |

### Prioridad BAJA (nice to have / diferenciadores)

| # | Feature | WhatsApp | FaceTime | WeChat | Nosotros | Esfuerzo |
|---|---------|----------|----------|--------|----------|----------|
| 21 | **Animacion de ring** — pulso dorado animado en el avatar mientras suena | Si | Si | Si | **SI** | Bajo |
| 22 | **Haptic feedback** — vibracion sutil al conectar llamada y al colgar | Si | Si | No | **SI** | Bajo |
| 23 | **Sonido de conexion** — beep sutil cuando la llamada conecta | Si | Si | Si | **SI** | Bajo |
| 24 | **Encriptacion E2E visible** — indicador de que la llamada esta encriptada | Si | Si | No | NO | Bajo |
| 25 | **Reacciones en video** — emojis flotantes durante videollamada | No | Si | No | NO | Medio |
| 26 | **Filtros de camara** — belleza, filtros de color en video | No | No | Si | NO | Alto |
| 27 | **Transcripcion en vivo** — subtitulos de lo que dice el otro (accesibilidad) | No | No | No | NO | Alto |
| 28 | **Grabacion de llamada** (con consentimiento) — grabar la llamada completa | No | No | No | NO | Alto |
| 29 | **Modo conduccion** — UI simplificada con botones grandes para usar en el auto | Si | No | No | NO | Medio |

---

## Recomendacion de proximos pasos

Items #1, #21, #22, #23 ya completados. Siguiente prioridad:

| Orden | Item | Esfuerzo | Impacto |
|-------|------|----------|---------|
| 1 | **#19 Mensaje pre-rechazar** — respuesta rapida al rechazar | Bajo | Medio |
| 2 | **#6 Proximity sensor** — apagar pantalla en oreja | Bajo | Alto |
| 3 | **#10 Calidad adaptativa** — config de Agora para redes lentas | Bajo | Medio |
| 4 | **#5 Reconexion automatica** — UI "Reconectando..." | Medio | Alto |
| 5 | **#7 Audio routing** — earpiece vs speaker vs bluetooth | Medio | Alto |
| 6 | **#9 Indicador de audio activo** — onda de voz animada | Medio | Medio |
| 7 | **#11 PiP draggable** | Medio | Medio |
| 8 | **#2 CallKit iOS** — llamadas reales del sistema | Alto | Critico |
| 9 | **#3 Foreground service Android** | Alto | Critico |
| 10 | **#4 Llamadas con app cerrada** | Alto | Critico |
| 11 | **#18 Llamada grupal** | Alto | Alto |
