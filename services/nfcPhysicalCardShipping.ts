import type { AddOnsConfig } from '@/services/tiersConfigService';

/** Zonas de envío publicadas en `system_config/tiers.addOns` (CMS). */
export type NfcPhysicalShippingZone = 'us_domestic' | 'mx_ca' | 'international';

/**
 * Mapea ISO 3166-1 alpha-2 → zona de precio de envío.
 * ZZ = “otros / no listado” → internacional.
 */
export function resolveNfcPhysicalShippingZone(countryIso2: string): NfcPhysicalShippingZone {
  const c = String(countryIso2 ?? '')
    .trim()
    .toUpperCase();
  if (c === 'US') return 'us_domestic';
  if (c === 'MX' || c === 'CA') return 'mx_ca';
  return 'international';
}

export function nfcPhysicalShippingUsd(zone: NfcPhysicalShippingZone, addOns: AddOnsConfig): number {
  switch (zone) {
    case 'us_domestic':
      return Math.max(0, addOns.shippingUsDomesticUsd);
    case 'mx_ca':
      return Math.max(0, addOns.shippingMxCaUsd);
    default:
      return Math.max(0, addOns.shippingInternationalUsd);
  }
}

export function nfcPhysicalCardCs(material: 'pvc' | 'metal', addOns: AddOnsConfig): number {
  return material === 'pvc'
    ? Math.max(0, Math.floor(addOns.physicalPvcCardCs))
    : Math.max(0, Math.floor(addOns.physicalMetalCardCs));
}

export function nfcPhysicalShippingCs(zone: NfcPhysicalShippingZone, addOns: AddOnsConfig): number {
  switch (zone) {
    case 'us_domestic':
      return Math.max(0, Math.floor(addOns.shippingUsDomesticCs));
    case 'mx_ca':
      return Math.max(0, Math.floor(addOns.shippingMxCaCs));
    default:
      return Math.max(0, Math.floor(addOns.shippingInternationalCs));
  }
}

/**
 * Países/territorios más frecuentes para el selector + ZZ (otros = internacional).
 * Sin hardcode de precios: solo códigos; los USD vienen de Firestore.
 */
export const NFC_PHYSICAL_CARD_SHIPPING_COUNTRY_CODES: readonly string[] = [
  'US',
  'CA',
  'MX',
  'ZZ',
  'AR',
  'AU',
  'AT',
  'BE',
  'BR',
  'CL',
  'CN',
  'CO',
  'CR',
  'CZ',
  'DK',
  'DO',
  'EC',
  'EG',
  'SV',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'GT',
  'HN',
  'HK',
  'HU',
  'IN',
  'ID',
  'IE',
  'IL',
  'IT',
  'JM',
  'JP',
  'KE',
  'KR',
  'KW',
  'LB',
  'LU',
  'MY',
  'MT',
  'MA',
  'NL',
  'NZ',
  'NI',
  'NG',
  'NO',
  'PA',
  'PY',
  'PE',
  'PH',
  'PL',
  'PT',
  'PR',
  'QA',
  'RO',
  'SA',
  'SG',
  'SK',
  'SI',
  'ZA',
  'ES',
  'SE',
  'CH',
  'TW',
  'TH',
  'TT',
  'TR',
  'AE',
  'GB',
  'UY',
  'VE',
  'VN',
];

export function sortNfcShippingCountryCodesForLocale(
  codes: readonly string[],
  intlLocale: string,
): string[] {
  const seen = new Set<string>();
  const unique = codes.filter((c) => {
    const u = String(c).toUpperCase();
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
  try {
    const dn = new Intl.DisplayNames([intlLocale], { type: 'region' });
    return [...unique].sort((a, b) => {
      const la = a === 'ZZ' ? '\uFFFF' : (dn.of(a) || a);
      const lb = b === 'ZZ' ? '\uFFFF' : (dn.of(b) || b);
      return la.localeCompare(lb, intlLocale);
    });
  } catch {
    return [...unique].sort();
  }
}
