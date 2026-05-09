/**
 * Analytics anónimos para `/b/:bId` contra `POST /api/public/analytics/track`.
 * Prioriza api público; en local usa `NEXT_PUBLIC_API_URL`.
 */

export function resolvePublicBusinessCardAnalyticsApiBase(): string {
  const raw =
    (typeof process !== 'undefined' &&
      (process.env.NEXT_PUBLIC_ANALYTICS_API_URL?.trim() ||
        process.env.NEXT_PUBLIC_API_URL?.trim() ||
        '')) ||
    '';
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : 'https://api.cardsocial.me';
}

function sessionViewKey(ownerUid: string, bId: string): string {
  return `cs_pub_bc_view_v1:${bId}:${ownerUid}`;
}

function postAnalytics(body: Record<string, unknown>): void {
  const base = resolvePublicBusinessCardAnalyticsApiBase();
  const url = `${base}/api/public/analytics/track`;

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json;charset=UTF-8' });
      if (navigator.sendBeacon(url, blob)) {
        return;
      }
    }
  } catch {
    /* siguiente fallback */
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
    mode: 'cors',
  }).catch(() => undefined);
}

/**
 * Una vista por pestaña por tarjeta (evita React Strict dev double-mount + refrescos triviales dentro de sesión).
 * Aún así el servidor aplica rate limit por IP.
 */
export function trackPublicBusinessCardViewOncePerSession(ownerUid: string, bId: string): void {
  if (typeof window === 'undefined') return;
  const u = String(ownerUid || '').trim();
  const b = String(bId || '').trim();
  if (!u || !b) return;

  try {
    const k = sessionViewKey(u, b);
    if (window.sessionStorage.getItem(k)) return;
    window.sessionStorage.setItem(k, '1');
  } catch {
    /* sessionStorage blocked: still send once this load */
  }

  postAnalytics({
    uid: u,
    bId: b,
    eventType: 'view',
    subType: 'modal_open',
    source: 'public_web',
    timestamp: new Date().toISOString(),
  });
}

export function notifyPublicBusinessCardIconClick(
  ownerUid: string,
  bId: string,
  opts: { subType: string },
): void {
  if (typeof window === 'undefined') return;
  const u = String(ownerUid || '').trim();
  const b = String(bId || '').trim();
  const rawSub = String(opts.subType || 'unknown').trim().slice(0, 160);
  if (!u || !b || !rawSub) return;

  postAnalytics({
    uid: u,
    bId: b,
    eventType: 'click',
    subType: rawSub,
    source: 'public_web',
    timestamp: new Date().toISOString(),
  });
}
