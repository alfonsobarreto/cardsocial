/**
 * The VoIP / Calls UI boundary.
 *
 * The UI components in the call stack (Confirm modal, Outgoing screen, Calls
 * history row) consume ONE type: `CallDisplayCard`. They never read `bc*` or
 * `user*` fields directly and they never branch on `cardType` to pick a
 * source.
 *
 * All conversion happens here, once, on the producer side:
 *
 *   Business → toCallDisplayCardFromBusiness(BusinessCardDoc)
 *   Smart    → toCallDisplayCardFromSmart(SmartCardDoc)
 *   Wire     → fromWireCallDisplayCard(unknown)   // for history payloads
 *
 * Mapping rules (frozen):
 *   Slot 1 (avatar)   displayPhoto    = bcLogoUrl  | userAvatarUrl
 *   Slot 2 (title)    displayTitle    = bcName     | userFullName
 *   Slot 3 (badge)    displaySubtitle = bcContactName | null
 */

import type {
  BusinessCardDoc,
  CallDisplayCard,
  SmartCardDoc,
} from './types/cards';
import {
  outgoingMirrorFromGhostWireInput,
  OUTGOING_CALL_EMPTY_LINE,
  type GhostCallWireInput,
} from '@/services/outgoingCallUiMirror';

export type { GhostCallWireInput };

/**
 * Re-exporta el tipo canónico `CallDisplayCard` desde este módulo. Los
 * consumidores (overlay VoIP, `qrApi`, `calls.tsx`) importan el tipo y los
 * adapters desde la misma barrera, sin tener que conocer el archivo
 * `services/types/cards.ts`.
 */
export type { CallDisplayCard };

export function toCallDisplayCardFromBusiness(card: BusinessCardDoc): CallDisplayCard {
  return {
    cardType: 'business',
    key: String(card.bId || ''),
    ownerUid: String(card.ownerUid || ''),
    displayTitle: String(card.bcName || ''),
    displayPhoto: card.bcLogoUrl ? String(card.bcLogoUrl) : null,
    displaySubtitle: String(card.bcContactName || '') || null,
  };
}

export function toCallDisplayCardFromSmart(card: SmartCardDoc): CallDisplayCard {
  return {
    cardType: 'smart',
    key: String(card.sid || ''),
    ownerUid: String(card.ownerUid || ''),
    displayTitle: String(card.userFullName || ''),
    displayPhoto: card.userAvatarUrl ? String(card.userAvatarUrl) : null,
    displaySubtitle: null,
  };
}

/**
 * Adapter consumed by VoIP UI components (ConfirmView, OutgoingView, etc.).
 *
 * It takes the mixed `bc*` / `card*` shape that currently flows through the
 * Ghost-Link wire (`GhostLinkSharedCard` + peer display fields) and produces
 * the flat `CallDisplayCard` that the UI renders. Consumers never branch on
 * `cardType` to pick fields anymore — they read `displayTitle` /
 * `displayPhoto` / `displaySubtitle` directly.
 *
 * Mapping rules (frozen — mirror Calls history list):
 *
 *   Business:
 *     displayTitle    = bcName   ?? cardName
 *     displayPhoto    = bcLogoUrl ?? cardPhoto
 *     displaySubtitle = bcContactName   (stripped of leading '@')
 *
 *   Smart / Personal:
 *     displayTitle    = peerFullName ?? peerName ?? cardName
 *     displayPhoto    = peerPhotoUrl ?? cardPhoto
 *     displaySubtitle = null
 *
 * Empty string is treated as "missing". The UI hides whatever slot is null.
 */
export function toCallDisplayCardFromGhostCall(input: GhostCallWireInput): CallDisplayCard {
  return toOutgoingCallerDisplayCard(input);
}

/**
 * Derivado del espejo único `outgoingMirrorFromGhostWireInput` (misma lista Calls saliente).
 */
export function toOutgoingCallerDisplayCard(input: GhostCallWireInput): CallDisplayCard {
  const m = outgoingMirrorFromGhostWireInput(input);
  const sub =
    m.subtitleLine === OUTGOING_CALL_EMPTY_LINE || !String(m.subtitleLine || '').trim()
      ? null
      : m.subtitleLine;
  return {
    cardType: m.isBusiness ? 'business' : 'smart',
    key: String(input.key || ''),
    ownerUid: String(input.ownerUid || ''),
    displayTitle: m.titleBold === OUTGOING_CALL_EMPTY_LINE ? '' : m.titleBold,
    displayPhoto: m.ringUrl,
    displaySubtitle: sub,
  };
}

/**
 * Parse an untrusted payload (e.g. `/api/qr/calls/history` row) into a
 * CallDisplayCard. Unknown fields are dropped, missing fields default to
 * safe empty/null values — the UI renders whatever is present.
 */
export function fromWireCallDisplayCard(raw: unknown): CallDisplayCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const cardTypeRaw = String(obj.cardType ?? '').trim();
  const cardType: CallDisplayCard['cardType'] =
    cardTypeRaw === 'business' ? 'business' : 'smart';

  const key = String(obj.key ?? '').trim();
  if (!key) return null;

  const displayPhotoRaw = String(obj.displayPhoto ?? '').trim();
  const displaySubtitleRaw = String(obj.displaySubtitle ?? '').trim();

  return {
    cardType,
    key,
    ownerUid: String(obj.ownerUid ?? '').trim(),
    displayTitle: String(obj.displayTitle ?? '').trim(),
    displayPhoto: displayPhotoRaw ? displayPhotoRaw : null,
    displaySubtitle: displaySubtitleRaw ? displaySubtitleRaw : null,
  };
}
