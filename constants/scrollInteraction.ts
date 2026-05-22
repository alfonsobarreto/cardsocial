import type { ViewStyle } from 'react-native';

/**
 * Patrón probado en `app/components/NewInfoForm.tsx` (KeyboardAwareScrollView principal):
 * el contenedor del scroll debe poder crecer al alto visible para que los gestos
 * de arrastre funcionen al tocar fondos vacíos, no solo sobre Inputs/Text.
 */
export const SCROLL_CONTENT_MIN_FILL: ViewStyle = { flexGrow: 1 };

/**
 * `ScrollView` acotado dentro de un modal (theme locker, legal, etc.).
 * `flexShrink` + `minHeight: 0` evitan que el scroll pierda gestos en huecos vacíos.
 */
export const modalBoundedScrollStyle: ViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  minHeight: 0,
};

/** Contenido del theme locker modal: rellena ancho y alto para arrastre fuera de tiles. */
export const themeLockerScrollContentStyle: ViewStyle = {
  ...SCROLL_CONTENT_MIN_FILL,
  width: '100%',
};

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
