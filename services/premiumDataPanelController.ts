/**
 * Panel global tipo “action sheet” para mostrar datos de bóveda / enlaces sin Alert.alert.
 * El host React (`PremiumDataPanelHost`) se suscribe y renderiza la UI.
 */

export type PremiumPanelActionVariant = 'primary' | 'secondary' | 'destructive';

export type PremiumPanelAction = {
  label: string;
  variant?: PremiumPanelActionVariant;
  onPress: () => void;
};

export type PremiumDataPanelPayload = {
  title: string;
  /**
   * `sovereign-text`: vista búnker (negro, primera línea como titular); solo para cuerpos multi-línea de texto.
   * Default: hoja inferior existente.
   */
  presentation?: 'default' | 'sovereign-text';
  /** Texto principal (p. ej. URL truncada, texto largo). */
  body?: string;
  /** Nombre de icono MaterialCommunityIcons. */
  icon?: string;
  /** Si se omite y hay `body`, se copia `body`. */
  copyText?: string;
  actions?: PremiumPanelAction[];
  /** Modo selector de cliente de correo (iOS). */
  emailOptions?: Array<{ key: string; label: string; onPress: () => void }>;
  /** Email mostrado bajo el título cuando hay `emailOptions`. */
  email?: string;
  dismissOnBackdropPress?: boolean;
  /** Oculta el botón de copiar aunque haya texto (p. ej. mensaje de llamada en curso). */
  hideCopy?: boolean;
};

type Listener = (payload: PremiumDataPanelPayload | null) => void;

const listeners = new Set<Listener>();

export function subscribePremiumDataPanel(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function presentPremiumDataPanel(payload: PremiumDataPanelPayload): void {
  listeners.forEach((fn) => fn(payload));
}

export function dismissPremiumDataPanel(): void {
  listeners.forEach((fn) => fn(null));
}
