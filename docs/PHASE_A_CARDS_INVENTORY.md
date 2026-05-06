# Fase A — Inventario `app/(tabs)/cards.tsx`

**Antes de auditar o retomar esta fase:** [REGLA DE ORO — Smart Cards vs Business Cards](./GOLDEN_RULE_SMART_VS_BUSINESS.md) (Smart = perfil; Business = `bId` / doc negocio; sin cruces). Orden global de fases (D₁→A→B→C→D₂): [ROADMAP_PHASES.md](./ROADMAP_PHASES.md).

**Export:** solo `export default function CardsFactoryScreen()` — no hay API nombrada hacia el resto de la app. El impacto global es por **servicios** (`qrApi`, `businessCardsRepo`, Firestore, AsyncStorage) y **componentes** (`MyCardsPreviewModal`, wireframe, etc.).

---

## Tabla: capacidad → persistencia → consumo

| Capacidad | Dónde persiste | Quién consume / notas |
|-----------|----------------|------------------------|
| **Lista Smart Cards** | `AsyncStorage` (`smartCardsStorageKey(uid)`); fuente remota `GET` vía `listSmartCardsFromDb` → Mongo `smart_cards` | Misma pantalla; `loadSmartCards` fusiona remoto + caché; otros consumidores pueden leer la misma caché |
| **Crear / editar / borrar Smart** | `persistCards` → AsyncStorage + `upsertSmartCardInDb` (`PUT /api/qr/cards/:ref`); borrado: `deleteSmartCardInDb` | Receptores vía API contactos/subscribers; universal QR lee `smart_cards` |
| **Payload Mongo smart** | `buildSmartCardDbPayload` → `SmartCardPayload` (theme, slots, `issuerSnapshot`, `ownerPhotoUrl` según API) | Backend `qrRoutes` upsert; web `/api/public/universal-card` |
| **Fábrica: nombre, datos vault, tema, fuente, wallpaper** | Smart local state → `persistCards` / `handleSaveCard`; tema al cerrar modal de temas también `persistCards` | Misma UI; receptores al refrescar listas |
| **Bóveda (items de tarjeta)** | Firestore `users/{uid}/links` (+ icon vault); lectura en fábrica y `buildPublicCardSlotsForPersist` | Mismo tab; vault tab; QR consume slots materializados |
| **Business cards (lista)** | API `listMyBusinessCards` → Mongo vía `GET /api/smart-cards` (business docs); no guarda en mismo AsyncStorage que smart list | `createBusinessCard.tsx` para crear/edit; cards tab muestra feed |
| **Sync business → `smart_cards` (mirror)** | `upsertSmartCardInDb` con `cardType: 'business'` en flujos de sync (p. ej. tras cargar feed) | Mismo modelo Mongo que smart; receptores / QR |
| **QR dinámico** | `issueDynamicQrToken`; token opaco en UI | `scan.tsx` / receptor consume |
| **QR universal 24h** | `issueTemporaryUniversalAccess`; caché `AsyncStorage` `@cs_universal24h_*` | Web `frontend-web/app/u/[token]`; deep link |
| **Suscriptores / receptores** | API `listCardSubscribers`, `revokeCardSubscriber`, `setCardSubscriberMute`, `blockRelationship` | Modal en cards; datos alineados con backend QR |
| **Analytics de tarjeta** | `getCardAnalyticsSummary` | Modal en cards |
| **Orden manual del feed** | `AsyncStorage` `cardsTabFeedOrderStorageKey` | Solo UI del tab |
| **Perfil emisor en fábrica** | Firestore `users/{uid}` (`loadOwnerProfile`: nombre, nick, `issuerUserAvatarUrl`) | `buildSmartCardDbPayload` / previews / VoIP labels |
| **Perfil VoIP** | `fetchVoipCanonicalFullNameForUid` / refs | Ghost-Link / preview |
| **Límite de creación** | `validateCardCreation` (servicio; puede leer backend) | Antes de abrir fábrica nueva |
| **Repair search facets** | `persistCards` forzado si facets incoherentes | Backend search / contactos |

---

## Bloques funcionales (lectura de código)

1. **Helpers de módulo** (`toBusinessCardListRow`, `buildPublicCardSlotsForPersist`, migración vault, caché universal 24h, VoIP name helpers, orden feed, subtítulo fila).
2. **Estado UI** — listas smart + business mezcladas, modales (fábrica, preview, QR, suscriptores, analytics, temas, datos, documento).
3. **`loadSmartCards` / `loadBusinessCardsFeed` / `loadVaultItems` / `loadOwnerProfile`** — hidratan pantalla.
4. **`persistCards` + `upsertSmartCardInDb`** — **eje de escritura** smart → Mongo + caché local.
5. **Fábrica** — `openCreateFactory`, `openEditFactory`, `handleSaveCard`, `deleteCard`, `toggleFavorite`, `updateCardItemIds`, temas (`closeThemesPickerModal` + persist).
6. **Previews** — `openPreviewCard`, `openPreviewBusinessCard`, payloads `MyCardsPayload`.
7. **QR** — `openOrCreateUniversalQrForCard`, timers, negocio vs smart.
8. **Subscribers** — modales smart/business, revoke/block/mute.
9. **Analytics** — `openCardAnalytics`.
10. **Integración negocio** — fila business, sync a Mongo, branded link (`brandedQrService`).

---

## Contratos de datos relevantes

- **`SmartCardPayload`** (`services/qrApi.ts`) — upsert Mongo.
- **`BusinessCardDoc` / API smart-cards** — negocio vía `businessCardsRepo`.
- **`IssuerSnapshotPayload`** — embebido en payload smart al persistir.
- **`MyCardsPayload`** — preview modal (issuer/receiver/incoming).

---

## Siguiente fase (B)

Mapear **consumidores externos** de estas rutas: `contacts`, `search`, `calls`, `scan`, `GhostLink*`, web universal — ya parcialmente listado en columnas “consume”.

**Hecho:** [PHASE_B_CONSUMERS.md](./PHASE_B_CONSUMERS.md).
