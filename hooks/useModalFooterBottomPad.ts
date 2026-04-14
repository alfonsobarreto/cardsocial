import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

const MIN = 20;

/** Botoneras en modales: en Android el hook suele dar bottom=0 dentro del Modal; se combina con métricas iniciales. */
export function useModalFooterBottomPad(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0, MIN);
}
