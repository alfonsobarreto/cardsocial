/**
 * Canonical contracts for Cards module.
 *
 * This file is the single source of truth for the shape of:
 *   - BusinessCardDoc  (Mongo: business_cards)
 *   - SmartCardDoc     (Mongo: smart_cards)
 *   - CallDisplayCard  (wire contract for VoIP / Calls UI)
 *
 * Naming rules (enforced across the whole stack):
 *   - Business identity fields carry the `bc*` prefix (independent of the owner).
 *   - Smart identity fields carry the `user*` prefix (projected from users/{uid}).
 *   - Presentation fields (theme/font/wallpaper/iconPack/layout/parallax/favorite)
 *     share the SAME names across both types — a card is a card when it comes to styling.
 *   - At the VoIP boundary, both cards adapt to a flat `CallDisplayCard` with
 *     `displayTitle` / `displayPhoto` / `displaySubtitle`. UI never branches on cardType.
 *
 * Invariants:
 *   1) One entity per collection. No mirrors. No dual writes from the client.
 *   2) One concept, one name. `averageRating` — never `ratingAvg`.
 *   3) Presentation assets are stored as IDs, not inlined URLs. Resolution happens
 *      against the owner's ThemeLocker / CardStudioVault at render time.
 *   4) Timestamps flow as ISO strings over the wire; Date objects are local only.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared building blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Rendered row for a vault item attached to a card's public face. */
export type PublicCardSlot = {
  itemId: string;
  type: string;
  label: string;
  value: string;
  /** Material Community Icons glyph name (validated). */
  iconName?: string;
  /** Custom icon URL (http/https) when the user picked a non-glyph icon. */
  icon?: string;
  /** MIME hint for Vault documents/images proxied without a file extension. */
  vaultMimeType?: string;
};

/** Denormalized facet used by Social Market search (business-only). */
export type MarketFacet = {
  type: string;
  label: string;
  value: string;
  iconName?: string;
};

/** Layout orientation used by both card types. */
export type CardLayout = 'horizontal' | 'vertical';

/** Tier marker for monetizable assets (currently only consumed by presentation fields). */
export type AssetTier = 'free' | 'premium';

/** Origin of the physical location on a business card. */
export type BcLocationSource = 'device_gps' | 'geocode_forward' | 'manual';

/** Subscription state of a business card. */
export type BusinessSubscriptionStatus = 'trial' | 'active' | 'expired';

/**
 * Presentation fields shared by BusinessCardDoc and SmartCardDoc.
 * All nullable except layout/parallax/favorite which have sensible defaults.
 * Assets are referenced by ID — URLs live in the user's ThemeLocker/CardStudioVault.
 */
export type CardPresentation = {
  themeId: string | null;
  fontId: string | null;
  wallpaperId: string | null;
  iconPackId: string | null;
  enableParallax: boolean;
  isFavorite: boolean;
  layout: CardLayout;
};

