import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Inset inferior para el tab bar (footer) en Expo Router.
 * - iOS: solo `insets.bottom` del sistema (home indicator); sin padding mínimo artificial.
 * - Android edge-to-edge: solo lo que reporta el sistema; si es 0 (p. ej. gestos), el bar
 *   puede ir al borde sin “faja vacía” extra.
 */
export function useTabBarBottomInset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'ios') {
    return insets.bottom;
  }
  return insets.bottom;
}
