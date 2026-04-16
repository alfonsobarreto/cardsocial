# Identidad de usuario, Smart Cards y Business Cards — campos canónicos

Este documento resume:

1. **Perfil** (`userFullName`, `userNickName`, `userAvatarUrl`) en app, Firestore, API QR y Mongo.
2. **Tarjetas de negocio (Firestore `businessCards`)** con prefijo `bc*` (`bcName`, `bcContactName`, `bcLogo`, `bcLogoUrl`).
3. **Smart Cards (Mongo `smart_cards` vía API)** — nombre persistido vs nombre en UI de preview.

---

## 1. Campos canónicos (fuente de verdad)

| Campo | Uso |
|--------|-----|
| **`userFullName`** | Nombre completo visible del usuario. |
| **`userNickName`** | Handle / apodo (sin `@` obligatorio en lógica; la UI puede mostrarlo con `@`). |
| **`userNickNameLower`** | Versión en minúsculas para búsquedas e índices (paralelo a `nicknameLower` legacy donde aplica). |
| **`userAvatarUrl`** | URL pública de la **foto de perfil** del usuario. **Único** nombre para ese dato en lectura/escritura nuevas. |

Los documentos pueden seguir teniendo campos legacy; la estrategia depende del campo (ver secciones 3 y 4).

---

## 2. App / Firestore — `services/userIdentityFields.ts`

### Nombres

- **`readUserFullName`**: prioriza `userFullName`, luego fallback de lectura: `fullName`, `firstName`+`lastName`, `displayName`, `name`, y por defecto `"Usuario"`.
- **`readUserNickName`**: `userNickName` o `nickname` (legacy).
- **`readUserNickNameLower`**: `userNickNameLower`, `nicknameLower`, o derivado del nick leído.
- **`firestoreUserFullNameWrite`**: escribe `userFullName` y espejo **`fullName`**.
- **`firestoreUserNickNameWrite`**: escribe `userNickName`, `userNickNameLower`, y espejos **`nickname`**, **`nicknameLower`** (compatibilidad con índices/consultas existentes).
- **`firestoreFirstUserDocByNickLower`**: busca primero por `userNickNameLower`, luego por `nicknameLower`.

### Avatar (cambio principal respecto a `userAvatar`)

- **Antes (eliminado como canónico):** `userAvatar` y lecturas que mezclaban `photoUrl`, `avatarUrl`, `profilePhoto`.
- **Ahora:**
  - **`readUserAvatarUrl`**: solo lee **`userAvatarUrl`** (sin cadena de fallbacks).
  - **`firestoreUserAvatarUrlWrite`**: escribe **`userAvatarUrl`** y con **`deleteField()`** elimina: `userAvatar`, `photoUrl`, `avatarUrl`, `profilePhoto`.

---

## 3. Backend Mongo — fusión `users` + `profiles`

**Archivo:** `backend/src/lib/extendedUserIdentity.js`

- **`mergeUsersAndProfilesDocuments`**: incluye `userFullName`, `fullName`, nombres, `userNickName`, `nickname`, lowers, y **`userAvatarUrl`** únicamente para la foto de perfil (ya no se arrastran `photoUrl` / `avatarUrl` / `profilePhoto` en el objeto fusionado).
- **`buildMongoExtendedProfileFields`**: expone `fullName`, `username`, `name`, `nickname` y **`userAvatarUrl`** (string recortado o `null`). El avatar sale **solo** de `merged.userAvatarUrl`.

**Nota:** Registros que solo tengan fotos en campos viejos y no hayan migrado a `userAvatarUrl` devolverán avatar `null` en API hasta backfill o hasta que el usuario vuelva a guardar la foto desde la app.

---

## 4. Contactos y suscriptores — sin mezclar foto de tarjeta en el perfil

**Archivo:** `backend/src/lib/contactIdentityMerge.js`

- Enriquecimiento de nombre desde `smart_cards` (`ownerDisplayName`, `ownerNickname`) se mantiene donde aplica.
- **Avatar de perfil:** solo **`userAvatarUrl`** del perfil Mongo fusionado. **No** se rellena con `ownerPhotoUrl` de la tarjeta ni se fusiona “card photo” en el campo de avatar de usuario.

---

## 5. API QR — JSON y proyecciones

**Archivo:** `backend/src/routes/qrRoutes.js`

- Perfiles y listas que exponían **`userAvatar`** pasan a exponer **`userAvatarUrl`** (misma semántica: URL de foto de perfil).
- Proyecciones Mongo para avatar: **`userAvatarUrl`** (sin proyectar `photoUrl` / `avatarUrl` / `profilePhoto` para ese fin).
- Ghost-Link (`callerDisplay` / `receiverDisplay`): **`userAvatarUrl`** (sin fallback a `photoUrl` en la respuesta normalizada).
- Historial de llamadas (`/calls/history`): campo **`userAvatarUrl`** solo desde perfil; sin sustituir por foto de tarjeta.

**`cardPhoto`** en payloads de Ghost-Link sigue siendo la imagen del **puente de la tarjeta** (concepto distinto del avatar de perfil).

