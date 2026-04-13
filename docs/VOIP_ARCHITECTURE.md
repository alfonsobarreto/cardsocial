# Arquitectura VoIP & Máquina de Estados (Ghost-Link)

Este documento define la arquitectura estricta, el ciclo de vida y las "Reglas de Oro" del motor de llamadas de voz y video. Diseñado para evitar *race conditions*, fugas de memoria (motores zombie), colisiones de audio nativo y parpadeos de cámara (camera flickering).

## 1. La Filosofía del Sistema (Single Source of Truth)
El motor de llamadas está desacoplado de la UI previa. Utiliza un estricto Contexto Reactivo (`VoIPCallContext`) y un hook especializado (`useAgoraRtc`) para gobernar el estado de la llamada. 

**No usamos Agora RTM para el Signaling.** El "timbre" (Signaling) está gobernado por nuestro backend (Node + MongoDB `ghost_link_invites` + Expo Push Notifications/Polling). Agora entra en acción *después* o *durante* la aceptación de la llamada.

---

## 2. La Máquina de Estados (`VoIPCallPhase`)
Toda la aplicación obedece a este Enum. No existen variables sueltas como `isCalling` o `hasAnswered`.

*   **`IDLE`**: Estado base. Sin llamadas activas. Recursos de hardware liberados.
*   **`OUTGOING_CALLING`**: El Emisor inicia la llamada. El backend registra el invite. Inicia el tono local (ringback) vía `expo-av`. Inicia el Local Video Preview (sin audio) en Agora.
*   **`INCOMING_RINGING`**: El Receptor recibe el Push/Polling. Inicia el tono de llamada (ringtone) vía `expo-av`. Inicia el Local Video Preview (sin audio) si es videollamada.
*   **`CONNECTING`**: **[Fase Crítica de Transición]**. Se aceptó la llamada. Se ejecuta el "Handoff" de audio (ver Regla de Oro).
*   **`IN_CALL`**: Conectados en Agora RTC. Control total del hardware por parte del motor C++ de Agora.
*   **`ENDING`**: Se inicia el teardown. Disparado por botón local, remoto offline o error. Bloqueado por `endingInProgressRef` para evitar colisiones. Retorna a `IDLE`.

---

## 3. Las 3 Reglas de Oro del Hardware

### A. El Puente de Audio (Exclusión Mutua)
`expo-av` (el timbre) y `react-native-agora` (la voz) **NUNCA** deben coexistir reproduciendo audio. 
Durante la fase `CONNECTING`, se ejecuta `runVoipConnectingAudioHandoff`:
1. `expo-av` se detiene y descarga (`unloadAsync()`).
2. Se reconfigura el OS nativo (`AudioSessionCategory` a `PlayAndRecord` en iOS, y `playThroughEarpieceAndroid: true` en Android).
3. Solo tras este puente, Agora recibe permiso para hacer `enableAudio()` y `joinChannel()`.

### B. El Feedback de Conexión (Cero Beeps)
Para evitar corromper la sesión de audio de Agora justo al conectar (`onUserJoined`), **no reproducimos sonidos (`Sound`)**. Utilizamos *Haptics* (vibración nativa del sistema) para notificar al usuario que la otra persona contestó.

### C. El Motor de Video Singleton (Flicker-Free)
Para evitar que la cámara parpadee a negro al contestar (Camera Flickering):
1. **Fase Ringing**: Inicializamos Agora en modo Preview (`startPreview()`) usando `uid: 0` para mostrar la cámara local al usuario, **sin habilitar el audio**.
2. **Fase In-Call**: Al hacer `joinChannel`, **NO** destruimos el motor (`release()`). Reutilizamos la instancia validando `lastPreviewAppId`, aplicamos el perfil de audio y nos unimos al canal. 

---

## 4. UI y Renderizado de Vistas (Video)
El renderizado remoto obedece estrictamente a los eventos nativos de la red para evitar *Frozen Frames* (caras congeladas).
*   **Video Remoto**: `<RtcSurfaceView>` se desmonta dinámicamente si `isRemoteVideoEnabled` es falso (ej. el remoto apagó su cámara), mostrando un Avatar/Placeholder en su lugar.
*   **Video Local en Timbre**: Se utiliza un `RingingLocalVideoBackdrop` (con un *scrim* oscurecido) debajo de la UI, ocultando los avatares estáticos para dar protagonismo a la cámara real en tiempo real.
*   **Expo-Camera**: Completamente erradicado del flujo de llamadas para evitar peleas por el hardware. Agora es el único dueño de la cámara.

