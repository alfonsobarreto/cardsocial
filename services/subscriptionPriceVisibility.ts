/**
 * Reglas de visibilidad para precios publicados (USD + CS).
 * Fuente: Firestore `system_config/*`; consumido por app, landing y admin preview.
 */

export type PricePair = { usd: number; cs: number };

export function normalizePricePair(usd: unknown, cs: unknown): PricePair {
  return {
    usd: Math.max(0, Number(usd) || 0),
    cs: Math.max(0, Math.floor(Number(cs) || 0)),
  };
}

export function normalizeCsBalance(raw: unknown): number {
  return Math.max(0, Math.floor(Number(raw) || 0));
}

/** USD: mostrar solo si el monto publicado es > 0. */
export function shouldShowUsdPrice(pair: PricePair): boolean {
  return pair.usd > 0;
}

/** CS como forma de pago / equivalente: solo si cs > 0 y el usuario tiene saldo. */
export function shouldShowCsPaymentPrice(pair: PricePair, userCsBalance: number): boolean {
  return pair.cs > 0 && normalizeCsBalance(userCsBalance) > 0;
}

/** Fila u opción completa (mensual/anual, add-on, etc.). */
export function shouldShowPriceOption(pair: PricePair, userCsBalance: number): boolean {
  return shouldShowUsdPrice(pair) || shouldShowCsPaymentPrice(pair, userCsBalance);
}

export type FormatUsdOptions = {
  formatUsd: (n: number) => string;
  suffix?: string;
};

export type FormatCsOptions = {
  locale?: string;
  suffix?: string;
};

/** Devuelve null si no debe mostrarse la línea USD. */
export function formatUsdPriceLine(pair: PricePair, opts: FormatUsdOptions): string | null {
  if (!shouldShowUsdPrice(pair)) return null;
  const suffix = opts.suffix ?? '';
  return `${opts.formatUsd(pair.usd)}${suffix}`;
}

/** Devuelve null si no debe mostrarse la línea CS de pago. */
export function formatCsPaymentPriceLine(
  pair: PricePair,
  userCsBalance: number,
  opts: FormatCsOptions = {},
): string | null {
  if (!shouldShowCsPaymentPrice(pair, userCsBalance)) return null;
  const locale = opts.locale ?? undefined;
  const suffix = opts.suffix ?? ' CS';
  return `${pair.cs.toLocaleString(locale)}${suffix}`;
}

/** Une segmentos USD/CS omitiendo los que no aplican. */
export function joinPriceSegments(segments: Array<string | null | undefined>, separator = ' · '): string {
  return segments.filter((s): s is string => Boolean(s && String(s).trim())).join(separator);
}

/** Packs de monedas: `equivalentCs` = créditos entregados, no precio en CS. */
export function shouldShowCreditPackRow(priceUsd: unknown, equivalentCs: unknown): boolean {
  return normalizePricePair(priceUsd, equivalentCs).usd > 0;
}
