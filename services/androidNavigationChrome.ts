import { AppState, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

/**
 * Refuerza la experiencia edge-to-edge en Android.
 *
 * Cruda realidad: ◀ ● ▢ pertenecen al sistema. No se pueden eliminar para siempre
 * en todos los dispositivos/fabricantes, pero sí podemos pedir modo inmersivo y
 * hacer que al aparecer por un gesto se superpongan temporalmente, sin empujar la UI.
 *
 * `isDarkAppBackground`: true si el fondo bajo la barra de sistema es oscuro (botones claros).
 */
export async function applyAndroidNavigationBarChrome(isDarkAppBackground: boolean): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    NavigationBar.setStyle(isDarkAppBackground ? 'dark' : 'light');
  } catch {
    /* noop */
  }
  try {
    await NavigationBar.setButtonStyleAsync(isDarkAppBackground ? 'light' : 'dark');
  } catch {
    /* noop */
  }
  try {
    await NavigationBar.setBehaviorAsync('overlay-swipe');
  } catch {
    /* noop */
  }
  try {
    await NavigationBar.setVisibilityAsync('hidden');
  } catch {
    /* noop: algunos emuladores / edge-to-edge pueden ignorar la llamada */
  }
}

export function installAndroidNavigationBarImmersiveGuard(isDarkAppBackground: boolean): () => void {
  if (Platform.OS !== 'android') {
    return () => {};
  }

  let disposed = false;
  const apply = () => {
    if (!disposed) {
      void applyAndroidNavigationBarChrome(isDarkAppBackground);
    }
  };

  apply();
  const subscription = NavigationBar.addVisibilityListener(({ visibility }) => {
    if (visibility === 'visible') {
      setTimeout(apply, 650);
    }
  });
  const appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      setTimeout(apply, 120);
    }
  });

  return () => {
    disposed = true;
    subscription.remove();
    appStateSubscription.remove();
  };
}
