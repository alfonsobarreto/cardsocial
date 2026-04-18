# Registro de peticiones y cambios — VoIP / Ghost-Link (sesión de trabajo)

Este documento recoge **lo que pediste** y **qué se hizo en código**, para no depender solo del chat.  
Documentación relacionada: `VOIP_STATE_SYNC_AND_TELEMETRY.md`, `VOIP_ARCHITECTURE.md`, `GHOSTLINK_VOIP_FLOW.md`.

---

## 1. Limpieza de logs de depuración (identidad / pruebas manuales)

**Pedido:** Quitar logs añadidos para pruebas (`[CS-identity-test]`, `logIdentityTest`, efectos en cards/contacts/calls, `voip:call_view` en overlay, doc de prueba, ruido en contacts).

**Hecho:**

- Eliminados `services/identityManualTestLogs.ts` y `docs/MANUAL_TEST_IDENTITY_LOGS.md`.
- Retirados imports y `useEffect` de prueba en `app/(tabs)/cards.tsx`, `contacts.tsx`, `calls.tsx`; limpieza en `GhostLinkCallOverlay.tsx`.
- Eliminado `console.log('[CONTACTS_LOAD] …')` en `contacts.tsx`.
- En `calls.tsx`, el mapeo de contactos al cargar incluye **`bcContactName`** donde aplica (paridad con `ContactRow` / negocio).

---

## 2. Auditoría forense VoIP (solo lectura)

**Pedido:** Revisar flujo VoIP sin romper trabajo de identidad ya corregido.

**Hecho:** Análisis en chat; sin cambios de código en esa tarea.

---

## 3. Fixes arquitectónicos Vertex (motor + fases)

**Pedido:**

1. **Anti-crash video:** En `useAgoraRtc`, el efecto del motor no debe incluir `enableVideo` en dependencias (toggle cámara no debe hacer `leaveGhostLinkAgoraSession`). Sincronizar vídeo local en efecto aparte / `enableLocalVideo`.
2. **Anti-limbo:** En `GhostLinkCallProvider`, pasar a `VoIPCallPhase.Active` en **`onLocalRtcJoined`** para **entrante y saliente**; `triggerGhostLinkConnectedFeedback()` solo cuando el **remoto** se une (`onRemoteUserJoined`).

**Hecho:**

- `services/voip/useAgoraRtc.ts`: `enableVideoRef`, join con `enableVideoRef.current`, deps del efecto principal **sin** `enableVideo`.
- `services/GhostLinkCallProvider.tsx`: callbacks Agora ajustados según lo anterior.

---

## 4. Telemetría `[VOIP]` (`logVoip`)

**Pedido:** Helper `logVoip` solo `__DEV__`, puntos críticos: signaling, fases, handoff audio, colgar, `respondGhostLinkInvite`, join Agora / eventos remotos.

**Hecho:**

- `services/voip/voipDevTelemetry.ts` (`logVoip`).
- Instrumentación en `ghostLinkVoip.ts`, `GhostLinkCallProvider.tsx`, `ghostLinkAgoraSession.ts`, `useAgoraRtc.ts`, `voipExpoAvToAgoraAudioBridge.ts`.  
  Detalle en `VOIP_STATE_SYNC_AND_TELEMETRY.md`.

---

## 5. Banner visual al volver a Idle

**Pedido:** Cuando la fase pasa a `Idle` viniendo de otra fase, imprimir banner con `console.log` (sin prefijo `[VOIP]`), solo `__DEV__`.

**Hecho:** `GhostLinkCallProvider.tsx` — `useEffect` de transiciones de fase: bloque con líneas `FIN DE LLAMADA / RESET A IDLE`.

---

## 6. Carrera receptor al aceptar (`acceptingInProgressRef`)

**Pedido:** Mientras `acceptIncoming` está en curso, el watcher de `RingingIncoming` no debe llamar `finalizeEnding('remote')` porque el backend ya no devuelve el invite.

**Hecho:**

- `acceptingInProgressRef` puesto a `true` al inicio de `acceptIncoming` (con reset si guard temprano).
- Watcher: si `acceptingInProgressRef`, no finalizar; **reprogramar** el siguiente poll (no cortar el intervalo).
- `resetCall()` pone el ref a `false`.

---

