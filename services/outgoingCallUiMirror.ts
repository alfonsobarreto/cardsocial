/**
 * Espejo UI saliente Ghost-Link — Smart Card (`cardType !== 'business'`).
 *
 * Contrato (misma semántica en historial Calls, Confirm, Outgoing, FaceCall caller):
 * - `userAvatarUrl` — foto de perfil del **contacto** al que llamas (en sesión: `GhostCallData.peerPhotoUrl` === ese avatar).
 * - `cardName` — nombre de la **tarjeta** (título); en historial: `CallHistoryRow.cardName` → `scName` → `displayCardName` → `sourceCardName`.
 * - `userFullName` — nombre completo del **contacto** (subtítulo); en sesión: `GhostCallData.peerFullName` preferente.
 *
 * Los slots de UI (`titleBold`, `subtitleLine`, `ringUrl`) se rellenan desde esas tres ideas; ver `OutgoingCallUiMirror`.
 *
 * @see docs/CONTRACT_SMART_CARDS.md — saliente Smart
 */
import type { CallHistoryRow } from '@/services/qrApi';
import type { GhostCallData } from '@/services/GhostLinkCallProvider';

/** Mismo contrato que el wire Ghost-Link / `toOutgoingCallerDisplayCard`. */
export type GhostCallWireInput = {
  cardType: 'business' | 'smart' | 'personal';
  key: string;
  ownerUid: string;
  bcName?: string | null;
  bcLogoUrl?: string | null;
  bcContactName?: string | null;
  peerFullName?: string | null;
  peerName?: string | null;
  peerPhotoUrl?: string | null;
  cardName?: string | null;
  cardPhoto?: string | null;
};

/** Misma marca vacía que la lista Calls (línea subtítulo). */
export const OUTGOING_CALL_EMPTY_LINE = '—';

function nonEmptyUrl(s: string | null | undefined): string | null {
  const t = s != null ? String(s).trim() : '';
  return t.length > 0 ? t : null;
}

function stripSubtitle(raw: string): string {
  const s = raw.replace(/@/g, '').trim();
  return s.length > 0 ? s : OUTGOING_CALL_EMPTY_LINE;
}

/** Prioridad `cardName` en historial (API / log): alinea con contrato Smart saliente. */
function smartOutgoingCardNameFromHistory(item: CallHistoryRow): string {
  const cardName =
    (item.cardName != null && String(item.cardName).trim() ? String(item.cardName).trim() : '') ||
    (item.scName != null && String(item.scName).trim() ? String(item.scName).trim() : '') ||
    (item.displayCardName || '').trim() ||
    (item.sourceCardName || '').trim() ||
    '';
  return cardName || OUTGOING_CALL_EMPTY_LINE;
}

/** `userFullName` del contacto en fila historial (fallbacks API). */
function smartOutgoingUserFullNameFromHistory(item: CallHistoryRow): string {
  const userFullName =
    (item.userFullName != null && String(item.userFullName).trim()
      ? String(item.userFullName).trim()
      : '') ||
    (item.peerFullName || '').trim() ||
    (item.peerPersonalName || '').trim() ||
    '';
  return userFullName;
}

/**
 * Espejo único para UI saliente: lista Calls, Confirm Ghost-Link, Outgoing / video caller.
 * Smart saliente: `ringUrl`/`userAvatarUrl` = avatar contacto; `titleBold` = `cardName`; `subtitleLine` = `userFullName` (sin `@`).
 * Business: campos `bc*` + `titleBold`/`subtitleLine` según contrato negocio.
 */
export type OutgoingCallUiMirror = {
  isBusiness: boolean;
  bcLogoUrl: string | null;
  bcName: string | null;
  bcContactName: string | null;
  displayCardName: string | null;
  sourceCardName: string | null;
  /** Smart saliente: `userAvatarUrl` del contacto (misma URL que `ringUrl` en Smart). */
  userAvatarUrl: string | null;
  peerFullName: string | null;
  peerPersonalName: string | null;
  /** Smart saliente: copia de `userAvatarUrl` (anillo / lista). */
  ringUrl: string | null;
  /** Smart saliente: título = **cardName** (nombre de tarjeta). */
  titleBold: string;
  /** Smart saliente: subtítulo = **userFullName** (display, `@` stripped). */
  subtitleLine: string;
};

