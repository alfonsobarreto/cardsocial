# Contrato — Smart Cards (tarjetas personales `cardType: 'smart'`)

El documento canónico está en [`docs/GOLDEN_RULE_SMART_VS_BUSINESS.md`](./GOLDEN_RULE_SMART_VS_BUSINESS.md). **Lo siguiente se imprime aquí como contrato ejecutable.**

---

## REGLA DE ORO (copia de contrato — Smart)

- **= DATOS DE PERFIL** (y lo que la tarjeta personal enlaza: bóveda, facets, tema, etc.).
- **NADA DE BUSINESS CARDS:** ningún `bId`, `bcName`, `bcLogoUrl`, colección `business_cards`, ni lógica de marca negocio en pantallas o payloads **solo** Smart.
- **Nombre legible del tema (shell Chest):** `getThemeById(themeId).name` → `CardTheme.name` en `constants/themeChest.ts`. Ese es el nombre del estilo base; no confundir con capa opcional de imagen de fondo (`wallpaperUrl`) en Smart.

---

Documento de referencia: **qué es fuente de verdad**, qué se denormaliza y qué revisar cuando algo se rompe (tema, avatar, receptores, calificaciones).

**Código relacionado:** `SmartCardPayload`, `IssuerSnapshotPayload` en `services/qrApi.ts`; colección Mongo `smart_cards`; permisos en `share_permissions`; perfiles en `users` / API de perfil extendido.

---

## 1. Identidad del emisor (dueño de la tarjeta)

| Concepto | Dónde vive la verdad absoluta | Qué se guarda en `smart_cards` (denormalizado) |
|----------|-------------------------------|-----------------------------------------------|
| `uid` | Cuenta Firebase / documento tarjeta `ownerUid` | Siempre presente implícitamente en queries por dueño |
| `userFullName`, `userNickName`, `userAvatarUrl` (persona) | Perfil Mongo (`users` / `resolveUserProfileExtended` — misma idea que API contactos) | Espejos: `ownerDisplayName`, `ownerNickname`, `ownerPhotoUrl` **solo** para payload/QR legacy; snapshot canónico en `issuerSnapshot` (`userFullName`, `userNickName`, `userAvatarUrl`) |
| Iconos elegidos en bóveda (los que “salen” en la tarjeta) | Firestore `users/{uid}/links` + orden `itemIds` en tarjeta | `itemIds` + materialización pública `publicCardSlots` (+ `issuerSnapshot.userVaultPicked` cuando aplica) |

**Regla:** La **foto de persona** no debe confundirse con la imagen del wireframe de tarjeta (`ownerPhotoUrl` en doc Mongo es la imagen **del documento tarjeta**, no el sustituto del avatar de perfil en contactos). Ver `docs/IDENTITY_PHASE_D_AUDIT.md`.

---

## 2. Presentación en vivo (tema Chest, layout, tipografía; fondo opcional Smart)

| Campo | Verdad para “cambio en vivo” |
|-------|------------------------------|
| `themeId` | Persistir desde la fábrica; shell = catálogo Chest; **nombre legible** = `CardTheme.name` (`getThemeById(themeId).name`). |
| `layout`, `fontId` / `fontName` / `fontFamily` / `fontTier` | Parte del snapshot visual. |
| `wallpaperId`, `wallpaperUrl`, `wallpaperThumbUrl`, `wallpaperTier`, `wallpaperPriceCredits`, `enableParallax` | **Solo Smart:** capa opcional de imagen/parallax **además** del tema; no sustituye al nombre del tema (`CardTheme.name`). **No aplica a Business** (ver contrato Business). |

**Verdad absoluta para auditoría:** `updatedAt` (Mongo) y `cardUpdatedAt` en cliente para fusionar diseño remoto vs caché.

---

## 3. Receptores (quién tiene la tarjeta)