---

## 5. Prevención de Bugs Críticos (Teardown)
El proceso de colgar (`finalizeCallEnding`) está protegido por un candado (`endingInProgressRef = true`). Esto garantiza que si el usuario presiona "Colgar" en el milisegundo exacto en que la red se cae, el sistema de limpieza (`leaveChannel` -> `release` -> Notify Backend -> `IDLE`) se ejecute **una sola vez**, evitando llamadas fantasma o crasheos de la aplicación.

---

## Apéndice A — Implementación en el repo (CardSocial)

Esta sección enlaza la "Biblia" conceptual con los símbolos TypeScript y archivos reales para que no haya ambigüedad al implementar.

### A.1 Nombres de fases en código

* Las fases **IDLE**, **OUTGOING_CALLING**, **INCOMING_RINGING**, **CONNECTING**, **IN_CALL**, **ENDING** del §2 corresponden al tipo **`VoIPFsmPhase`** en `services/voip/voipCallMachine.types.ts` (máquina agnóstica / esqueleto `VoIPCallContext`).
* Las fases de **UI Ghost-Link** (`idle`, `ringing_outgoing`, `active`, …) viven en el enum **`VoIPCallPhase`** en `services/voip/VoIPCallPhase.ts` y las consume `GhostLinkCallProvider`.
* El puente entre ambas está en **`ghostPhaseToVoIPPhase()`** (`services/voip/ghostLinkToVoipPhaseMap.ts`).

### A.2 Single source of truth RTC* **`useAgoraRtc`** (`services/voip/useAgoraRtc.ts`): join, handlers, mic/altavoz, vídeo local/remoto (`isRemoteVideoEnabled`), `endRtcSession`.
* **`ghostLinkAgoraSession.ts`**: singleton `IRtcEngine`, `joinGhostLinkAgoraSession`, `leaveGhostLinkAgoraSession`, preview **`startGhostLinkLocalVideoPreview`** / **`stopGhostLinkLocalVideoPreview`**, reutilización preview→join con **`ghostLinkEnginePreviewOnly`** + **`lastPreviewAppId`**.

### A.3 Preview en timbre

* Hook **`useGhostLinkRingingVideoPreview`** (`services/voip/useGhostLinkRingingVideoPreview.ts`): activa preview solo con `agora.appId`, mientras suena el timbre y **`!rtcHandoffComplete`**; el cleanup llama **`stopGhostLinkLocalVideoPreview`** (teardown del motor si aún no hay join).
* Contexto expone **`localPreviewActive`** para la UI (`RingingLocalVideoBackdrop` en `components/GhostLinkCallOverlay.tsx`).

### A.4 Teardown unificado y referencias circulares

* **`finalizeCallEnding`** en `GhostLinkCallProvider`: orden **Agora** (`endRtcSession`) → **backend** (`respondGhostLinkInvite` `action: 'end'`) → **reset** a idle.
* **`finalizeEndingRef` + `useLayoutEffect`**: los callbacks de `useAgoraRtc` no cierran sobre una función aún no definida.
* **`suppressLeaveFinalizeRef`**: evita doble teardown cuando el SDK dispara `onLeaveChannel` justo después de un colgado local.
* Timbre: **`expo-av`** tipado con **`Audio.Sound`**; sin **`expo-camera`** en el provider Ghost-Link.

### A.5 Archivos de referencia rápida

| Área | Archivo principal |
|------|-------------------|
| Provider llamada Ghost-Link | `services/GhostLinkCallProvider.tsx` |
| Handoff audio | `services/voip/voipExpoAvToAgoraAudioBridge.ts` |
| Feedback conexión | `services/voip/ghostLinkConnectedFeedback.ts` |
| Overlay UI | `components/GhostLinkCallOverlay.tsx` |
| API / invites | `services/ghostLinkVoip.ts` |

---

*Documento base aportado por Vertex (Arquitecto); apéndice mantenido alineado con el código del repositorio.*
