# Barrido global — identidad (`userAvatarUrl` vs `ownerPhotoUrl`)

## Regla

- **`userAvatarUrl`**: foto de **persona** (Mongo `users`/`profiles`, API contactos, preview de persona).
- **`ownerPhotoUrl`**: nombre **del campo en Mongo** `smart_cards` para la imagen asociada al **documento de tarjeta** (wireframe smart o logo business). No renombrar en payloads hacia `PUT /api/qr/cards/...` sin migración de esquema.

## Dónde queda `ownerPhotoUrl` a propósito

| Área | Motivo |
|------|--------|
| `services/qrApi.ts` | Tipos alineados con JSON del backend |
| `backend/src/routes/qrRoutes.js`, `publicUniversalRoutes.js` | Contrato HTTP / Mongo |
| `app/(tabs)/cards.tsx` | `ownerPhotoUrl: issuerUserAvatarUrl` al upsert (clave API) |
| `components/MyCards/MyCardsPreviewModal.tsx` | Mismo al persistir business desde preview |
| `app/scan.tsx` | Objeto con forma `PublicQrTokenPreview` (clave API) |
| `frontend-web/lib/normalizeUniversalCard.ts` | Lee `ownerPhotoUrl` del JSON y lo expone como `cardWireframeImageUrl` en `CardData` |
| `backend/.../vaultPublicUrlRewrite.js` | Lista de claves a reescribir |

## App / servicios alineados a persona

- `incomingCardPreviewPayload.ts`: círculo de preview usa `pickIssuerCircleAvatarUrl` + `userAvatarUrl` (universal + QR).
- `app/(tabs)/stories.tsx`: migración de stories locales: `ownerUserAvatar` ← `ownerUserAvatar` ?? `userAvatarUrl` ?? `ownerPhotoUrl` (solo caché legacy).
- `app/(tabs)/contacts.tsx`: comentario sobre `photoUrl` legacy → se normaliza a `userAvatarUrl`.

## Revisión rápida

```bash
rg "ownerPhotoUrl" --glob "*.{ts,tsx,js}" -g "!node_modules"
```
