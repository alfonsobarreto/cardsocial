import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

/**
 * Ajusta contraste de botones de la barra de navegación del sistema en Android
 * cuando la app dibuja edge-to-edge. No reemplaza `SafeAreaInsets`; solo ayuda
 * a que ◀ ● ▢ sigan legibles sobre el `surface` del tab bar / fondo.
 *
 * `isDarkAppBackground`: true si el fondo bajo la barra de sistema es oscuro (botones claros).
 */
export async function applyAndroidNavigationBarChrome(isDarkAppBackground: boolean): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await NavigationBar.setButtonStyleAsync(isDarkAppBackground ? 'light' : 'dark');
  } catch {
    /* noop: algunos emuladores / edge-to-edge pueden ignorar la llamada */
  }
}