## 7. Altavoz UI vs hardware + logs de botones + quitar teclado

**Pedido:**

- No resetear altavoz al unirse a Agora si el usuario ya lo cambió en timbre; forzar sync al hardware al entrar en sesión / Active.
- `logVoip` en toggles de mute, altavoz, cámara (mensajes con estado UI / hardware donde aplique).
- Eliminar por completo teclado DTMF (Keypad) en UI de llamada.

**Hecho:**

- `useAgoraRtc.ts`: eliminado reset de `isSpeakerphoneOn` al pasar `shouldJoin` a true (solo se resetea mute); post-join `setGhostLinkAgoraSpeaker` + log; logs en toggles / switch cámara.
- `GhostLinkCallProvider.tsx`: efecto en `Active` con `getGhostLinkAgoraEngine` + `setGhostLinkAgoraSpeaker(speaker)`.
- `useGhostLinkCameraConsent.ts`: logs en flujos de toggle de cámara.
- `components/GhostLinkCallOverlay.tsx`: quitados botón y sheet del teclado; eliminado `components/voip/GhostLinkKeypadSheet.tsx`.

---

## 8. Latencia percibida: polling agresivo + profiler

**Pedido:**

- Receptor: con llamada en curso (`RingingIncoming` y `Active`), consultar backend **cada 1 s** para detectar colgado remoto antes que Agora/push.
- Profiler: tiempos con `performance.now()` — ej. colgado local desde clic; invitación entrante (latencia de la consulta); status saliente; tiempo total de `finalizeCallEnding`.

**Hecho:**

- `CALLEE_SIGNALING_POLL_MS = 1000` para watcher **RingingIncoming** y nuevo watcher en **Active** (solo `direction === 'incoming'`).
- Emisor sigue usando `CALLER_STATUS_POLL_MS` (3 s) para `getOutgoingGhostLinkInviteStatus`.
- Ref `localHangupClickPerfRef` en `endCall` / `cancelCall`; logs `Colgado local ejecutado`, `finalizeCallEnding completado`; idle poll con `latenciaSignalingMs`; status saliente con `consultaRedMs`.

### Rollback (post-Vertex): polling 1 s revertido

El poll agresivo (1 s) y el watcher en **Active** reintroducían una carrera: al entrar en `Active`, el GET entrante podía verse “sin invite” durante la transición y disparar `finalizeEnding('remote')`.

**Revertido:** solo `CALLER_STATUS_POLL_MS` (3000 ms) en el watchdog de `RingingIncoming`; eliminado el `useEffect` de poll en `Active`; eliminados `CALLEE_SIGNALING_POLL_MS` y la instrumentación `performance.now()` ligada a colgar / profiler en ese bloque. Se mantienen banner Idle, `logVoip` general, y **`acceptingInProgressRef`** en el watcher de timbre.

---

## 9. Explicación sin tocar código (intermitencia “3 llamadas mal…”)

**Pedido:** Auditar por qué a veces falla y luego va; **sin modificar código**.

**Hecho:** Respuesta en chat (timing de red, estado en servidor, Agora/audio, carreras, acción local vs remota en logs).

---

## Archivos tocados con más frecuencia

| Archivo | Temas |
|---------|--------|
| `services/GhostLinkCallProvider.tsx` | Fases, polling, finalize, speaker, telemetría, profiler, banner, `acceptingInProgressRef` |
| `services/voip/useAgoraRtc.ts` | Vida del motor, deps, altavoz/mute, logs Agora |
| `services/ghostLinkAgoraSession.ts` | Log antes de `joinChannel` |
| `services/ghostLinkVoip.ts` | Start call, respond + logs end/reject |
| `services/voip/voipExpoAvToAgoraAudioBridge.ts` | Handoff + logs |
| `services/voip/voipDevTelemetry.ts` | `logVoip` |
| `hooks/useGhostLinkCameraConsent.ts` | Logs toggle cámara |
| `components/GhostLinkCallOverlay.tsx` | Sin teclado |
| `app/(tabs)/cards.tsx`, `contacts.tsx`, `calls.tsx` | Limpieza logs identidad (cuando aplica) |

---

## Cómo mantener este registro

Cuando pidas un cambio nuevo en VoIP, se puede **añadir una sección numerada** aquí o una entrada breve al final con fecha y resumen.
