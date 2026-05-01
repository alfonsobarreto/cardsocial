import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

let configured = false;

/**
 * Inicializa el SDK de RevenueCat una vez (equivalente al `useEffect` + `Purchases.configure` del quickstart).
 * Claves públicas solo en .env (Expo): EXPO_PUBLIC_REVENUECAT_IOS_API_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
 * o EXPO_PUBLIC_REVENUECAT_API_KEY — nunca hardcode en repo.
 *
 * @see https://www.revenuecat.com/docs/getting-started/installation/reactnative
 * @see https://www.revenuecat.com/docs/getting-started/installation/expo
 */
export function initRevenueCatOnce(): void {
  if (configured) return;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  const ios = String(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '').trim();
  const android = String(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '').trim();
  const shared = String(process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || '').trim();

  const apiKey =
    Platform.OS === 'ios' ? ios || shared : Platform.OS === 'android' ? android || shared : '';

  if (!apiKey) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[RevenueCat] Sin EXPO_PUBLIC_REVENUECAT_* en .env: añade la API Key pública del wizard (SDK) para iOS/Android.',
      );
    }
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
  }

  Purchases.configure({ apiKey });
  configured = true;
}
