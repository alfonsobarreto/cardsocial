import { getActiveUserId } from '@/services/authSession';
import { trackCardAnalyticsEvent } from '@/services/qrApi';

/** Envía evento de conversión sin bloquear la UI (Fase 2). */
export function trackCardAnalyticsFireAndForget(params: {
  cardId: string | null | undefined;
  iconType: string;
  source: 'search' | 'story' | 'card' | 'qr_scan';
}): void {
  const id = String(params.cardId || '').trim();
  if (!id) {
    return;
  }
  void (async () => {
    const uid = await getActiveUserId();
    if (!uid) {
      return;
    }
    try {
      await trackCardAnalyticsEvent({
        ownerUid: uid,
        cardId: id,
        iconType: params.iconType,
        source: params.source,
      });
    } catch {
      /* red silenciosa */
    }
  })();
}
