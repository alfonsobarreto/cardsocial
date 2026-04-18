/**
 * Identidad del emisor en un solo objeto — siempre derivada de la fuente raíz
 * (Firestore `users/{uid}`, o payload público de API), no copias sueltas por pantalla.
 */

import type { PublicUniversalCardPayload, PublicQrTokenPreview } from '@/services/qrApi';
import {
  readUserAvatarUrl,
  readUserFullName,
  readUserNickName,
  readUserNickNameLower,
  readVoipCanonicalFullName,
} from '@/services/userIdentityFields';
import { toRenderableImageUri } from '@/services/userProfilePhoto';
import { pickIssuerCircleAvatarUrl } from '@/types/sharedCardPresentation';

export type CanonicalIssuerIdentity = {
  uid: string;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  /** Nombre real para VoIP / Ghost-Link (excluye confusión con @nick). */
  voipCanonicalFullName: string;
};

export function emptyCanonicalIssuerIdentity(uid: string): CanonicalIssuerIdentity {
  return {
    uid: String(uid || '').trim(),
    userFullName: '',
    userNickName: '',
    userAvatarUrl: null,
    voipCanonicalFullName: '',
  };
}

export type BuildIssuerIdentityFromFirestoreInput = {
  uid: string;
  userDoc: Record<string, unknown> | undefined;
  authDisplayNameFallback: string;
  authPhotoUrlFallback: string | null;
};

/**
 * Una lectura de `users/{uid}` (+ fallbacks Auth) → un objeto. Misma lógica que antes en `loadOwnerProfile`.
 */
export function buildCanonicalIssuerIdentityFromFirestore(
  input: BuildIssuerIdentityFromFirestoreInput,
): CanonicalIssuerIdentity {
  const { uid, userDoc, authDisplayNameFallback, authPhotoUrlFallback } = input;
  const ouid = String(uid || '').trim();
  if (!userDoc) {
    return {
      uid: ouid,
      userFullName: authDisplayNameFallback,
      userNickName: authDisplayNameFallback,
      userAvatarUrl: toRenderableImageUri(authPhotoUrlFallback) || null,
      voipCanonicalFullName: '',
    };
  }
  const display = readUserFullName(userDoc);
  const userFullName =
    display === 'Usuario'
      ? String(userDoc.firstName || '').trim() || authDisplayNameFallback
      : display;
  const voipCanonicalFullName = readVoipCanonicalFullName(userDoc);
  const userNickName =
    readUserNickName(userDoc) || readUserNickNameLower(userDoc) || authDisplayNameFallback;
  const userAvatarUrl =
    toRenderableImageUri(readUserAvatarUrl(userDoc) || undefined) ||
    toRenderableImageUri(authPhotoUrlFallback) ||
    null;
  return {
    uid: ouid,
    userFullName,
    userNickName,
    userAvatarUrl,
    voipCanonicalFullName,
  };
}

/** Raíz = respuesta `/api/public/universal-card` (persona + campos de tarjeta). */
export function buildCanonicalIssuerIdentityFromPublicUniversalCard(
  card: PublicUniversalCardPayload,
): CanonicalIssuerIdentity {
  const uid = String(card.uid || '').trim();
  const userFullName =
    String(card.userFullName ?? '').trim() ||
    String(card.ownerDisplayName ?? '').trim() ||
    '';
  const userNickName =
    String(card.userNickName ?? '').trim() ||
    String(card.ownerNickname ?? '').trim() ||
    '';
  const userAvatarUrl = pickIssuerCircleAvatarUrl({ userAvatarUrl: card.userAvatarUrl });
  return {
    uid,
    userFullName,
    userNickName,
    userAvatarUrl,
    voipCanonicalFullName: userFullName,
  };
}

/** Raíz = preview QR (`/api/public/qr-token-preview` o equivalente). */
export function buildCanonicalIssuerIdentityFromQrPreview(
  p: PublicQrTokenPreview,
): CanonicalIssuerIdentity {
  const uid = String(p.uid || '').trim();
  const userFullName =
    String(p.userFullName ?? '').trim() ||
    String(p.ownerDisplayName ?? '').trim() ||
    '';
  const userNickName =
    String(p.userNickName ?? '').trim() ||
    String(p.ownerNickname ?? '').trim() ||
    '';
  const userAvatarUrl = pickIssuerCircleAvatarUrl({ userAvatarUrl: p.userAvatarUrl });
  return {
    uid,
    userFullName,
    userNickName,
    userAvatarUrl,
    voipCanonicalFullName: userFullName,
  };
}
