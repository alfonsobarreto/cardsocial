# Fase B — Consumidores externos (rutas de `cards` / QR / identidad)

**Antes de auditar o retomar esta fase:** [REGLA DE ORO — Smart Cards vs Business Cards](./GOLDEN_RULE_SMART_VS_BUSINESS.md) (Smart = perfil; Business = `bId` / doc negocio; sin cruces). Orden global de fases (D₁→A→B→C→D₂): [ROADMAP_PHASES.md](./ROADMAP_PHASES.md).

**Contexto:** [Fase A — Inventario `app/(tabs)/cards.tsx`](./PHASE_A_CARDS_INVENTORY.md) describe la pantalla emisora. Esta fase mapea **quién más** en el monorepo consume los mismos contratos (`services/qrApi`, caché smart, API pública, previews, VoIP).

**Objetivo de barrido:** detectar **inconsistencias de nombres** (`ownerDisplayName` vs `userFullName`, espejos Mongo vs perfil Firestore) y **duplicación de lecturas** antes de refactors mayores.

---

## Tabla maestra — consumidor → persistencia / API → notas

| Área | Archivos principales | Qué toca | Identidad / tarjeta |
|------|----------------------|----------|---------------------|
| **Contactos** | `app/(tabs)/contacts.tsx` | `listReceivedContacts`, `listCardSubscribers`, `blockRelationship`, `removeRelationship`, `setSubscriberSelfCardMute`; previews con `MyCardsPayload` | Facetas `receivedContactFacets` / búsqueda local (`deepSearch`); **no** lista `smart_cards` directamente; datos vienen del modelo “contacto recibido” |
| **Búsqueda** | `app/(tabs)/search.tsx` | `listReceivedContacts`, `fetchPublicBusinessCardPreview`, `listCardSubscribers`, `blockRelationship`; `myCardsPayloadFromQrPreview` | Misma línea que contactos para filas + previews; negocio vía preview público |
| **Llamadas** | `app/(tabs)/calls.tsx` | `listCallsHistory`; `requestGhostLinkCallImperative` → `GhostLinkCallProvider` | Historial: filas Smart/Business con contrato en `callsHistoryIncomingRowUi` / `callsHistoryOutgoingRowUi`; acciones Ghost-Link |
| **Ghost-Link VoIP** | `services/GhostLinkCallProvider.tsx`, `services/ghostLinkVoip.ts`, `components/GhostLinkCallOverlay.tsx`, **`services/outgoingCallUiMirror.ts`**, `app/(tabs)/cards.tsx` (`ghostPeerVoipFullName`) | `startGhostLinkVoipCall`, invites; `deriveCallFace`; espejo **saliente** unificado | **Saliente Smart:** `userAvatarUrl` / `cardName` / `userFullName` vía `outgoingMirrorFromGhostCallData` (ver cabecera en `outgoingCallUiMirror.ts`). **Entrante Smart:** avatar caller, título = tu `cardName`, subtítulo = caller `userFullName` (`deriveCallFace` + invite enriquecido en `qrRoutes.js`). **Híbrido nombre:** Firestore `users/{uid}` en `ActionController` cuando aplica |
| **Scan (app)** | `app/scan.tsx` | `fetchPublicQrTokenPreview`, `fetchPublicUniversalCardByToken`; `myCardsPayloadFromUniversalCard` / `myCardsPayloadFromQrPreview` | Identidad pública: `ownerDisplayName` en payload API; `incomingCardPreviewPayload` ya centraliza con `CanonicalIssuerIdentity` |
| **Universal deep link (app)** | `app/u/[token].tsx` | `fetchPublicUniversalCardByToken`; `myCardsPayloadFromUniversalCard` | Misma API pública que scan / web |
| **Clipboard / bunker** | `components/PendingBunkerRedeemGate.tsx` | `fetchPublicUniversalCardByToken`, `fetchPublicQrTokenPreview` | Puente de token sin pasar por scan UI |
| **Preview emisor (modal)** | `components/MyCards/MyCardsPreviewModal.tsx` | `upsertSmartCardInDb` (flujo receptor/guardado) | Payloads alineados con `SmartCardPayload` / Mongo |
| **Payload entrante unificado** | `services/incomingCardPreviewPayload.ts` | — | **`buildCanonicalIssuerIdentityFromPublicUniversalCard` / `FromQrPreview`** → un objeto; fallback legado `ownerDisplayName` en API |
| **Web universal** | `frontend-web/app/u/[token]/page.tsx`, `frontend-web/components/BusinessCardWeb.tsx`, `frontend-web/lib/universalCardTypes.ts` | `GET /api/public/universal-card` | Misma forma `ownerDisplayName` / slots; **paridad** con app móvil al renombrar campos públicos |

---

## Contratos compartidos (referencia rápida)

| Contrato | Definición | Consumidores típicos |
|----------|------------|----------------------|
| `SmartCardPayload` / lista Mongo | `services/qrApi.ts` | `cards.tsx`, upsert desde `cards.tsx` y `MyCardsPreviewModal` |
| Caché AsyncStorage smart | `smartCardsStorageKey`, `readSmartCardsJsonWithLegacyMigration` (`services/userScopedStorage.ts`) | `cards.tsx` |
| API pública universal | `fetchPublicUniversalCardByToken` → `PublicUniversalCardPayload` | `scan.tsx`, `app/u/[token].tsx`, `PendingBunkerRedeemGate`, web |
| Preview QR ligero | `fetchPublicQrTokenPreview` | `scan.tsx`, `PendingBunkerRedeemGate` |
| Contactos / facets | `listReceivedContacts` y derivados | `contacts.tsx`, `search.tsx`, `calls.tsx` |
| Business Mongo/Firestore | `services/businessCardsRepo.ts` (`listMyBusinessCards`, …) | Principalmente `cards.tsx`, `createBusinessCard.tsx` |
| Identidad canónica emisor (app) | `types/canonicalIssuerIdentity.ts` | Fábrica `cards.tsx` (Firestore `users/{uid}`); previews entrantes vía `incomingCardPreviewPayload` |

---

## Huecos y riesgos (para siguientes fases)

1. **Duplicidad de nombres en API pública:** `ownerDisplayName` / `userFullName` en `PublicUniversalCardPayload`; consumidores (`scan`, web, `incomingCardPreviewPayload`) ya tienen fallback explícito — cualquier rename debe ser **versionado o dual-write** en backend.
2. **Stories vs Cards:** ambos leen `listSmartCardsFromDb` + caché; cambios en fusión remoto/local deben probarse en **las dos** pantallas.
3. **Contactos/Search:** no pasan por `issuerIdentity`; dependen del **snapshot en fila de contacto** y de previews — coherencia con Mongo ocurre al **recibir** tarjeta, no en `loadOwnerProfile`.
4. **Web:** no usa Firestore cliente; solo REST. Paridad con app = contrato `/api/public/universal-card` + tipos en `frontend-web/lib/universalCardTypes.ts`.

---

## Siguiente paso sugerido

- Orden de fases en el repo: [ROADMAP_PHASES.md](./ROADMAP_PHASES.md) (tras B suele venir **C** backend/payloads y luego **D₂** de nuevo).
- **Fase D (reglas):** [IDENTITY_PHASE_D_AUDIT.md](./IDENTITY_PHASE_D_AUDIT.md) — nombres canónicos y parches mínimos entre módulos.
- **Refactor por eje:** unificar solo la **API pública** (backend + `qrApi` + web) antes de tocar UI de contactos (encaja en **C** + **D₂**).
