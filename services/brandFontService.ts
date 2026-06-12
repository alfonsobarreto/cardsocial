import { brandTypography } from '@/styles/brandTokens';

/** Familia tipográfica principal (Satoshi) — fallback al stack del sistema si no hay TTF empaquetados. */
export const FONT_DISPLAY = brandTypography.primary;

/** Familia secundaria (Inter) — fallback al stack del sistema. */
export const FONT_BODY = brandTypography.secondary;

let brandFontsReady = false;

/** Reserva hook para cargar Satoshi vía expo-font cuando existan archivos en assets/fonts/. */
export async function loadBrandFonts(): Promise<void> {
  brandFontsReady = true;
}

export function displayFont(weight: 'regular' | 'medium' | 'bold' = 'regular'): string {
  if (weight === 'bold') return `${FONT_DISPLAY}-Bold`;
  if (weight === 'medium') return `${FONT_DISPLAY}-Medium`;
  return FONT_DISPLAY;
}

export function isBrandFontsReady(): boolean {
  return brandFontsReady;
}
