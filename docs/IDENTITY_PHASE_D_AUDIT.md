# Fase D — Reglas de identidad (auditoría + parches mínimos)

Orden del roadmap global (D al inicio y **D repetida tras C**): [ROADMAP_PHASES.md](./ROADMAP_PHASES.md).

**Antes de auditar o retomar esta fase:** [REGLA DE ORO — Smart Cards vs Business Cards](./GOLDEN_RULE_SMART_VS_BUSINESS.md) (Smart = perfil; Business = `bId` / doc negocio; sin cruces). La tabla siguiente detalla campos canónicos; la REGLA DE ORO fija el límite Smart vs Business.

## Regla única por concepto

| Concepto | Campo canónico (API / Mongo persona) | No usar como sinónimo |
|----------|----------------------------------------|------------------------|
| Nombre persona | `userFullName` (API), `name`/`fullName` en merges internos | `displayName` solo UI derivada |
| Nick | `userNickName` | `ownerNickname` es handle de tarjeta, no siempre igual |
| Foto persona | `userAvatarUrl` | `ownerPhotoUrl`, `photoUrl`, `peerPhotoUrl` (este último es rol VoIP, no origen distinto) |
| Foto / logo en doc tarjeta | `ownerPhotoUrl` en `smart_cards` | No rellenar `userAvatarUrl` de contactos desde aquí (acuerdo `contactIdentityMerge`) |
| Nombre tarjeta smart | `scName` | — |
| Nombre negocio | `bcName` (cliente business) | — |

## Duplicados por grep (inventario)

### `photoUrl`

- **Firestore / legacy**: `userIdentityFields`, `relationshipService`, `userProfilePhoto` (lectura legacy).
- **Stories**: `photoUrl` en ads house / VIP — **no** es perfil de usuario.
- **qrApi**: filas `row.photoUrl` en endpoints que aún exponen el nombre legacy del backend; **no** mezclar con `userAvatarUrl` sin mapear en el tipo.
- **frontend-web** `MirrorActionModals` / `InterstitialAvatar`: prop `photoUrl` — conviene alinear a `userAvatarUrl` en un refactor futuro (no tocado aquí).

### `ownerPhotoUrl`

- **Mongo `smart_cards`**: imagen asociada al wireframe (y logo en business).
- **App `cards.tsx`**: estado local `ownerPhotoUrl` = copia de la foto de **persona** del usuario para payloads; se mapea a `userAvatarUrl` en `buildSmartCardDbPayload` / issuer snapshot. **Nombre local** heredado; el valor en Mongo para persona es `userAvatarUrl` en perfil + `issuerSnapshot`.
- **API pública** universal / business preview: devuelve `ownerPhotoUrl` + `userAvatarUrl` (persona) por separado.

### `peerPhotoUrl`

- **VoIP / Ghost-Link**: “qué URL mostrar en la llamada”. Se asigna desde `userAvatarUrl` del invitado (`GhostLinkCallProvider`) — no es un cuarto bucket de datos, es **rol de pantalla**.

### `avatarUrl`

- **`MyCardsPayload`**: contrato del modal de preview; debe ser foto de **persona** → alineado con `pickIssuerCircleAvatarUrl` → `userAvatarUrl` del emisor.

### `displayName`

- **Stories** (`displayName` en filas): derivado de `userFullName` u owner; **no** persistir como fuente de verdad.
- **Firebase Auth** `user.displayName`: solo fallback en login.

## Parches aplicados en esta fase

