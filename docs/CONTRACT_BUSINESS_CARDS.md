# Contrato — Business Cards (`cardType: 'business'`, `bId`)

El documento canónico de la REGLA DE ORO (incluye tema Chest vs capa premium) está en [`docs/GOLDEN_RULE_SMART_VS_BUSINESS.md`](./GOLDEN_RULE_SMART_VS_BUSINESS.md). **Lo siguiente se imprime aquí como contrato ejecutable** (misma norma; no contradecir).

---

## REGLA DE ORO (copia de contrato — Business)

- **= DATOS DE ESE `bId` CREADOS EN / PARA ESA TARJETA** (Mongo `business_cards`, Firestore, espejo `smart_cards` donde aplique).
- **En el frontend (receptor / presentación pública de negocio): NADA DE DATOS DE PERFIL DEL EMISOR** como sustituto de marca, logo, nombre comercial o contacto. No rellenar con `userFullName`, `userAvatarUrl`, `userNickName`, etc.
- **La verdad de lo que se muestra es lo guardado en esa tarjeta de negocio**, no el perfil personal.
- **Nombre comercial canónico:** `business_cards.bcName`, expuesto en API como **`bcName`** y reflejado en **`cardName`** en `GET /contacts/received` para alinear con **Mis Tarjetas** (misma línea que el emisor).
- **Tema (shell):** identificador **`themeId`**; nombre legible humano = **`CardTheme.name`** vía `getThemeById(themeId)` (`constants/themeChest.ts`). **No** describir el shell como “wallpaper”. Para Business, **sin capa `wallpaperUrl`** en API de contactos recibidos (`wallpaper*` anulados).

---

> ### LEE PRIMERO — REGLAS NO NEGOCIABLES (RECEPTOR: UI + API CUANDO `cardType === 'business'`)
>
> - **LA VERDAD ABSOLUTA ES SOLO LO GUARDADO AL CREAR / EDITAR LA TARJETA DE NEGOCIO** (COLECCIÓN MONGO `business_cards`, MÁS ESPEJO `smart_cards` PARA NOMBRE/TEMA/BÓVEDA).  
> - **EN EL FRONTEND DEL RECEPTOR NO SE USA NADA DEL PERFIL PERSONAL DEL EMISOR PARA PRESENTAR LA TARJETA DE NEGOCIO:** NADA DE `userAvatarUrl`, `userFullName`, `userNickName` NI `ownerOccupation` COMO DATOS VISIBLES NI COMO FALLBACK.  
> - **CERO FALLBACK A PERFIL:** SI FALTA UN TEXTO O IMAGEN DE TARJETA, SE MUESTRA VACÍO O PLACEHOLDER; **NUNCA** SUSTITUIR CON NOMBRE U OCUPACIÓN DEL USUARIO.  
> - **LOGO (CÍRCULO Y QR EN LISTA CONTACTOS):** SOLO **`bcLogoUrl`** (API LO EXPONE EN `GET /contacts/received`). **NO** USAR `ownerPhotoUrl` DEL ESPEJO PARA ESA PRESENTACIÓN.  
> - **TEXTOS:** TÍTULO = NOMBRE COMERCIAL = **`bcName`** / **`cardName`** (MISMA VERDAD: `GET /contacts/received` USA `business_cards.bcName` PARA `cardName`); LÍNEA DE CONTACTO = SOLO **`bcContactName`**. SIN `@`.  
> - **BACKEND `GET /contacts/received`:** PARA FILAS BUSINESS **NO** SE APLICA `mergeContactProfileFromCard`; `userFullName` / `userNickName` / `userAvatarUrl` / `ownerOccupation` / `ownerPhotoUrl` VAN **VACÍOS O NULL**; SE RELLENAN **`bcContactName`** Y **`bcLogoUrl`** DESDE `business_cards` (CACHÉ POR `uid::bId`).
> - **CALLS / `GET /calls/history` (FILA NEGOCIO):** **NUNCA** `userAvatarUrl` COMO AVATAR DE MARCA; SOLO **`bcLogoUrl`** (MÁS SNAPSHOT `emitterCardPhotoUrl` SI FALTA DOC). TÍTULO / `bcContactName` SALIENTE = SOLO **`business_cards`**; **NO** `ownerDisplayName` NI `emitterCardContactName` DESDE `smart_cards`. **ENTRANTE A TU NEGOCIO:** NO SE USA `localViewerCard`; SUBTÍTULO = **NOMBRE DEL CALLER** (`resolveUserProfileExtended(peerUid)`); **SALIENTE** SUBTÍTULO = **`bcContactName`** DEL NEGOCIO AL QUE LLAMÁS.

Documento de referencia para **tarjetas de negocio**: fuentes de verdad, espejo Mongo (`smart_cards` con `bId`) y separación estricta frente al perfil personal del dueño en **vistas de receptor**.

