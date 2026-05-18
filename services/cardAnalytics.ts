import { getActiveUserId } from '@/services/authSession';
import { trackCardAnalyticsEvent } from '@/services/qrApi';

/** Envía evento de conversión sin bloquear la UI (Fase 2). */
export function trackCardAnalyticsFireAndForget(params: {
  sid?: string | null | undefined;
  bId?: string | null | undefined;
  iconType: string;
  source: 'search' | 'card' | 'qr_scan';
}): void {
  const sid = String(params.sid || '').trim();
  const bId = String(params.bId || '').trim();
  if (!sid && !bId) {
    return;
  }
  void (async () => {
    const rawUid = await getActiveUserId();
    const uid = rawUid?.trim() || 'anonymous_guest';
    try {
      await trackCardAnalyticsEvent({
        uid,
        ...(sid ? { sid } : {}),
        ...(bId ? { bId } : {}),
        iconType: params.iconType,
        source: params.source,
      });
    } catch {
      /* red silenciosa */
    }
  })();
}