1. **`GET /api/public/universal-card`**: añade `userFullName`, `userNickName`, `userAvatarUrl` desde Mongo (misma idea que `business-card-preview`), para no depender de `ownerPhotoUrl` como avatar de persona.
2. **`services/qrApi.ts`**: `PublicUniversalCardPayload` documentado + campos opcionales de persona; **`normalizePublicUniversalCardPayload`** y **`normalizePublicQrTokenPreview`** unifican en cliente persona vs espejo Mongo (`ownerDisplayName` / `ownerNickname`) al devolver `fetchPublicUniversalCardByToken`, `fetchPublicQrTokenPreview` y **`fetchPublicBusinessCardPreview`**.
3. **`incomingCardPreviewPayload.ts`**: `avatarUrl` del modal usa **`userAvatarUrl`** vía `pickIssuerCircleAvatarUrl` (QR preview y universal); nombre persona solo desde **`CanonicalIssuerIdentity.userFullName`**.
4. **`types/sharedCardPresentation.ts`**: doc de aliases + `pickIssuerCircleAvatarUrl`.
5. **Web** `universalCardTypes` / `normalizeUniversalCard`: la API sigue enviando `ownerPhotoUrl`; el cliente **no** expone `ownerPhotoUrl` en `CardData`: se normaliza a **`cardWireframeImageUrl`** (imagen del doc de tarjeta) y **`userAvatarUrl`** (persona). **`userFullName` / `userNickName`** opcionales alineados con la normalización móvil.
6. **`app/(tabs)/cards.tsx`**: estado **`issuerIdentity`** (`CanonicalIssuerIdentity`); el payload Mongo sigue usando la clave **`ownerPhotoUrl`** donde lo exige la API.
7. **`app/scan.tsx`**, **`app/u/[token].tsx`**: `issuerFullName` / clasificación desde **`buildCanonicalIssuerIdentityFromQrPreview` / `FromPublicUniversalCard`** (no `ownerDisplayName` suelto).

## Re-chequeo D (evitar regresiones)

Tras cambios A–F futuros, volver a:

```bash
rg "photoUrl|PhotoUrl|ownerPhotoUrl|peerPhotoUrl|displayName" --glob "*.{ts,tsx}" -g "!node_modules"
```

y comprobar que no se introducen nuevos fallbacks `userAvatarUrl || ownerPhotoUrl` para **persona** en contactos / preview.

---

## Re-chequeo D — 2026-04-17 (Calls / Ghost-Link / contrato Smart)

**Ejecutado en repo:** barrido de identidad tras unificar espejo saliente (`outgoingCallUiMirror.ts`), entrante Smart en historial + `deriveCallFace`, y enriquecimiento de invite entrante (`qrRoutes.js`).

### Comprobación automática (anti-pattern)

```bash
npm run audit:identity
```

Script portable: `scripts/audit-identity-phase-d.mjs` — recorre `services/`, `app/`, `components/`, `hooks/`, `types/` y falla si aparece `userAvatarUrl || ownerPhotoUrl` o el simétrico (líneas que suelen mezclar persona con imagen de doc tarjeta).

**Resultado 2026-04-17:** **OK** (0 líneas con ese patrón en los directorios anteriores).

### Rutas VoIP / contrato tocadas (referencia)

| Área | Archivos |
|------|----------|
| Espejo saliente Smart | `services/outgoingCallUiMirror.ts` |
| Sesión VoIP | `services/GhostLinkCallProvider.tsx`, `services/ghostLinkVoip.ts` |
| UI entrante/saliente | `components/GhostLinkCallOverlay.tsx` (`deriveCallFace`, `IncomingView`, …) |
| Historial Calls | `app/(tabs)/calls.tsx` (`callsHistoryIncomingRowUi` / outgoing) |
| API | `backend/src/routes/qrRoutes.js` (`/calls/history`, `/voip/ghost-link/incoming`, …) |
| Contrato documentado | `docs/CONTRACT_SMART_CARDS.md` §9.6.x |

### Excepciones conocidas (no son “contacto preview persona”)

- **Stories** (`stories.tsx`): fallback de avatar de historia puede combinar campos; dominio anuncios/VIP, no lista de contactos.
- **Payload Mongo** en `cards.tsx`: la clave **`ownerPhotoUrl`** a veces recibe el **valor** de `issuerIdentity.userAvatarUrl` porque la API exige ese nombre de campo; no implica confundir buckets semánticos en UI de contactos.

### Próximo barrido

Tras cambios en **contactos**, **preview universal** o **API pública**, repetir `npm run audit:identity` y, si hace falta, el `rg` amplio del párrafo anterior en este doc.