| Necesidad | Fuente de verdad | Notas |
|-----------|------------------|--------|
| **Cuántos** receptores activos | Agregación sobre `share_permissions` (no revocados / vigentes) — el backend usa esto frente a `holdersCount` denormalizado en `smart_cards` | `holdersCount` en `smart_cards` puede cachearse; la cuenta autoritativa es permisos. |
| **Lista** de receptores (contactos) | API de contactos / permisos según producto | |
| **Cuándo se agregó** cada uno | Ideal: timestamp en `share_permissions` (o log de evento) como **log append-only** | Si hoy solo hay `createdAt` del permiso, documentarlo explícitamente en backend como “addedAt”. |
| **Silenciado** (receptor silencia canal/historias de esa tarjeta) | Colección tipo `card_subscriber_mutes` (ver `qrRoutes.js`) | No mezclar con “bloqueo global”. |
| **Bloqueo** relación | Endpoints `blockRelationship` / estado en API de relaciones | |
| **Eliminado / revocado** | Permiso revocado o borrado + consistencia en listas | |

**Recomendación de contrato:** cada fila de permiso debería exponer como mínimo: `issuerUid`, `receiverUid`, `sid` (o `bId`), `grantedAt`, `revokedAt?`, `source?` (qr / universal / market).

---

## 4. Calificaciones (qualifications / ratings)

| Campo típico en `smart_cards` | Uso |
|-------------------------------|-----|
| `ratingAvg`, `totalRatings` | Denormalizado para UI rápida; la verdad fina puede estar en colección de ratings si existe. |

**Verdad absoluta:** definir si el **rating** se calcula solo desde eventos inmutables (voto por `receiverUid` + `sid`) y luego se proyecta a `smart_cards`, o si el doc de tarjeta es la única fuente (más frágil).

---

## 5. Búsqueda y descubrimiento

| Campo | Rol |
|-------|-----|
| `searchFacets` | Facetas no teléfono para deep search en contactos del receptor. |
| `ownerOccupation` | Texto de cargo en tarjeta (receptor). |

---

## 6. Vista pública / QR (subset seguro)

| Campo | Rol |
|-------|-----|
| `publicCardSlots` | Solo datos públicos; backend filtra `isPrivate` / `visibility`. |
| Tokens QR / universal | Fuera de este doc; ver rutas `/api/public/universal-card` y `qrApi` público. |

---

## 7. Checklist cuando “se rompe” algo

1. **Tema no actualiza en receptor:** ¿sube `cardUpdatedAt` / `updatedAt` en Mongo? ¿el cliente aplica `mergeReceivedContactRows`? ¿hay meta local (`scanThemeId`) vieja que pise el API? (historial: contactos ya no deben pisar tema con scan; ver commits recientes.)
2. **Avatar incorrecto:** ¿API contactos mezcla `ownerPhotoUrl` con `userAvatarUrl`? ¿seed de bunker guardó logo como persona?
3. **Conteo de receptores:** comparar `share_permissions` vs `holdersCount` denormalizado.
4. **Iconos viejos:** ¿`itemIds` y `publicCardSlots` regenerados tras editar bóveda?

---

## 8. Qué más guardar como “verdad absoluta” (recomendado)

Además de lo que listaste, conviene fijar explícitamente:

- **`sid`** (clave estable de la smart card) y relación 1:1 con permisos.
- **`issuerSnapshot.snapshotVersion` + `snapshotAt`** (o equivalente) para invalidar cachés y depurar drift.
- **Evento de alta de receptor** (`grantedAt` / log) si necesitás auditoría legal o soporte.
- **Versión de esquema** del documento `smart_cards` (un `schemaVersion` entero) para migraciones.
- **Estado de tarjeta:** `active | archived | deleted` si no está ya modelado (evita “fantasmas” en listados).

Este documento no reemplaza OpenAPI; es el **contrato conceptual** que el equipo puede revisar cuando el producto o el backend cambien.

---

## 9. React Native — qué se ve hoy (Smart Cards)

Referencia de **pantallas y campos tal como están implementados** (abril 2026). Si cambiás `app/(tabs)/cards.tsx` en el preview/listado smart, revisá **contactos**, **búsqueda** y **llamadas** para el mismo criterio de identidad/tema.