**Código relacionado:** Firestore `businessCards`, repo `businessCardsRepo`, sync a Mongo vía `SmartCardPayload` con `bId`; `backend/src/routes/qrRoutes.js` (`GET /contacts/received`).

---

## 1. Identidad de negocio vs identidad de persona

| Concepto | Verdad absoluta | Receptor (UI/API business) |
|----------|-------------------|-----------------|
| Marca / nombre comercial | `bcName` / `cardName` en espejo | Solo esos campos; **sin** fallback a perfil |
| Logo | `bcLogoUrl` en `business_cards` | Círculo + QR en Contactos; **no** `userAvatarUrl` |
| Contacto en tarjeta | `bcContactName` en `business_cards` | Segunda línea / subtítulo modal; **sin** fallback a `userFullName` |
| Persona (dueño) | Perfil Mongo | **No** se expone en payload de contacto business para pintar la tarjeta; `uid` solo para permisos / QR / bloqueo |
| `uid` | Dueño Firebase | Permisos, `generatePermanentBusinessLink(bId, uid)`, relaciones |

**Smart cards** siguen usando perfil + `mergeContactProfileFromCard` donde aplique; **business** en lista de contactos recibidos **no**.

---

## 2. Claves estables

| Campo | Rol |
|-------|-----|
| `bId` | Id estable del documento Firestore `businessCards` (y misma clave en espejo Mongo) |
| `uid` | Dueño de la tarjeta |

Los permisos (`share_permissions`) relacionan receptores con la tarjeta usando la misma lógica que smart cards (ver contrato smart / rutas QR).

---

## 3. Presentación (tema Chest, layout)

- **Shell visual:** `themeId` → entrada del catálogo Chest (`CardTheme`), nombre legible = **`CardTheme.name`** (`getThemeById(themeId).name`). No usar el término “wallpaper” para el shell base.
- **Business — sin capa premium de fondo en receptor:** `GET /contacts/received` devuelve `wallpaperId`, `wallpaperUrl`, `wallpaperThumbUrl`, `wallpaperTier` **nulos** y `wallpaperPriceCredits` **0** cuando `cardType === 'business'`.
- El espejo Mongo (`smart_cards` con `cardType: 'business'`) debe **actualizarse** cuando el dueño edita en Firestore (flujos `cards.tsx` / `createBusinessCard`).

**Verdad para “en vivo”:** timestamp en Firestore + propagación a Mongo; el receptor fusiona por `cardUpdatedAt` como en smart cards.

---

## 4. Receptores, silencios, bloqueos, eliminaciones

Misma familia que Smart Cards:

- Conteo autoritativo desde **`share_permissions`** (ver backend `qrRoutes.js`).
- **Silenciados:** `card_subscriber_mutes` (u otra fuente documentada).
- **Bloqueo** de relación: endpoints de relaciones (no confundir con mute de canal).
- **Eliminado:** permiso revocado + limpieza de vistas derivadas.

**Logs de “cuándo se agregó”:** ideal en permiso (`grantedAt`) o tabla de auditoría.

---

## 5. Calificaciones y métricas

| Campo típico | Notas |
|--------------|--------|
| `averageRating`, `totalRatings`, `holdersCount` (Firestore / Mongo) | Denormalizados; definir si el cálculo autoritativo vive en otra colección. |

---

## 6. Mercado / Social Market

| Concepto | Verdad |
|----------|--------|
| Visibilidad | `isPublishedToMarket`, ubicación, keywords |
| Búsqueda | Facetas `marketFacets`, texto indexado |

No mezclar datos de mercado con el documento de permisos salvo por `uid`/`bId` referenciados.

---

## 7. Vista pública / QR negocio

- Preview público: rutas `business-card-preview` / payloads en `qrApi`.
- El receptor nunca debe inferir **foto de persona** desde `bcLogoUrl` solo.

---

## 8. Checklist cuando “se rompe” algo

1. **Logo aparece como cara:** buscar `bcLogoUrl` pasado donde corresponde `userAvatarUrl`; revisar `searchService` / modales / Ghost-Link params.
2. **Tema no actualiza:** sync Firestore → Mongo; `cardUpdatedAt`; caché en receptor.
3. **Conteo receptores:** `share_permissions` vs campos denormalizados.
4. **Dos fuentes desalineadas:** Firestore editado pero Mongo espejo viejo (revisar `upsertSmartCardInDb` y errores silenciosos).

---

## 9. Qué más guardar como verdad absoluta (recomendado)

- **`bId` + `uid`** invariantes en todos los permisos y tokens.
- **`lastSyncedToMongoAt`** o `mongoMirrorUpdatedAt` (si el producto lo necesita) para depurar drift Firestore ↔ Mongo.
- **`schemaVersion`** del documento negocio en Firestore para migraciones.
- **Separación explícita** en API: `brandLogoUrl` vs `issuerUserAvatarUrl` en payloads de búsqueda/receptor (ver tipos `BusinessCardSearchResult`, `receivedIssuerUserAvatarUrl`).

