# Especificación: historial de llamadas (Ghost-Link) — salientes, entrantes y UI

Documento de referencia. La **§2 (salientes)** describe **exactamente** la lógica implementada en el repo a día de hoy (incluye fragmentos de código copiados del código fuente).

---

## 1. Resumen

- **Backend (Mongo `call_logs` + `GET /api/qr/calls/history`)**: enriquece cada fila con `userAvatarUrl`, `displayCardName`, `displayCardIsBusiness`, `emitterCardContactName`, `peerPersonalName`, `peerFullName`, etc.
- **Registro (`POST /api/qr/calls/logs`)**: persiste `emitterCardPhotoUrl` (snapshot desde la app al colgar).
- **App**: `app/(tabs)/calls.tsx` pinta **avatar + 3 líneas de texto** (título + tipo, subtítulo, logs) y botones de acción; en **saliente** el subtítulo **no** muestra caracteres `@` (se eliminan antes de pintar).

---

## 2. Llamadas salientes (`direction === 'outgoing'`) — lógica canónica

Contexto: **yo llamo** a otra persona desde una tarjeta Ghost-Link. El dueño del log es el emisor (`row.uid` = `logViewerUid`). La tarjeta emisora se resuelve con `cardEmitterUid = logViewerUid` y `bridgeKey = sourceSid || sourceBId` contra `smart_cards`.

### 2.1 Imagen (`userAvatarUrl` en la respuesta del historial)

**Negocio** (`emitterIsBusiness` verdadero): solo logo / foto de tarjeta — **no** se usa la foto personal del emisor desde perfil.

**Smart** (`emitterIsBusiness` falso, `sourceBId` típicamente null): orden de preferencia:

1. `emitterCardPhotoUrl` del documento `call_logs` (snapshot Ghost-Link al colgar).
2. `userAvatarUrl` del perfil Mongo del emisor (`resolveUserProfileExtended`), que fusiona `users`/`profiles` y usa **`userAvatarUrl` o, si vacío, `photoUrl`** (ver `backend/src/lib/extendedUserIdentity.js`, `pickAvatarUrl`).
3. `ownerPhotoUrl` de `smart_cards` para esa tarjeta emisora (`cardPhoto`).

Código en `backend/src/routes/qrRoutes.js` (dentro de `GET /calls/history`):

```javascript
if (direction === 'outgoing') {
  const emitterProfile = await resolveUserProfileExtended(db, logViewerUid);
  const cardPhoto = sourceCard ? String(sourceCard.ownerPhotoUrl || '').trim() : '';
  const snapEmitter = String(row.emitterCardPhotoUrl || '').trim();
  if (emitterIsBusiness) {
    userAvatarUrl = cardPhoto || snapEmitter || null;
  } else {
    const fromProfile = String(emitterProfile.userAvatarUrl || '').trim() || null;
    userAvatarUrl = snapEmitter || fromProfile || cardPhoto || null;
  }
}
```

### 2.2 Título (negrita) y tipo — campo `displayCardName` + `displayCardIsBusiness`

- El **título** que muestra la app es `item.displayCardName` (con fallback a `sourceCardName` si hiciera falta).
- Para **saliente** con `sourceCard` cargado: `displayCardName = readSmartCardScName(sourceCard) || displayCardName` y `uiIsBusiness` sale del `cardType` de esa tarjeta.

```javascript
} else if (!incomingLike && sourceCard) {
  uiIsBusiness = String(sourceCard.cardType || '').toLowerCase() === 'business';
  displayCardName = readSmartCardScName(sourceCard) || displayCardName;
} else if (!incomingLike && !sourceCard) {
  uiIsBusiness = emitterIsBusiness;
}
```

(`readSmartCardScName` = `scName` en Mongo `smart_cards`; en negocio equivale al nombre de negocio / `bcName` en datos.)

La etiqueta de tipo en UI usa `displayCardIsBusiness`: **Negocio** vs **Smart Card** (`app/(tabs)/calls.tsx`, función `callsHistoryRowLines`).

### 2.3 Subtítulo — `emitterCardContactName` vs nombre del receptor

En API:

- **Saliente + negocio** (`uiIsBusiness`): `emitterCardContactName = sourceCard.ownerDisplayName` (≈ `bcContactName` en producto).
- **Saliente + smart**: no se envía `emitterCardContactName`; el subtítulo en app usa **`peerPersonalName`** y si falta **`peerFullName`**.

```javascript
/** Saliente + tarjeta negocio: subtítulo = contacto en tarjeta (Mongo ownerDisplayName ≈ bcContactName). */
let emitterCardContactName = null;
if (!incomingLike && uiIsBusiness && sourceCard) {
  const ec = String(sourceCard.ownerDisplayName || '').trim();
  emitterCardContactName = ec || null;
}
```

En cliente, `callsHistoryRowLines` (saliente):

```typescript
} else {
  /** Saliente: negocio → bcContactName; smart (sid) → FullName del receptor. */
  if (cardIsBiz) {
    const ec =
      item.emitterCardContactName != null && String(item.emitterCardContactName).trim()
        ? String(item.emitterCardContactName).trim()
        : '';
    personLine = ec || CALLS_LINE_EMPTY;
  } else {
    personLine =
      item.peerPersonalName.trim().length > 0
        ? item.peerPersonalName.trim()
        : item.peerFullName.trim().length > 0
          ? item.peerFullName.trim()
          : CALLS_LINE_EMPTY;
  }
}
```

