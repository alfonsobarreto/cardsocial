/**
 * Tarjeta negocio vista en modo espejo (Contactos / link universal sin sesión):
 * igual que `/b/:bId` en web, registra vistas y clics vía POST público sin JWT.
 */
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';

function resolvePublicAnalyticsApiBase(): string | null {
  try {
    return resolveExpoPublicApiBaseUrl();
  } catch {
    const raw = process.env.EXPO_PUBLIC_ANALYTICS_API_URL?.trim()?.replace(/\/+$/, '');
    return raw?.length ? raw : null;
  }
}

function postPublicAnalytics(body: Record<string, unknown>): void {
  const base = resolvePublicAnalyticsApiBase();
  if (!base) return;
  const url = `${base.replace(/\/+$/, '')}/api/public/analytics/track`;
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

const mirrorViewSent = new Set<string>();

/** Una vista deduplicada por clave estable (ej. variant + bId dentro del modal abierto). */
export function mirrorNotifyPublicBizView(ownerUid: string, bId: string, dedupeKey: string): void {
  const u = String(ownerUid || '').trim();
  const b = String(bId || '').trim();
  const dk = String(dedupeKey || '').trim();
  if (!u || !b || !dk) return;
  const seal = `${dk}|${b}|${u}`;
  if (mirrorViewSent.has(seal)) return;
  mirrorViewSent.add(seal);

  postPublicAnalytics({
    uid: u,
    bId: b,
    eventType: 'view',
    subType: 'modal_open',
    source: 'mirror_app',
    timestamp: new Date().toISOString(),
  });
}

export function mirrorNotifyPublicBizIconClick(
  ownerUid: string,
  bId: string,
  opts: { subType: string; slotId?: string },
): void {
  const u = String(ownerUid || '').trim();
  const b = String(bId || '').trim();
  const slotId = String(opts.slotId || '').trim();
  const rawSub = String(opts.subType || slotId || 'unknown').trim().slice(0, 160);
  if (!u || !b || !rawSub) return;

  postPublicAnalytics({
    uid: u,
    bId: b,
    eventType: 'click',
    subType: rawSub,
    ...(slotId ? { slotId } : {}),
    source: 'mirror_app',
    timestamp: new Date().toISOString(),
  });
}
