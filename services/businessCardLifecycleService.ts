import { db } from '@/services/firebaseConfig';
import { reconcileBusinessRevocableCreditsForDull } from '@/services/creditsService';
import type { BusinessCard, BusinessCardLifecycleState } from '@/types/businessCard';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';

type MaybeDate = Date | string | null | undefined | { toDate?: () => Date };

export interface LegacyLicenseLike {
  startedAt?: MaybeDate;
  expiresAt?: MaybeDate;
  isActive?: boolean;
}

export interface BusinessCardLifecycleSnapshot {
  state: BusinessCardLifecycleState;
  hasActiveAccess: boolean;
  isDull: boolean;
  isPurged: boolean;
  canEdit: boolean;
  canReceiveMessages: boolean;
  canRenderReadableQr: boolean;
  isQrUpdateAllowed: boolean;
  nextQrUpdateAllowedAt: string | null;
  remainingQrCooldownDays: number;
  purgeAt: string | null;
}

export const BUSINESS_CARD_TRIAL_DAYS = 14;
export const BUSINESS_CARD_ANNUAL_DAYS = 365;
export const BUSINESS_CARD_DULL_GRACE_DAYS = 30;
export const BUSINESS_CARD_QR_COOLDOWN_DAYS = 30;
export const BUSINESS_CARD_PAYMENTS_QUARANTINED =
  String(process.env.EXPO_PUBLIC_PAYMENTS_QUARANTINED ?? 'true').toLowerCase() !== 'false';

const DAY_MS = 24 * 60 * 60 * 1000;
const BUSINESS_CARD_QR_COOLDOWN_MS = BUSINESS_CARD_QR_COOLDOWN_DAYS * DAY_MS;
const BUSINESS_CARD_DULL_GRACE_MS = BUSINESS_CARD_DULL_GRACE_DAYS * DAY_MS;

function toMillis(value: MaybeDate): number | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const dt = value.toDate();
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function isoFromMillis(ms: number | null): string | null {
  if (!Number.isFinite(ms as number)) {
    return null;
  }
  return new Date(ms as number).toISOString();
}

function normalizeLifecycleState(value: unknown): BusinessCardLifecycleState | null {
  const state = String(value || '').trim() as BusinessCardLifecycleState;
  if (!state) {
    return null;
  }
  if (state === 'draft' || state === 'trial_active' || state === 'active_paid' || state === 'dull' || state === 'purged') {
    return state;
  }
  return null;
}

export function deriveLifecycleStateFromCard(card: Partial<BusinessCard>, nowMs = Date.now()): BusinessCardLifecycleState {
  const raw = normalizeLifecycleState((card as any).lifecycleState);
  const trialEndsMs = toMillis((card as any).trialEndsAt);
  const annualEndsMs = toMillis((card as any).annualContractEndsAt) ?? toMillis((card as any).subscriptionExpires);
  const dullStartedMs = toMillis((card as any).dullStartedAt);
  const purgeAtMs = toMillis((card as any).purgeAt);

  let state: BusinessCardLifecycleState =
    raw ??
    (trialEndsMs && trialEndsMs > nowMs
      ? 'trial_active'
      : annualEndsMs && annualEndsMs > nowMs
        ? 'active_paid'
        : trialEndsMs || annualEndsMs || dullStartedMs || purgeAtMs
          ? 'dull'
          : 'draft');

  if (state === 'trial_active' && (!trialEndsMs || trialEndsMs <= nowMs)) {
    state = annualEndsMs && annualEndsMs > nowMs ? 'active_paid' : 'dull';
  }

  if (state === 'active_paid' && (!annualEndsMs || annualEndsMs <= nowMs)) {
    state = 'dull';
  }

  if (state === 'dull') {
    const computedPurgeMs = purgeAtMs ?? (dullStartedMs ? dullStartedMs + BUSINESS_CARD_DULL_GRACE_MS : null);
    if (computedPurgeMs && computedPurgeMs <= nowMs) {
      state = 'purged';
    }
  }

  return state;
}

