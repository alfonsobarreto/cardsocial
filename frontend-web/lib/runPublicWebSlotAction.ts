/**
 * Tarjetas públicas (Next, `/b/…` y `/u/…`): al tocar un slot, enlace y documento
 * se abren de inmediato en el navegador (sin hojas modales de confirmación).
 * Tel/mail usan el esquema del sistema; solo Ghost-Link muestra un interstitial (app).
 * Ver `components/MirrorActionModals.tsx` (solo kind `ghost`).
 */
import {
  buildLinkOpenCandidates,
  getMirrorVaultOpenPlan,
  normalizeTelDialString,
} from '@card-social/services/mirrorVaultItemOpenPlan';
import type { MirrorOpenPlan, MirrorOpenPlanContext } from '@card-social/services/mirrorVaultItemOpenPlan';
import type { CardData, PublicSlot } from '@/lib/universalCardTypes';
import { resolvePublicVaultUrlForWeb } from '@/lib/resolvePublicVaultMediaUrl';
import { openUrlInNewTabReliably } from '@/lib/openUrlInNewTab';
import { notifyPublicBusinessCardIconClick, notifyPublicSmartCardIconClick } from '@/lib/publicBusinessCardAnalytics';

function buildContext(card: CardData): MirrorOpenPlanContext {
  return {
    cardOwnerUid: String(card.uid || '').trim(),
    sid: String(card.sid || '').trim(),
    bId: String(card.bId || '').trim(),
    sourceCardName: String(card.scName || card.ownerDisplayName || 'Card-Social'),
  };
}

export type RunPublicWebSlotResult =
  | { kind: 'done' }
  | { kind: 'ghost'; plan: Extract<MirrorOpenPlan, { kind: 'ghost' }> }
  | { kind: 'text_sheet'; title: string; value: string };

/**
 * @returns `ghost` si el caller debe montar `MirrorActionModals`; si no, acción ya ejecutada.
 */
export function runPublicWebSlotAction(card: CardData, slot: PublicSlot): RunPublicWebSlotResult {
  const ownerUid = String(card.uid || '').trim();
  const bizId = String(card.bId || '').trim();
  const smartSid = String(card.sid || '').trim();
  const slotId = String(slot.itemId || '').trim();
  const subType = slotId || String(slot.type || slot.label || 'unknown').trim() || 'unknown';
  if (ownerUid && bizId) {
    notifyPublicBusinessCardIconClick(ownerUid, bizId, { subType, slotId });
  } else if (ownerUid && smartSid) {
    notifyPublicSmartCardIconClick(ownerUid, smartSid, { subType, slotId });
  }

  const plan = getMirrorVaultOpenPlan(
    {
      type: slot.type,
      value: slot.value,
      title: String(slot.label || '').trim() || '—',
      vaultMimeType: slot.vaultMimeType ?? undefined,
    },
    buildContext(card),
  );

  if (plan.kind === 'ghost') {
    return { kind: 'ghost', plan };
  }

  if (plan.kind === 'link') {
    const candidates = buildLinkOpenCandidates(plan.url);
    const httpsUrl = candidates[candidates.length - 1];
    if (httpsUrl) {
      openUrlInNewTabReliably(httpsUrl);
    }
    return { kind: 'done' };
  }

  if (plan.kind === 'phone') {
    const c = normalizeTelDialString(plan.value);
    if (c) {
      window.location.assign(`tel:${c}`);
    }
    return { kind: 'done' };
  }

  if (plan.kind === 'email') {
    const e = String(plan.value || '').trim();
    if (e) {
      window.location.assign(`mailto:${e}`);
    }
    return { kind: 'done' };
  }

  if (plan.kind === 'document') {
    const uRaw = plan.value.trim();
    const u = resolvePublicVaultUrlForWeb(uRaw) ?? uRaw;
    if (u.startsWith('http://') || u.startsWith('https://')) {
      openUrlInNewTabReliably(u);
    }
    return { kind: 'done' };
  }

  if (plan.kind === 'text' || plan.kind === 'raw') {
    const t = String(plan.value || '').trim();
    if (t) {
      return {
        kind: 'text_sheet',
        title: plan.title || '—',
        value: t,
      };
    }
    return { kind: 'done' };
  }

  return { kind: 'done' };
}
