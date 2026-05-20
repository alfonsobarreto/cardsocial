import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { BackgroundNotificationResult } from 'expo-notifications/build/BackgroundNotificationTasksModule.types';
import { digestGhostLinkRemoteNotificationData } from '@/services/ghostLinkPushSignals';

/** Nombre estable para `TaskManager.defineTask` / `registerTaskAsync`. */
export const GHOST_LINK_BG_NOTIFICATION_TASK = 'GHOST_LINK_BG_NOTIFICATION_TASK';

function coerceRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function parseJsonObject(maybeJson: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(maybeJson) as unknown;
    return coerceRecord(v);
  } catch {
    return null;
  }
}

/**
 * Extrae el mapa `data` del payload que entrega Expo al task (FCM / APNs formas distintas).
 */
function extractGhostDataFromTaskPayload(
  payload: Notifications.NotificationTaskPayload,
): Record<string, unknown> | null {
  const top = coerceRecord(payload);
  if (!top) return null;

  if ('actionIdentifier' in top) {
    const resp = payload as unknown as Notifications.NotificationResponse;
    const d = resp.notification?.request?.content?.data;
    return coerceRecord(d);
  }

  const dataWrapper = coerceRecord(top.data);
  const dataString =
    dataWrapper != null && typeof dataWrapper.dataString === 'string' ? dataWrapper.dataString : null;
  if (dataString) {
    const parsed = parseJsonObject(dataString);
    if (parsed) return parsed;
  }

  const t = top.type != null ? String(top.type) : '';
  if (t.startsWith('ghost-link')) {
    return top;
  }

  const rm = top.remoteMessage as { data?: Record<string, unknown> } | undefined;
  const flat = rm?.data;
  if (flat && typeof flat === 'object' && !Array.isArray(flat)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(flat as Record<string, unknown>)) {
      if (typeof v === 'string') {
        const parsedInner = parseJsonObject(v);
        out[k] = parsedInner ?? v;
      } else {
        out[k] = v;
      }
    }
    if (String(out.type || '').startsWith('ghost-link')) return out;
  }

  return null;
}

TaskManager.defineTask(GHOST_LINK_BG_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) return BackgroundNotificationResult.Failed;

  try {
    const extracted = extractGhostDataFromTaskPayload(data as Notifications.NotificationTaskPayload);
    if (extracted) digestGhostLinkRemoteNotificationData(extracted);
    return BackgroundNotificationResult.NoData;
  } catch {
    return BackgroundNotificationResult.Failed;
  }
});

let registerOnce: Promise<void> | null = null;

export function registerGhostLinkBackgroundNotificationTask(): Promise<void> {
  if (!registerOnce) {
    registerOnce = (async () => {
      try {
        await Notifications.registerTaskAsync(GHOST_LINK_BG_NOTIFICATION_TASK);
      } catch {
        /* Expo Go, doble registro, o módulo nativo ausente */
      }
    })();
  }
  return registerOnce;
}
