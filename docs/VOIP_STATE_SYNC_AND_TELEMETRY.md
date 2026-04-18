# VoIP — des-sincronización de estados (“Ghost calls”) y telemetría de desarrollo

**Registro maestro de peticiones y cambios (todo lo pedido en sesión):** ver [`VOIP_CHANGELOG_AND_REQUESTS.md`](./VOIP_CHANGELOG_AND_REQUESTS.md).

## Problema (contexto Vertex / Lead Engineer)

En ocasiones, cuando el usuario A llama y B rechaza o cancela, la llamada se destruye en un lado pero el otro sigue timbrando de forma indefinida (o al revés). Es un bug de **señalización / red / estado** difícil de reproducir sin trazas alineadas en el tiempo.

## Fixes arquitectónicos ya aplicados (resumen)

| Área | Qué ocurría | Qué hicimos |
|------|-------------|-------------|
| Motor Agora (`useAgoraRtc`) | `enableVideo` en las dependencias del efecto principal disparaba cleanup → `leaveGhostLinkAgoraSession()` al apagar cámara, matando la llamada. | `enableVideo` fuera del array de deps; valor de join vía `enableVideoRef.current`. El toggle de cámara sigue en efecto separado / `setGhostLinkAgoraVideo`. |
| Fases (`GhostLinkCallProvider`) | Transición a `Active` solo vía `onRemoteUserJoined` en saliente → riesgo de “limbo” y watchdog. | `Active` al **join local** (`onLocalRtcJoined`) en entrante y saliente; `triggerGhostLinkConnectedFeedback()` solo cuando el remoto entra al canal. |

## Telemetría de alta precisión (`__DEV__` solamente)

Objetivo: cazar desincronías entre **backend**, **fases UI**, **expo-av** y **Agora**.

### Helper

- Archivo: `services/voip/voipDevTelemetry.ts`
- API: `logVoip(event: string, data?: Record<string, unknown>)`
- Solo imprime si `__DEV__` es verdadero. Prefijo de consola: **`[VOIP]`**.

### Dónde se registra qué

1. **Señalización**
   - `ghostLinkVoip.ts` — `startGhostLinkVoipCall`: evento `Iniciando llamada` + payload seguro (uids, tipo, tarjeta).
   - `GhostLinkCallProvider` — polling saliente: `Status de invitación recibido` cuando `status === 'accepted' \| 'rejected'` + `msSinceRingingStart` + `inviteId`.
   - `GhostLinkCallProvider` — invitación entrante: `Invitación entrante detectada` + `inviteId`, `sessionId`, `callType`, `callerUid`.
   - `requestCall`: `requestCall (payload UI antes de confirmar)` (sustituye el `console.log` previo del timbre).
2. **Fases**
   - `GhostLinkCallProvider`: `Transición de Fase` + `from` / `to` (`VoIPCallPhase`).
3. **Handoff audio**
   - `voipExpoAvToAgoraAudioBridge.ts`: antes/después de liberar tonos; antes/después de `setAudioModeAsync` en modo sesión VoIP RTC.
   - `GhostLinkCallProvider` `playTone` / `stopTone`: antes/después de `setAudioModeAsync` (tonos) y `stopAsync`/`unloadAsync`.
4. **Colgar**
   - `finalizeCallEnding`: `Intentando colgar` + `kind` + `endingInProgress` + `phase`; omisiones con `Intentando colgar omitido` + `reason`.
   - `ghostLinkVoip.ts` — `respondGhostLinkInvite` para `action === 'end' \| 'reject'`: `Enviando End/Reject al backend`, luego `— respuesta` o `— error`.
5. **Agora**
   - `ghostLinkAgoraSession.ts`: inmediatamente antes de `joinChannel`: `Intentando Join Agora` + `uid`, `channelName`, `publishCameraTrack`.
   - `useAgoraRtc.ts`: `Agora remoto entró al canal (onUserJoined)` / `Agora remoto salió (onUserOffline)`.

## Cómo quitar la telemetría sin romper la app

1. Borrar o vaciar `services/voip/voipDevTelemetry.ts` (o dejar `logVoip` como no-op).
2. Eliminar importaciones de `logVoip` y las llamadas asociadas en los archivos listados arriba.
3. Opcional: buscar en el repo `[VOIP]` para no dejar restos.

No hace falta tocar la lógica de negocio si solo se quitan llamadas a `logVoip`.

## Cómo usar en depuración

En Metro / Xcode / Android Studio, filtrar por **`[VOIP]`** para ver solo estas líneas y correlacionar orden temporal con el backend (inviteId, uid de canal).