function isHistoryBusinessRow(item: CallHistoryRow): boolean {
  return item.cardType === 'business' || item.displayCardIsBusiness === true;
}

/** Fila historial Calls `direction === 'outgoing'`. */
export function outgoingMirrorFromCallHistoryOutgoing(
  item: CallHistoryRow,
  contact: { userAvatarUrl: string | null } | undefined,
): OutgoingCallUiMirror {
  const snap = item.issuerSnapshot;
  if (isHistoryBusinessRow(item)) {
    const bcLogoUrl =
      nonEmptyUrl(item.bcLogoUrl) ?? nonEmptyUrl(snap?.bcLogoUrl ?? undefined) ?? null;
    const bcName = item.bcName != null && String(item.bcName).trim() ? String(item.bcName).trim() : null;
    const bcContactName =
      item.bcContactName != null && String(item.bcContactName).trim()
        ? String(item.bcContactName).trim()
        : null;
    const displayCardName = (item.displayCardName || '').trim() || null;
    const sourceCardName = (item.sourceCardName || '').trim() || null;
    const titleBold =
      (bcName || displayCardName || '').trim() || OUTGOING_CALL_EMPTY_LINE;
    const subtitleLine = bcContactName ? stripSubtitle(bcContactName) : OUTGOING_CALL_EMPTY_LINE;
    return {
      isBusiness: true,
      bcLogoUrl,
      bcName,
      bcContactName,
      displayCardName,
      sourceCardName,
      userAvatarUrl: null,
      peerFullName: (item.peerFullName || '').trim() || null,
      peerPersonalName: (item.peerPersonalName || '').trim() || null,
      ringUrl: bcLogoUrl,
      titleBold,
      subtitleLine,
    };
  }
  const rowAvatar = nonEmptyUrl(item.userAvatarUrl);
  const contactAvatar = contact ? nonEmptyUrl(contact.userAvatarUrl) : null;
  const snapAvatar = nonEmptyUrl(snap?.userAvatarUrl ?? undefined);
  const userAvatarUrl = rowAvatar ?? contactAvatar ?? snapAvatar ?? null;
  const displayCardName = (item.displayCardName || '').trim() || null;
  const sourceCardName = (item.sourceCardName || '').trim() || null;
  const cardName = smartOutgoingCardNameFromHistory(item);
  const userFullName = smartOutgoingUserFullNameFromHistory(item);
  const titleBold = cardName;
  const subtitleLine = userFullName ? stripSubtitle(userFullName) : OUTGOING_CALL_EMPTY_LINE;
  return {
    isBusiness: false,
    bcLogoUrl: null,
    bcName: null,
    bcContactName: null,
    displayCardName,
    sourceCardName,
    userAvatarUrl,
    peerFullName: (item.peerFullName || '').trim() || null,
    peerPersonalName: (item.peerPersonalName || '').trim() || null,
    ringUrl: userAvatarUrl,
    titleBold,
    subtitleLine,
  };
}

