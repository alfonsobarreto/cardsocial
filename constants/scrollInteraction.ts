import type { ViewStyle } from 'react-native';

/**
 * Patrón probado en `app/components/NewInfoForm.tsx` (KeyboardAwareScrollView principal):
 * el contenedor del scroll debe poder crecer al alto visible para que los gestos
 * de arrastre funcionen al tocar fondos vacíos, no solo sobre Inputs/Text.
 */
export const SCROLL_CONTENT_MIN_FILL: ViewStyle = { flexGrow: 1 };

/**
 * Props del `KeyboardAwareScrollView` principal del formulario (NewInfoForm).
 * Reutilizar en otras pantallas de formulario para el mismo comportamiento.
 */
export const formKeyboardScrollViewProps = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: 'on-drag' as const,
  nestedScrollEnabled: true,
  scrollEventThrottle: 16,
  contentInsetAdjustmentBehavior: 'automatic' as const,
};

/**
 * `ScrollView` / listas verticales estándar (sin KeyboardAware): taps + arrastre coherente.
 */
export const verticalScrollInteractionProps = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: 'on-drag' as const,
  nestedScrollEnabled: true,
  scrollEventThrottle: 16,
};

/**
 * `FlatList` / `SectionList` largos (listados, mercado, bóveda…).
 */
export const listScrollInteractionProps = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: 'on-drag' as const,
  scrollEventThrottle: 16,
};
