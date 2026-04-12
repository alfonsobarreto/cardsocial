import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import axios from 'axios';
import { getActiveUserId } from '@/services/authSession';

function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim();
  if (!envUrl) throw new Error('Missing EXPO_PUBLIC_MODERATION_API_URL.');
  return envUrl.replace(/\/+$/, '');
}

function getGatewayKey(): string {
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) throw new Error('Missing EXPO_PUBLIC_MODERATION_GATEWAY_KEY.');
  return key;
}

async function getQrScopedJwt(ownerUid: string): Promise<string> {
  const response = await axios.post(
    `${getApiBaseUrl()}/api/auth/token`,
    { ownerUid, scope: 'qr.access' },
    { headers: { 'x-api-gateway-key': getGatewayKey() }, timeout: 15000 },
  );
  return String(response?.data?.token || '').trim();
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const isGhostLink = data?.type === 'ghost-link-incoming';
    return {
      shouldShowAlert: !isGhostLink,
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

export async function registerPushToken(): Promise<void> {
  try {
    const ownerUid = await getActiveUserId();
    if (!ownerUid) return;

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

    const jwt = await getQrScopedJwt(ownerUid);
    await axios.post(
      `${getApiBaseUrl()}/api/qr/push/register`,
      { ownerUid, token },
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