---

## 6. Cliente TypeScript — archivos tocados (avatar → `userAvatarUrl`)

- **`services/qrApi.ts`**: tipos y parseo de filas con **`userAvatarUrl`**.
- **`services/ghostLinkVoip.ts`**: `callerDisplay` / `receiverDisplay` con **`userAvatarUrl`** (sin fallback a `photoUrl`).
- **`services/GhostLinkCallProvider.tsx`**: `peerPhotoUrl` desde **`userAvatarUrl`** del display.
- **`services/relationshipService.ts`**: documentos de relación y lectura con **`readUserAvatarUrl`**; campo **`userAvatarUrl`**.
- **`services/searchService.ts`**: filas con **`userAvatarUrl`**.
- **`services/userProfilePhoto.ts`**: usa **`readUserAvatarUrl`**.
- **Pantallas / componentes:** `app/(tabs)/_layout.tsx`, `myprofile.tsx`, `register.tsx`, `createBusinessCard.tsx`, `cards.tsx`, `stories.tsx`, `calls.tsx`, `contacts.tsx`, `search.tsx`, `components/ReceptorScreenModal.tsx`, comentario en `app/scan.tsx`.

---

## 7. Resumen ejecutivo

| Tema | Decisión |
|------|-----------|
| Nombre completo | Canónico: **`userFullName`**; escritura con espejo **`fullName`**; lectura con fallbacks legacy en app. |
| Nick | Canónico: **`userNickName`** + **`userNickNameLower`**; espejos **`nickname`** / **`nicknameLower`** al escribir. |
| Foto de perfil | **Solo `userAvatarUrl`**. **`userAvatar`** y otros nombres de foto se borran al escribir en Firestore; API y merge Mongo alineados con **`userAvatarUrl`**. |
| Foto de tarjeta / negocio | No entra en **`userAvatarUrl`**; sigue en campos de tarjeta (`cardPhoto`, logos de negocio, etc.). |

---

## 8. Business Cards (Firestore `businessCards`)

| Campo | Uso |
|--------|-----|
| **`bcName`** | Título / nombre de la tarjeta business (antes `businessName`). |
| **`bcContactName`** | Nombre de contacto (antes `ownerName`); en formulario: “Nombre de contacto” / “Contact name”. |
| **`bcLogo`** | Solo en **React state** en `createBusinessCard.tsx`: imagen local / pendiente de subir (crop, `file://`, etc.). |
| **`bcLogoUrl`** | URL pública del logo guardada en Firestore y enviada al backend/Mongo al sincronizar. |

- **Escritura nueva:** solo `bcName`, `bcContactName`, `bcLogoUrl` en el documento Firestore.
- **Lectura:** `readBusinessCardIdentityFields()` en `services/businessCardService.ts` devuelve `bc*` y acepta claves legacy (`businessName`, `ownerName`, `businessLogo`) hasta que cada documento se vuelva a guardar.
- **Al actualizar** identidad en `updateBusinessCard`, se envían `deleteField()` sobre `businessName`, `ownerName`, `businessLogo`.
- **Sincronía con Mongo:** al subir/actualizar business, el payload de `smart_cards` usa **`scName: bcName`**, `ownerDisplayName` / `ownerNickname: bcContactName`, `ownerPhotoUrl: bcLogoUrl`.

**Archivos clave:** `types/businessCard.ts`, `services/businessCardService.ts`, `app/(tabs)/createBusinessCard.tsx`, `app/(tabs)/cards.tsx`, `app/(tabs)/search.tsx`, `services/searchService.ts`, `services/storiesFeedInjectionService.ts`, `services/adaptBusinessCardMarketPremium.ts`, `services/brandedQrService.ts`, `app/scan.tsx`, tests `scripts/test-search-phase2.ts`, `__tests__/qaExpressFieldTests.ts`.

---

## 9. Smart Cards — nombre canónico `scName`

- **MongoDB** (`smart_cards`): campo **`scName`**. El **`PUT`** solo usa **`scName`** en el body; se hace `$unset` de `name` en el documento. Documentos que aún tengan solo `name` deben migrarse (`backend/scripts/migrate-smart-cards-scname.js`) o volver a guardarse desde la app.
- **API / app (`SmartCardPayload` en `services/qrApi.ts`):** **`scName`** en listado y upsert.
- **Estado local en Mis Tarjetas (`SmartCard` en `cards.tsx`):** **`scName`**. La caché AsyncStorage se migra en `readSmartCardsJsonWithLegacyMigration` (`migrateSmartCardsJsonNameToScName`).
- **Vista previa wireframe (`MyCardsPayload`):** sigue usando **`cardName`** (título de UI), no el mismo identificador que Mongo.

**Nota:** Las Smart Cards **no** se guardan en Firestore; Firestore lleva **Business Cards** (`bc*`). Para búsqueda global del mismo nombre, usa **`scName`** en Mongo + app + web pública (`PublicUniversalCardPayload.scName`, `CardData.scName` en `frontend-web`).