Antes de devolver la fila, el subtítulo pasa por **`subtitleStripAt`** (quita `@`):

```typescript
function subtitleStripAt(raw: string): string {
  const s = raw.replace(/@/g, '').trim();
  return s.length > 0 ? s : CALLS_LINE_EMPTY;
}
```

### 2.4 Logs (tercera línea)

`logLine = [dirLabel, clockStr, durStr].join(' · ')` con `dirLabel` **Saliente** / **Outgoing**, hora 24h y duración `m:ss`.

### 2.5 App: avatar en lista y modal si el API no trae URL (saliente)

Si `userAvatarUrl` viene vacío (Mongo incompleto), la pantalla **Calls** usa la misma foto que el header de tabs: **Firestore `users/{uid}` + `auth.photoURL`** vía `resolveProfileAvatarDisplayUri`.

```typescript
const avatarUri =
  item.direction === 'outgoing'
    ? toRenderableImageUri(item.userAvatarUrl) ?? toRenderableImageUri(selfAvatarDisplayUri)
    : toRenderableImageUri(item.userAvatarUrl) ?? toRenderableImageUri(contact?.userAvatarUrl ?? null);
```

Modal de detalle (saliente):

```typescript
const detailAvatarUri =
  selectedCall != null
    ? selectedCall.direction === 'outgoing'
      ? toRenderableImageUri(selectedCall.userAvatarUrl) ?? toRenderableImageUri(selfAvatarDisplayUri)
      : toRenderableImageUri(selectedCall.userAvatarUrl) ??
        toRenderableImageUri(selectedContact?.userAvatarUrl ?? null)
    : null;
```

`selfAvatarDisplayUri` se actualiza con `onAuthStateChanged` + `onSnapshot(doc(db, 'users', user.uid), ...)`.

### 2.6 Registro al colgar (`createCallLog`)

`services/GhostLinkCallProvider.tsx` envía entre otros:

- `isBusinessCard: cd.card.cardType === 'business'`
- `sourceSid`, `sourceBId`, `sourceCardName`
- `emitterCardPhotoUrl: cd.card.cardPhoto ?? null`

En **Calls**, al relanzar llamada desde la fila: `cardPhoto: item.userAvatarUrl ?? selfAvatarDisplayUri ?? null` para que el próximo log pueda guardar URL aunque el historial venga sin foto.

---

## 3. Llamadas entrantes (`incoming` / `missed`) — referencia breve

- **Imagen:** base `peerProfile` (quien llama); con `sourceCard` se puede enriquecer con `ownerPhotoUrl` según tipo.
- **Título / tarjeta local:** rama `incomingLike && localViewerCard` en `qrRoutes.js`.
- **Subtítulo en app:** `peerPersonalName` (entrante), también con `subtitleStripAt` para quitar `@`.

---

## 4. UI pantalla Calls (`app/(tabs)/calls.tsx`)

### 4.1 Estructura de cada fila

| Zona        | Contenido                                              |
|------------|---------------------------------------------------------|
| Izquierda  | Avatar (anillo VIP/story opcional)                      |
| Centro     | Tres líneas: título + tipo, subtítulo, logs             |
| Derecha    | Dos botones horizontales (vídeo + voz)                  |

### 4.2 Línea 1 — Título

`cardTitleBold` desde `displayCardName`; tipo `cardKindSmall`; vídeo opcional ` · Vídeo` / ` · Video`; icono de dirección con colores acordados.

### 4.3 Línea 2 — Subtítulo

Contenido según **`callsHistoryRowLines`** (ver §2.3). **Saliente:** negocio → `emitterCardContactName`; smart → `peerPersonalName` / `peerFullName`. Sin `@` en pantalla.

### 4.4 Línea 3 — Logs

Misma cadena `logLine` que §2.4.

### 4.5 Avatar

- `toRenderableImageUri` (`services/userProfilePhoto.ts`).
- **Entrante:** fallback al contacto mismo `peerUid` si falta URL en el ítem.
- **Saliente:** fallback a **`selfAvatarDisplayUri`** (Firestore + auth), **no** al avatar del contacto (sería el peer).

### 4.6 Botones, tarjeta contenedora, estilos

Sin cambio respecto al diseño ya listado (colores `#C8A84E` / `#1B6B3A`, bordes, etc.).

### 4.7 Modal de detalle

Misma regla de avatar que §2.5 (`detailAvatarUri`).

---

## 5. Archivos clave

| Área | Archivo |
|------|---------|
| Historial + POST logs | `backend/src/routes/qrRoutes.js` |
| Avatar Mongo (`userAvatarUrl` / `photoUrl`) | `backend/src/lib/extendedUserIdentity.js` |
| Cliente API + tipo | `services/qrApi.ts` (`CallHistoryRow`, `listCallsHistory`) |
| Log al colgar | `services/GhostLinkCallProvider.tsx` |
| Pantalla Calls | `app/(tabs)/calls.tsx` |
| URLs avatar | `services/userProfilePhoto.ts` |

---

## 6. Nota

Cualquier cambio en la lógica **saliente** debe actualizar **esta §2** y el código citado para seguir siendo la fuente de verdad.
