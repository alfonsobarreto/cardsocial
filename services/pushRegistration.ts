import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import axios from 'axios';
import { getActiveUserId } from '@/services/authSession';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';

function getApiBaseUrl(): string {
  return resolveExpoPublicApiBaseUrl();
}

function getGatewayKey(): string {
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) throw new Error('Missing EXPO_PUBLIC_MODERATION_GATEWAY_KEY.');
  return key;
}

async function getQrScopedJwt(uid: string): Promise<string> {
  const response = await axios.post(
    `${getApiBaseUrl()}/api/auth/token`,
    { uid, scope: 'qr.access' },
    { headers: { 'x-api-gateway-key': getGatewayKey() }, timeout: 15000 },
  );
  return String(response?.data?.token || '').trim();
}

function isGhostLinkVoipNotificationData(data: Record<string, unknown> | undefined): boolean {
  const t = String(data?.type ?? '').trim();
  return t === 'ghost-link-incoming' || t === 'ghost-link-cancelled' || t.startsWith('ghost-link');
}

/**
 * `NotificationBehavior` exige `shouldShowBanner` / `shouldShowList` (Expo SDK 50+).
 * Sin ellas, Android puede mostrar un diálogo/alert nativo roto (p. ej. “Cancelar” ilegible)
 * encima de `GhostLinkCallOverlay` cuando llega el push en primer plano.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const isGhost = isGhostLinkVoipNotificationData(data);
    if (isGhost) {
      return {
        shouldShowAlert: false,
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }
    return {
      shouldShowAlert: false,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync('ghost-link-calls', {
    name: 'Ghost-Link Calls',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** SDK 53+: Expo Go en Android ya no expone push remoto; evita getExpoPushTokenAsync (warning/crash). */
function shouldSkipExpoPushToken(): boolean {
  return Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';
}

export async function registerPushToken(): Promise<void> {
  try {
    const uid = await getActiveUserId();
    if (!uid) return;

    if (shouldSkipExpoPushToken()) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(
          '[Push] Skipped on Android Expo Go — use a development build for remote push (expo.dev/develop/development-builds).',
        );
      }
      return;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId = '63df0a01-75f5-40bf-96be-2fdfde55c77f';
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    if (!token) return;

    const jwt = await getQrScopedJwt(uid);
    await axios.post(
      `${getApiBaseUrl()}/api/qr/push/register`,
      { uid, token },
      {
        headers: {
          'x-api-gateway-key': getGatewayKey(),
          Authorization: `Bearer ${jwt}`,
        },
        timeout: 15000,
      },
    );

    if (__DEV__) {
      console.log('[Push] Token registered:', token.slice(0, 30) + '...');
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[Push] Registration failed:', err);
    }
  }
}
