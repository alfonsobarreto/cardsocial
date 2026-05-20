import { DeviceEventEmitter } from 'react-native';

/** Evento interno: push remoto (foreground/background/task) o apertura desde notificación. */
export const GHOST_LINK_PUSH_DIGEST_EVENT = 'ghost_link_push_digest';

export type GhostLinkPushDigest =
  | { kind: 'incoming' }
  | { kind: 'cancelled'; inviteId: string };

/**
 * Normaliza el `data` de una notificación Ghost-Link (Expo push) y emite un digest
 * para que `GhostLinkCallProvider` dispare poll / cierre sin depender solo de timers JS.
 */
export function digestGhostLinkRemoteNotificationData(raw: Record<string, unknown> | undefined): void {
  if (!raw) return;
  const type = String(raw.type ?? '').trim();
  if (type === 'ghost-link-incoming') {
    DeviceEventEmitter.emit(GHOST_LINK_PUSH_DIGEST_EVENT, { kind: 'incoming' } satisfies GhostLinkPushDigest);
    return;
  }
  if (type === 'ghost-link-cancelled') {
    const inviteId = String(raw.inviteId ?? '').trim();
    DeviceEventEmitter.emit(GHOST_LINK_PUSH_DIGEST_EVENT, {
      kind: 'cancelled',
      inviteId,
    } satisfies GhostLinkPushDigest);
  }
}

export type GhostLinkPushDigestListener = (detail: GhostLinkPushDigest) => void;

export function subscribeGhostLinkPushDigest(listener: GhostLinkPushDigestListener): () => void {
  const sub = DeviceEventEmitter.addListener(GHOST_LINK_PUSH_DIGEST_EVENT, listener);
  return () => sub.remove();
}