/** Metrics tracked by both card types. */
export type CardMetrics = {
  holdersCount: number;
  averageRating: number;
  totalRatings: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// BusinessCardDoc — canonical shape of a document in Mongo `business_cards`
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Business Card is an autonomous entity owned by `ownerUid`. Its identity
 * (name / logo / contact) is stored on the card itself — it does NOT inherit
 * anything from the owner's user profile.
 */
export type BusinessCardDoc = {
  // Identity
  bId: string;
  ownerUid: string;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO

  // Business identity (independent of owner) — `bc*` prefix
  bcName: string;
  bcLogoUrl: string | null;
  bcContactName: string;

  // Location
  bcPhysicalAddress: string;
  bcLatitude: number;
  bcLongitude: number;
  bcLocationSource: BcLocationSource;
  bcZipcode: string | null;
  bcCity: string | null;
  bcRegion: string | null;
  bcCountry: string | null;
  bcGeoLabel: string | null;
  bcLocationUpdatedAt: string | null;

  // Discoverability (Social Market)
  bcKeywords: string[];
  bcMarketFacets: MarketFacet[];
  isPublishedToMarket: boolean;
  publishedAt: string | null;

  // Compliance / Trial
  kycDocumentUrl: string | null;
  kycVerified: boolean;
  kycApprovedAt: string | null;
  kycTermsAccepted: boolean;
  businessTermsAccepted: boolean;
  subscriptionStatus: BusinessSubscriptionStatus;
  trialEndsAt: string;
  subscriptionExpiresAt: string | null;

  // Content (max 12 vault items, validated server-side)
  vaultItemIds: string[];
  publicCardSlots: PublicCardSlot[];

  // Presentation (shared contract)
  themeId: string | null;
  fontId: string | null;
  wallpaperId: string | null;
  iconPackId: string | null;
  enableParallax: boolean;
  isFavorite: boolean;
  layout: CardLayout;

  // Metrics (shared contract)
  holdersCount: number;
  viewCount: number;
  averageRating: number;
  totalRatings: number;
  negativeRatingsCount: number;

  // State
  isActive: boolean;
  lastQrUpdate: string | null;
  searchRankScore: number;
};

/**
 * Input payload accepted by `POST /api/business-cards`. The server fills the
 * rest (bId, timestamps, trial, metrics, marketFacets).
 */
export type BusinessCardCreateInput = {
  bcName: string;
  bcContactName: string;
  bcLogoUrl: string | null;
  bcPhysicalAddress: string;
  bcLatitude: number;
  bcLongitude: number;
  bcLocationSource: BcLocationSource;
  bcZipcode?: string | null;
  bcCity?: string | null;
  bcRegion?: string | null;
  bcCountry?: string | null;
  bcGeoLabel?: string | null;
  bcLocationUpdatedAt?: string | null;
  bcKeywords: string[];
  vaultItemIds: string[];
  themeId: string | null;
  fontId: string | null;
  wallpaperId: string | null;
  iconPackId: string | null;
  enableParallax: boolean;
  layout: CardLayout;
  kycDocumentUrl: string | null;
  kycTermsAccepted: boolean;
  businessTermsAccepted: boolean;
};

/**
 * Partial update accepted by `PATCH /api/business-cards/:bId`. Any field
 * omitted is left unchanged. Identity fields (bId, ownerUid, createdAt) are
 * rejected by the server if present.
 */
export type BusinessCardUpdateInput = Partial<
  Omit<BusinessCardDoc, 'bId' | 'ownerUid' | 'createdAt' | 'updatedAt'>
>;

// ─────────────────────────────────────────────────────────────────────────────
// SmartCardDoc — canonical shape of a document in Mongo `smart_cards`
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Smart Card is a projection of the user's identity. The fields `userFullName`,
 * `userAvatarUrl`, `userNickname`, `userOccupation` are MATERIALIZED copies of
 * the equivalent fields in Firestore `users/{uid}`. When the user edits their
 * profile, a dedicated endpoint (`POST /api/users/me/propagate-identity`)
 * re-syncs all the smart cards they own in a single backend operation.
 */
export type SmartCardDoc = {
  // Identity
  sid: string;
  ownerUid: string;
  createdAt: string;
  updatedAt: string;

  // Projected from users/{uid} — `user*` prefix
  userFullName: string;
  userAvatarUrl: string | null;
  userNickname: string | null;
  userOccupation: string | null;

  // Content
  vaultItemIds: string[];
  publicCardSlots: PublicCardSlot[];

  // Presentation (shared contract)
  themeId: string | null;
  fontId: string | null;
  wallpaperId: string | null;
  iconPackId: string | null;
  enableParallax: boolean;
  isFavorite: boolean;
  layout: CardLayout;

  // Metrics (shared contract)
  holdersCount: number;
  averageRating: number;
  totalRatings: number;
};

export type SmartCardCreateInput = {
  vaultItemIds: string[];
  themeId: string | null;
  fontId: string | null;
  wallpaperId: string | null;
  iconPackId: string | null;
  enableParallax: boolean;
  layout: CardLayout;
};

export type SmartCardUpdateInput = Partial<
  Omit<SmartCardDoc, 'sid' | 'ownerUid' | 'createdAt' | 'updatedAt' | 'userFullName' | 'userAvatarUrl' | 'userNickname' | 'userOccupation'>
>;

// ─────────────────────────────────────────────────────────────────────────────
// CallDisplayCard — the one and only wire contract for VoIP / Calls UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flat, type-agnostic view of a card for the VoIP / Calls screens.
 *
 *   displayTitle     → Slot 2 (big title): bcName        | userFullName
 *   displayPhoto     → Slot 1 (avatar):    bcLogoUrl     | userAvatarUrl
 *   displaySubtitle  → Slot 3 (badge):     bcContactName | null
 *
 * UI consumers MUST read these three fields directly — they must NOT branch on
 * cardType to pick a source. If a field is empty string / null, the UI hides
 * that slot. No fallback cascades, ever.
 */
export type CallDisplayCard = {
  cardType: 'business' | 'smart';
  key: string;                 // bId or sid
  ownerUid: string;
  displayTitle: string;
  displayPhoto: string | null;
  displaySubtitle: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// User asset libraries (sketched for forward-compatibility; empty today)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An item in the user's ThemeLocker — Firestore users/{uid}/theme_locker.
 * Holds purchased themes, fonts and wallpapers. Cards reference these by ID.
 */
export type ThemeLockerItem = {
  id: string;
  type: 'theme' | 'font' | 'wallpaper';
  catalogId: string;
  assetUrl: string;
  tier: AssetTier;
  purchasedAt: string;
  expiresAt: string | null;
  bundleId: string | null;
};

/**
 * An item in the user's CardStudioVault — Firestore users/{uid}/cardstudio_vault.
 * Holds purchased icon packs (SVG assets). Distinct from the free `icon_vault`
 * that the user configures manually.
 */
export type CardStudioVaultItem = {
  id: string;
  iconPackId: string;
  iconName: string;
  svgUrl: string;
  bundleId: string | null;
  purchasedAt: string;
};
