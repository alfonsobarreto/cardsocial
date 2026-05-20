import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Padding inferior para listas / ScrollView en pantallas de stack (sin tab bar),
 * para que el contenido no quede bajo la barra de gestos o navegación 3-botones.
 */
export function useScreenContentBottomInset(extra = 16): number {
  const { bottom } = useSafeAreaInsets();
  return extra + bottom;
}