/** Sesión Ghost-Link saliente (`ConfirmView`, `OutgoingView`, FaceCall caller). */
export function outgoingMirrorFromGhostCallData(callData: GhostCallData): OutgoingCallUiMirror {
  const { card, peerFullName, peerName, peerPhotoUrl } = callData;
  const isBusiness = card.cardType === 'business';
  if (isBusiness) {
    const bcLogoUrl = nonEmptyUrl(card.bcLogoUrl) ?? nonEmptyUrl(card.cardPhoto) ?? null;
    const bcName = card.bcName != null && String(card.bcName).trim() ? String(card.bcName).trim() : null;
    const bcContactName =
      card.bcContactName != null && String(card.bcContactName).trim()
        ? String(card.bcContactName).trim()
        : null;
    const displayCardName = (card.cardName || '').trim() || null;
    const titleBold = (bcName || displayCardName || '').trim() || OUTGOING_CALL_EMPTY_LINE;
    const subtitleLine = bcContactName ? stripSubtitle(bcContactName) : OUTGOING_CALL_EMPTY_LINE;
    return {
      isBusiness: true,
      bcLogoUrl,
      bcName,
      bcContactName,
      displayCardName,
      sourceCardName: displayCardName,
      userAvatarUrl: null,
      peerFullName: (peerFullName || '').trim() || null,
      peerPersonalName: (peerName || '').trim() || null,
      ringUrl: bcLogoUrl,
      titleBold,
      subtitleLine,
    };
  }
  /** Sesión: `peerPhotoUrl` es el `userAvatarUrl` del contacto en el wire Ghost-Link. */
  const userAvatarUrl = nonEmptyUrl(peerPhotoUrl);
  const cardName = String(card.cardName || '').trim();
  const displayCardName = cardName || null;
  const userFullName = String(peerFullName || '').trim() || String(peerName || '').trim();
  const titleBold = cardName || OUTGOING_CALL_EMPTY_LINE;
  const subtitleLine = userFullName ? stripSubtitle(userFullName) : OUTGOING_CALL_EMPTY_LINE;
  return {
    isBusiness: false,
    bcLogoUrl: null,
    bcName: null,
    bcContactName: null,
    displayCardName,
    sourceCardName: displayCardName,
    userAvatarUrl,
    peerFullName: (peerFullName || '').trim() || null,
    peerPersonalName: (peerName || '').trim() || null,
    ringUrl: userAvatarUrl,
    titleBold,
    subtitleLine,
  };
}

/** Mismo espejo que Ghost live, desde el wire usado por `toOutgoingCallerDisplayCard`. */
export function outgoingMirrorFromGhostWireInput(input: GhostCallWireInput): OutgoingCallUiMirror {
  const isBusiness = input.cardType === 'business';
  if (isBusiness) {
    const bcLogoUrl = nonEmptyUrl(input.bcLogoUrl) ?? nonEmptyUrl(input.cardPhoto) ?? null;
    const bcName = input.bcName != null && String(input.bcName).trim() ? String(input.bcName).trim() : null;
    const bcContactName =
      input.bcContactName != null && String(input.bcContactName).trim()
        ? String(input.bcContactName).trim()
        : null;
    const displayCardName = (input.cardName || '').trim() || null;
    const titleBold = (bcName || displayCardName || '').trim() || OUTGOING_CALL_EMPTY_LINE;
    const subtitleLine = bcContactName ? stripSubtitle(bcContactName) : OUTGOING_CALL_EMPTY_LINE;
    return {
      isBusiness: true,
      bcLogoUrl,
      bcName,
      bcContactName,
      displayCardName,
      sourceCardName: displayCardName,
      userAvatarUrl: null,
      peerFullName: (input.peerFullName || '').trim() || null,
      peerPersonalName: (input.peerName || '').trim() || null,
      ringUrl: bcLogoUrl,
      titleBold,
      subtitleLine,
    };
  }
  const userAvatarUrl = nonEmptyUrl(input.peerPhotoUrl);
  const cardName = String(input.cardName || '').trim();
  const displayCardName = cardName || null;
  const userFullName = String(input.peerFullName || '').trim() || String(input.peerName || '').trim();
  const titleBold = cardName || OUTGOING_CALL_EMPTY_LINE;
  const subtitleLine = userFullName ? stripSubtitle(userFullName) : OUTGOING_CALL_EMPTY_LINE;
  return {
    isBusiness: false,
    bcLogoUrl: null,
    bcName: null,
    bcContactName: null,
    displayCardName,
    sourceCardName: displayCardName,
    userAvatarUrl,
    peerFullName: (input.peerFullName || '').trim() || null,
    peerPersonalName: (input.peerName || '').trim() || null,
    ringUrl: userAvatarUrl,
    titleBold,
    subtitleLine,
  };
}
