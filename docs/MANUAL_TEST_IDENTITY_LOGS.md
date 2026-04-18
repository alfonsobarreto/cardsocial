# Prueba manual — logs de identidad (`[CS-identity-test]`)

Solo en **modo desarrollo** (`__DEV__`). Prefijo de consola: **`[CS-identity-test]`**.

En Metro / Xcode / Android Studio: filtra por `CS-identity-test` para ver solo estas líneas.

## Cómo repetir la prueba

1. Arranca la app en **dev client** (`npx expo start --dev-client`).
2. Abre la consola de Metro (o el log del dispositivo).
3. Recorre las pantallas abajo; en cada paso debería aparecer **un objeto** con los campos indicados.

## Tab Mis Tarjetas (`app/(tabs)/cards.tsx`)

| Momento | Tag del log | Qué revisar |
|--------|-------------|----------------|
| Cada vez que **cambia el contenido** de las listas o los cuatro campos del emisor listados abajo | `cards:tab — listas (Smart + Business + emisor)` | **issuer:** `userFullName`, `userNickName`, `userAvatarUrl`, `voipCanonicalFullName`. **smartCards[]:** `sid`, `scName`, `ownerDisplayName`, `issuerSnapshotUserAvatarUrl`. **businessCards[]:** `bId`, `bcName`, `bcContactName`, `bcLogoUrl`. *No repite líneas idénticas: deduplicación por huella JSON del payload.* |
| Abrir preview **Smart** | `cards:modal — preview Smart (MyCards)` | `sid`, `scName`, `ownerDisplayName`, `issuerSnapshot` (avatar/nombre en snapshot). |
| Abrir preview **Business** | `cards:modal — preview Business` | `bId`, `bcName`, `bcContactName`, `bcLogoUrl`. |

## Contactos (`app/(tabs)/contacts.tsx`)

| Momento | Tag del log | Qué revisar |
|--------|-------------|----------------|
| Tras cargar la lista (no en loading inicial vacío duplicado innecesario: cuando `loading` pasa a false) | `contacts:tab — lista agregada` | **rows[]:** `linkKey`, `cardType`, `userFullName`, `userNickName`, `userAvatarUrl`, `cardName`, `bcName`, `bcContactName`, `bcLogoUrl`, `ownerPhotoUrl`. |
| Abrir el modal de tarjeta (preview receptor) | `contacts:modal — MyCardsPreview receptor` | Mismos campos de fila + **payloadPreview:** `cardName`, `subtitle`, `avatarUrl` (espejo de `MyCardsPayload` para la UI). |

## Calls (`app/(tabs)/calls.tsx`)

| Momento | Tag del log | Qué revisar |
|--------|-------------|----------------|
| Cargado el historial (lista visible) | `calls:tab — historial` | **rows[]** por `callId`: `direction`, `ui` (título, subtítulo, avatar, badge, línea de log), `raw` (API: `userAvatarUrl`, `peerFullName`, `userFullName`, `cardName`, `scName`, `displayCardName`, `bcName`, `display`). Si **saliente** y hay contacto: **outgoingMirror** (`outgoingMirrorFromCallHistoryOutgoing` — contrato Smart saliente). |
| Abrir modal de detalle (tap en una fila) | `calls:modal — detalle llamada` | `ui`, `display`, `outgoingMirror` (solo saliente). |
| Pulsar **vídeo** o **voz** en una fila | `calls:action — Llamar (video)` / `calls:action — Llamar (audio)` | **imperativeBase** (lo que llega a Ghost-Link), **outgoingMirror** (solo si `direction === 'outgoing'`). |

## Ghost-Link overlay (`components/GhostLinkCallOverlay.tsx`)

Metro también muestra `☎️ VOIP REQUEST_CALL DATA` desde `GhostLinkCallProvider` (antes de Confirm). Los de prueba con **`[CS-identity-test]`**:

| Momento | Tag | Qué revisar |
|--------|-----|-------------|
| Pantalla **Confirmar** (antes de marcar) | `voip:call_view — confirm` | `titleBold`, `subtitleLine`, `bcContactName` (negocio), `ringUrl`, `isBusiness`. |
| Vista **saliente** (marcando / en llamada audio) | `voip:call_view — outgoing` | Igual + `phase`. |

**Business:** el subtítulo en UI es `bcContactName`; debe llegar en `requestCall` (contactos: `ghostCardContactName` en `MyCardsPreviewModal`; historial: fallback desde contacto `bcContactName` si la fila no lo trae).

## Desactivar los logs

En `services/identityManualTestLogs.ts`, pon `IDENTITY_MANUAL_TEST_LOGS_ENABLED` en `false` (sigue compilando; no imprime nada).

## Referencias de contrato

- Smart saliente / historial: `services/outgoingCallUiMirror.ts`, `docs/CONTRACT_SMART_CARDS.md`.
- VoIP flujo: `docs/GHOSTLINK_VOIP_FLOW.md`.