export function deriveBusinessCardLifecycleSnapshot(
  card: Partial<BusinessCard>,
  nowMs = Date.now(),
): BusinessCardLifecycleSnapshot {
  const state = deriveLifecycleStateFromCard(card, nowMs);
  const hasActiveAccess = state === 'trial_active' || state === 'active_paid';
  const isDull = state === 'dull';
  const isPurged = state === 'purged';

  const lastQrMs = toMillis((card as any).lastQrUpdate) ?? toMillis((card as any).createdAt) ?? nowMs;
  const nextQrAllowedMs = toMillis((card as any).nextQrUpdateAllowedAt) ?? (lastQrMs + BUSINESS_CARD_QR_COOLDOWN_MS);
  const remainingMs = Math.max(0, nextQrAllowedMs - nowMs);
  const remainingQrCooldownDays = Math.ceil(remainingMs / DAY_MS);
  const isQrUpdateAllowed = hasActiveAccess && !isPurged && nowMs >= nextQrAllowedMs;

  const dullStartedMs = toMillis((card as any).dullStartedAt);
  const purgeAtMs = toMillis((card as any).purgeAt) ?? (dullStartedMs ? dullStartedMs + BUSINESS_CARD_DULL_GRACE_MS : null);

  return {
    state,
    hasActiveAccess,
    isDull,
    isPurged,
    canEdit: hasActiveAccess,
    canReceiveMessages: hasActiveAccess,
    canRenderReadableQr: hasActiveAccess,
    isQrUpdateAllowed,
    nextQrUpdateAllowedAt: isoFromMillis(nextQrAllowedMs),
    remainingQrCooldownDays,
    purgeAt: isoFromMillis(purgeAtMs),
  };
}

export function buildLifecycleV1PatchFromLegacyCard(
  card: Partial<BusinessCard>,
  license?: LegacyLicenseLike | null,
  nowMs = Date.now(),
): Record<string, any> {
  const licenseExpiresMs = toMillis(license?.expiresAt);
  const licenseStartsMs = toMillis(license?.startedAt);
  const annualEndsMs = toMillis((card as any).annualContractEndsAt)
    ?? toMillis((card as any).subscriptionExpires)
    ?? (license?.isActive !== false ? licenseExpiresMs : null);
  const annualStartsMs = toMillis((card as any).annualContractStartedAt) ?? licenseStartsMs;

  const trialStartsMs = toMillis((card as any).trialStartedAt);
  const trialEndsMs = toMillis((card as any).trialEndsAt);
  const dullStartedMs = toMillis((card as any).dullStartedAt);

  const initialState: BusinessCardLifecycleState = normalizeLifecycleState((card as any).lifecycleState)
    ?? (trialEndsMs && trialEndsMs > nowMs
      ? 'trial_active'
      : annualEndsMs && annualEndsMs > nowMs
        ? 'active_paid'
        : annualEndsMs || trialEndsMs || dullStartedMs || licenseExpiresMs
          ? 'dull'
          : 'draft');

  const stateForNow = deriveLifecycleStateFromCard(
    {
      ...card,
      lifecycleState: initialState,
      annualContractEndsAt: isoFromMillis(annualEndsMs),
      trialEndsAt: isoFromMillis(trialEndsMs),
      dullStartedAt: isoFromMillis(dullStartedMs),
    },
    nowMs,
  );

  const effectiveDullStartedMs =
    stateForNow === 'dull'
      ? (dullStartedMs ?? nowMs)
      : null;
  const effectivePurgeAtMs =
    stateForNow === 'dull'
      ? (toMillis((card as any).purgeAt) ?? (effectiveDullStartedMs! + BUSINESS_CARD_DULL_GRACE_MS))
      : null;

  const lastQrMs = toMillis((card as any).lastQrUpdate) ?? toMillis((card as any).createdAt) ?? nowMs;
  const nextQrAllowedMs = toMillis((card as any).nextQrUpdateAllowedAt) ?? (lastQrMs + BUSINESS_CARD_QR_COOLDOWN_MS);

  const patch: Record<string, any> = {
    lifecycleVersion: 'v1',
    lifecycleState: stateForNow,
    paymentsQuarantined: (card as any).paymentsQuarantined ?? BUSINESS_CARD_PAYMENTS_QUARANTINED,
    autopayEnabled: (card as any).autopayEnabled ?? true,
    trialConsumedOwner: (card as any).trialConsumedOwner ?? true,
    trialStartedAt: isoFromMillis(trialStartsMs),
    trialEndsAt: isoFromMillis(trialEndsMs),
    annualContractStartedAt: isoFromMillis(annualStartsMs),
    annualContractEndsAt: isoFromMillis(annualEndsMs),
    dullStartedAt: isoFromMillis(effectiveDullStartedMs),
    purgeAt: isoFromMillis(effectivePurgeAtMs),
    lastQrUpdate: isoFromMillis(lastQrMs),
    nextQrUpdateAllowedAt: isoFromMillis(nextQrAllowedMs),
    subscriptionExpires: isoFromMillis(annualEndsMs),
  };

  return patch;
}