Este documento es el **contrato conceptual**; los tipos TypeScript y las rutas del backend son la implementación.

---

## 10. React Native — implementación (Business Cards)

Si tocás preview/listado business en `cards.tsx`, revisá **contactos**, **búsqueda** y **llamadas** para no reintroducir datos de perfil en filas `cardType === 'business'`.

### 10.1 Modal vista previa — Mis Tarjetas (emisor, `businessPreviewPayload`)

| # | Campo visual | Origen |
|---|----------------|--------|
| 1 | Tema Chest (shell) | `themeId` → `CardTheme.name` vía catálogo; layout |
| 2 | Capa imagen fondo | **No** se pasa `wallpaperUrl`; solo gradiente del tema |
| 3 | Avatar / icono | `bcLogoUrl`; `noAvatarIcon: 'storefront-outline'` si no hay logo |
| 4 | Título | `bcName` |
| 5 | Subtítulo | `bcContactName` |
| 6 | Rating / medallas | `ratingAvg`, `totalRatings`, holders |
| 7 | Bóveda | `vaultLinkIds` → items del vault |

**Archivo:** `app/(tabs)/cards.tsx` → `businessPreviewPayload`.

### 10.2 Modal espejo — Contactos (receptor, `contactPayload`, `cardType === 'business'`)

| # | Campo | Origen (sin fallback a perfil) |
|---|--------|--------------------------------|
| Título | `bcName` si viene del API; si no, `cardName` (backend alinea `cardName` a `bcName`) | Misma verdad que Mis Tarjetas (`bcName`) |
| Subtítulo | `bcContactName` | Solo eso; sin `@` |
| Avatar | `bcLogoUrl` | `noAvatarIcon: 'storefront-outline'` si falta logo |
| Tema | `themeId` → `CardTheme.name` vía catálogo | **Sin** `wallpaperUrl` en el payload (shell = tema) |
| Wireframe | `publicCardSlots` | Espejo receptor |

**Archivo:** `app/(tabs)/contacts.tsx`.

### 10.3 Lista — Mis Tarjetas (`cards.tsx`, fila business)

| # | Qué muestra |
|---|-------------|
| 1 | Logo `bcLogoUrl` o placeholder storefront |
| 2 | `bcName` |
| 3 | `bcContactName` |
| 4 | Pill `holdersCount` |
| 5 | QR `generatePermanentBusinessLink(bId, sessionUid)` + logo embebido |
| 6 | Favoritos / swipe según layout |

### 10.4 Lista — Contactos (`contacts.tsx`, fila business)

| Zona | Qué muestra | Origen |
|------|-------------|--------|
| 1ª línea | Nombre comercial | `bcName` o `cardName` (misma verdad) |
| 2ª línea | Contacto negocio | `bcContactName` **solo** (si vacío, no se rellena con perfil) |
| Círculo | Logo marca | `bcLogoUrl` (iniciales de `bcName`/`cardName` si no hay logo) |
| QR derecha | Permanente + logo embebido | `generatePermanentBusinessLink` + `bcLogoUrl` |
| Ocupación | **No** | `ownerOccupation` no se usa en filas business |

Orden “por nombre” (A-Z): negocio ordena por `cardName`; smart por `userFullName`.

### 10.5 Lista / tarjeta — Búsqueda Social Market (`search.tsx`, `isMarketBusiness`)

| # | Qué muestra |
|---|-------------|
| Tema | `card.themeId` + superficie |
| QR | `QRCode` + `permanentLink` + logo |
| Textos | `bcName`, distancia, facets |

Contactos recibidos en mercado (`createReceivedContactBusinessCard`) usan `cardName`, `bcContactName`, `bcLogoUrl` del API; no descripción con `@nick` del emisor.

### 10.6 Modal receptores (`ReceptorScreenModal`) desde Contactos

- **Business:** `displayName` = `cardName`; `occupation` = `bcContactName`; `userAvatarUrl` = null; **`brandLogoUrl` = `bcLogoUrl`**.  
- **Smart:** `owner` con perfil como antes (`userAvatarUrl`, etc.).

### 10.7 Historial de llamadas (`calls.tsx`, filas Business)

Badge negocio; avatar/logo según flujo Ghost-Link / snapshot documentado en `docs/GHOSTLINK_VOIP_FLOW.md`.

### 10.8 Backend — `GET /contacts/received`

Para cada fila con `cardType === 'business'`: no `mergeContactProfileFromCard`; lectura de `business_cards` (`bcContactName`, `bcLogoUrl`) con caché por `issuerUid::bId`; campos de perfil en JSON anulados; `ownerPhotoUrl` null en business (el cliente usa solo `bcLogoUrl`).
