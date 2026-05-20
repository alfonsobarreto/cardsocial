# Ghost-Link — Push, entrega en reposo y despertar de la app

> Resumen **de lo implementado** para que una llamada entrante Ghost-Link se entere mejor cuando el celular está en segundo plano, pantalla apagada o el sistema aplaza el JavaScript por ahorro de batería.  
> Documento técnico breve para el equipo. Flujo VoIP/Agora detallado: ver [`GHOSTLINK_VOIP_FLOW.md`](./GHOSTLINK_VOIP_FLOW.md).

---

## Qué problema atacamos

Sin push “fuerte”, el receptor podía tener la app abierta pero **los timers de polling** (`~4 s`) no corriendo bien con el **Reposo / Doze**, o llegar tarde hasta que desbloqueaba la pantalla.

**No** convertimos Ghost-Link en una llamada tipo operador (ConnectionService / línea Telefónica nativa nivel WhatsApp). Mejoramos la **cadena Expo Push → ejecutar código → pedir `/incoming`**.

---

## Comportamiento actual (humano → técnico)

1. El **caller** inicia llamada → backend guarda invite y llama **`sendPushToUser`** para el callee.
2. El **teléfono del callee** recibe una **notificación** (título/texto tipo “te está llamando”), canal Android **`ghost-link-calls`** (importancia alta).
3. Donde antes casi sólo fiábamos del **polling** periódico, ahora:
   - Una **tarea en segundo plano** (`expo-task-manager` + `registerTaskAsync`) puede **disparar el mismo “digest”** que un push Ghost-Link y forzar **una consulta inmediata** al API de invitación entrante.
   - **`GhostLinkCallProvider`** escucha ese digest y **reinicia el poll de una sola vez** sin esperar el intervalo.
4. Si el usuario **toca la notificación** o la app **arranca por ese tap**, **`getLastNotificationResponseAsync` + listener de respuesta** vuelven a disparar el mismo digest (ventana **120 s** en cold start).

---

## Cambios por capa

### Backend

- **`backend/src/lib/pushNotifications.js`**: mensajes Expo con `priority: 'high'`; campo opcional **`ttl`** en el payload.
- **`backend/src/routes/qrRoutes.js`** (Ghost-Link start): en el `data` del push se envían `type`, `inviteId`, `callerUid`, **`calleeUid`**, nombres, `callType`, etc., y **`ttl: 300`** para no perder el mensaje en Doze con TTL demasiado bajo.

### App (React Native / Expo)

| Pieza | Rol |
|--------|-----|
| `services/ghostLinkPushSignals.ts` | `DeviceEventEmitter`: `digestGhostLinkRemoteNotificationData` → evento interno `incoming` / `cancelled`. |
| `services/ghostLinkPushTask.ts` | `TaskManager.defineTask` + `Notifications.registerTaskAsync`; parsea payload FCM/APNs y llama al digest. |
| `services/GhostLinkCallProvider.tsx` | `incomingPollKickRef`: **poll inmediato** al digest; merge con cancelación remota. |
| `services/pushRegistration.ts` | Registro del task; **`installGhostLinkNotificationOpenHandlers`** (tap + última respuesta). |
| `app/_layout.tsx` | Instala los handlers de apertura desde notificación. |

### Config nativa

- **`app.json`**: plugin `expo-notifications` con **`enableBackgroundRemoteNotifications: true`** (iOS `remote-notification` según configuración Expo).

---

## Tipos TypeScript relacionados en Contactos (`contacts.tsx`)

Los errores de CI en `contacts`/`cards` se corrigieron alineando **tipos** con lo que ya hacía el código: `addedAt`, `searchFacets`, `ContactMeta.firstSeenAt`, `icons`, y **`businessSlotBlocked`** en Mis Tarjetas. Eso es independiente del push pero formó parte del mismo sprint de CI.

---

## Limitaciones que siguen

- App **forzada a parar** en Ajustes (Android): sin entrega hasta reabrir.
- App terminada desde multitarea + **solo** notificación visible: puede que **no** corra JS hasta tap (depende de plataforma/Expo → ver guía oficial “notification types”).
- Fabricantes (**ahorro ultra**, OEM): pueden seguir retrasando o silenciando.
- Comparación honesta con **WhatsApp**: ellos van mucho más lejos en **integración sistema de llamadas**; Ghost-Link sigue siendo push + pantalla propia + Agora.

---

## Archivos tocados (referencia rápida)

```
backend/src/lib/pushNotifications.js
backend/src/routes/qrRoutes.js

services/ghostLinkPushSignals.ts
services/ghostLinkPushTask.ts
services/GhostLinkCallProvider.tsx
services/pushRegistration.ts

app/_layout.tsx
app.json

package.json   (dependencia expo-task-manager)
.gitignore      (runtime-logs*.zip ignorados)
docs/GHOSTLINK_PUSH_WAKE.md    (este archivo)
```

Cuando hagáis cambios nuevos en push o en el canal, **actualizar este archivo** en la misma PR.