export async function migrateSingleBusinessCardLifecycleV1(cardId: string): Promise<boolean> {
  const cardRef = doc(db, 'businessCards', cardId);
  const cardSnap = await getDoc(cardRef);
  if (!cardSnap.exists()) {
    return false;
  }

  const card = cardSnap.data() as Partial<BusinessCard>;
  if (card.type !== 'business') {
    return false;
  }

  const ownerUid = String(card.ownerUid || '').trim();
  let license: LegacyLicenseLike | null = null;
  if (ownerUid) {
    const licenseSnap = await getDocs(
      query(collection(db, 'users', ownerUid, 'business_card_licenses'), where('cardId', '==', cardId)),
    );
    if (!licenseSnap.empty) {
      license = licenseSnap.docs[0].data() as LegacyLicenseLike;
    }
  }

  const patch = buildLifecycleV1PatchFromLegacyCard(card, license);
  await updateDoc(cardRef, patch);
  return true;
}

export async function migrateBusinessCardsLifecycleV1(options?: { ownerUid?: string }): Promise<{ processed: number; migrated: number }> {
  const cardsRef = collection(db, 'businessCards');
  const cardsSnap = options?.ownerUid
    ? await getDocs(query(cardsRef, where('ownerUid', '==', options.ownerUid)))
    : await getDocs(cardsRef);

  let processed = 0;
  let migrated = 0;
  const userLicensesCache = new Map<string, Map<string, LegacyLicenseLike>>();

  for (const row of cardsSnap.docs) {
    const card = row.data() as Partial<BusinessCard>;
    if (card.type !== 'business') {
      continue;
    }
    processed += 1;

    const ownerUid = String(card.ownerUid || '').trim();
    let license: LegacyLicenseLike | null = null;
    if (ownerUid) {
      if (!userLicensesCache.has(ownerUid)) {
        const licensesSnap = await getDocs(collection(db, 'users', ownerUid, 'business_card_licenses'));
        const map = new Map<string, LegacyLicenseLike>();
        licensesSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const cId = String(data?.cardId || docSnap.id || '').trim();
          if (cId) {
            map.set(cId, data as LegacyLicenseLike);
          }
        });
        userLicensesCache.set(ownerUid, map);
      }
      license = userLicensesCache.get(ownerUid)?.get(String(card.id || row.id)) || null;
    }

    const patch = buildLifecycleV1PatchFromLegacyCard(card, license);
    await updateDoc(doc(db, 'businessCards', row.id), patch);
    migrated += 1;
  }

  return { processed, migrated };
}

export async function transitionBusinessCardToDull(params: {
  cardId: string;
  ownerUid: string;
  reason: 'trial_cancelled' | 'annual_expired' | 'renewal_failed';
}): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const purgeAtIso = new Date(now.getTime() + BUSINESS_CARD_DULL_GRACE_DAYS * DAY_MS).toISOString();

  await updateDoc(doc(db, 'businessCards', params.cardId), {
    lifecycleVersion: 'v1',
    lifecycleState: 'dull',
    dullStartedAt: nowIso,
    purgeAt: purgeAtIso,
    isActive: false,
    isPublishedToMarket: false,
    lastUpdated: nowIso,
    dullReason: params.reason,
  });

  await reconcileBusinessRevocableCreditsForDull({
    userId: params.ownerUid,
    businessCardId: params.cardId,
    revoke: true,
  });
}

export async function reactivateBusinessCardFromDull(params: {
  cardId: string;
  ownerUid: string;
  annualContractStartedAt?: string;
  annualContractEndsAt?: string;
}): Promise<void> {
  const now = new Date();
  const startIso = params.annualContractStartedAt || now.toISOString();
  const endIso = params.annualContractEndsAt || new Date(now.getTime() + BUSINESS_CARD_ANNUAL_DAYS * DAY_MS).toISOString();

  await updateDoc(doc(db, 'businessCards', params.cardId), {
    lifecycleVersion: 'v1',
    lifecycleState: 'active_paid',
    annualContractStartedAt: startIso,
    annualContractEndsAt: endIso,
    subscriptionExpires: endIso,
    dullStartedAt: null,
    purgeAt: null,
    isActive: true,
    lastUpdated: now.toISOString(),
  });

  await reconcileBusinessRevocableCreditsForDull({
    userId: params.ownerUid,
    businessCardId: params.cardId,
    revoke: false,
  });
}