### 9.1 Modal vista previa — Mis Tarjetas (emisor, `MyCardsPreviewModal` + `previewPayload`)

| # | Campo visual | Origen en código |
|---|----------------|-------------------|
| 1 | Tema / fondo / parallax | `previewCard.themeId`, `wallpaperUrl`, `enableParallax`, layout |
| 2 | Avatar círculo | `issuerIdentity.userAvatarUrl` (perfil dueño, mismo `uid`) |
| 3 | Título | `previewCard.scName` (nombre de la tarjeta) |
| 4 | Subtítulo | `@` + `issuerIdentity.userNickName` en minúsculas |
| 5 | Rating / medallas | `holdersCount`, `ratingAvg`, `totalRatings`; medallas / `MedalRatingModal` desde el modal (flujo existente) |
| 6 | Bóveda (slots) | Items derivados del vault + `previewSlots` |

**Archivo:** `app/(tabs)/cards.tsx` → `previewPayload` (`useMemo`).

### 9.2 Modal espejo — Contactos / Búsqueda (receptor, smart)

Misma forma `MyCardsPayload`: tema desde fila contacto, wireframe con `publicCardSlots` espejados.

| # | Campo visual | Origen en código (`contactPayload` en `contacts.tsx`) |
|---|----------------|--------------------------------------------------------|
| 1 | Tema | `selectedContact.themeId`, wallpaper, layout |
| 2 | Avatar | `selectedContact.userAvatarUrl` (persona; API) |
| 3 | Título del modal (`cardName`) | `cardName` de la fila compuesto: `cardName \|\| userFullName \|\| occupation \|\| fallback` |
| 4 | Subtítulo | **Solo Smart:** `@userNickName` (con `@` si falta). **Business** no usa `@` (ver contrato Business). |
| 5 | Rating / + medallas | `ratingAvg`, `totalRatings`; mismo modal de medallas que Mis Tarjetas cuando aplica |
| 6 | Bóveda | `buildMirrorVaultItemsForContact` → slots |

**Búsqueda (`search.tsx`):** filas “contactos recibidos” usan `ThemedSharedCardSurface` + tema `issuerPresentation`; preview al abrir tarjeta alineado al mismo contrato de datos.

### 9.3 Lista — Mis Tarjetas (`cards.tsx`, fila smart)

| # | Qué muestra | Notas |
|---|-------------|--------|
| 1 | `scName` | Título principal de la fila |
| 2 | Nombre del **tema** (metadata Chest) | Subtítulo bajo el título; no es el `themeId` crudo |
| 3 | Pill receptores (`holdersCount`) | Clic abre modal de receptores / suscriptores de esa `sid` |
| 4 | Icono estadísticas | Clic → analytics (no es el mismo modal que receptores) |
| 5 | Corazón favorito | `isFavorite` / `toggleFavoriteCard` |

### 9.4 Lista — Contactos (`contacts.tsx`, fila smart / mixta)

| # | Qué muestra |
|---|-------------|
| 1 | `userAvatarUrl` (persona) |
| 2 | **Primera línea nombre:** `userFullName` |
| 3 | Opcional: `ownerOccupation` |
| 4 | `cardName` (nombre de la tarjeta smart) |
| 5 | Pill receptores (mismo patrón clickable) |
| 6 | Story ring / muted según meta |

**Nota:** En esta lista **no** hay QR en filas **smart**; el QR permanente de **business** está en Mis Tarjetas, Búsqueda mercado y —desde alineación de producto— también en filas **business** de Contactos (ver `CONTRACT_BUSINESS_CARDS.md` §10.4).

### 9.5 Lista — Búsqueda, contactos recibidos (`search.tsx`)

Alineado a contactos: avatar = `receivedIssuerUserAvatarUrl`, nombre `bcName`/`userFullName` según fila, `cardTitle`, pill receptores, facets. Tema desde `issuerPresentation.themeId`.

### 9.6 Historial de llamadas (`app/(tabs)/calls.tsx`, filas **Smart**)

Badge lateral: **«Smart Card»**. Avatar en fila: prioriza `userAvatarUrl` / contacto / `issuerSnapshot`.

| # | Slot UI | Campos contrato (saliente **outgoing** Smart) |
|---|---------|-----------------------------------------------|
| Imagen | `userAvatarUrl` del contacto al que llamaste | Misma prioridad fila + contacto + `issuerSnapshot.userAvatarUrl` |
| Título | `cardName` | `CallHistoryRow.cardName` → `scName` → `displayCardName` → `sourceCardName` |
| Subtítulo | `userFullName` | `CallHistoryRow.userFullName` → `peerFullName` → `peerPersonalName` |
| Log | Dirección · hora · duración | `callsHistoryLogLine` |
| Acciones | Vídeo / voz | `requestGhostLinkCallImperative` |

**Implementación:** `outgoingMirrorFromCallHistoryOutgoing` en `services/outgoingCallUiMirror.ts` (variables locales `userAvatarUrl`, `cardName`, `userFullName` → slots `ringUrl` / `titleBold` / `subtitleLine`).

#### 9.6.1 Saliente Smart — misma regla en Confirm / Outgoing / FaceCall (caller)

| Slot UI | Variable contrato | Origen sesión `GhostCallData` |
|---------|-------------------|-------------------------------|
| Imagen | `userAvatarUrl` | `peerPhotoUrl` (avatar del contacto) |
| Título | `cardName` | `card.cardName` (preservado tras `startGhostLinkVoipCall` en personal) |
| Subtítulo | `userFullName` | `peerFullName` (fallback `peerName`) |

**Implementación:** `outgoingMirrorFromGhostCallData` → mismos nombres locales `userAvatarUrl`, `cardName`, `userFullName` antes de mapear a `OutgoingCallUiMirror`.

#### 9.6.2 Entrante / perdida Smart (`incoming` | `missed`)

| # | Slot UI | Campos contrato |
|---|---------|-----------------|
| Imagen | `userAvatarUrl` | Del **caller** (`item.userAvatarUrl` → contacto → snapshot) |
| Título | `cardName` | **Tu** smart card: `cardName` → `scName` → `displayCardName` → `sourceCardName` (backend alinea `displayCardName` al receptor cuando aplica) |
| Subtítulo | `userFullName` | Del caller: `userFullName` → `peerFullName` → `peerPersonalName` |

**Lista:** `callsHistoryIncomingRowUi` (rama no business). **`display` API:** `buildDisplayForHistoryRow` smart + `incomingLike` en `qrRoutes.js` (`displayTitle` = tarjeta, `displaySubtitle` = caller).

#### 9.6.3 Timbre / llamada activa entrante (solo Smart, `cardType: 'personal'`)

| Slot UI | Origen `GhostCallData` / invite |
|---------|----------------------------------|
| Imagen | `peerPhotoUrl` (= `userAvatarUrl` del caller) |
| Título | `card.cardName` (= **tu** tarjeta; GET `/voip/ghost-link/incoming` enriquece con `smart_cards` del **receptor**) |
| Subtítulo | `peerFullName` (nombre completo caller) |

**UI:** `deriveCallFace` + `IncomingView` / `ActiveIncomingView` / FaceCall (`GhostLinkCallOverlay.tsx`). Sin pastilla «Desde tu tarjeta» duplicada en Smart (sí en Business).

### 9.7 Coherencia entre pantallas

- Cambios de **tema** en fábrica deben reflejarse vía `cardUpdatedAt` + API en receptor (`mergeReceivedContactRows`).
- **Avatar persona** en contactos viene del API; no mezclar con foto de documento tarjeta.

---

## 10. Diferencias vs expectativa (QR en Contactos)

- **Expectativa mencionada:** QR permanente de business en la **lista de `contacts.tsx`**.
- **Código actual:** **no** hay `QRCode` en `contacts.tsx`. El QR negocio permanente está en **`cards.tsx`** (lista business del emisor) y en **`search.tsx`** (tarjetas Social Market negocio). Si se requiere el mismo QR en la lista de Contactos del receptor, es un **trabajo pendiente explícito**, no solo documentación.
