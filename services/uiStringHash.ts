/**
 * Hash estable para claves i18n `ui.x{hex}` a partir del par (es, en) de `tr()`.
 * Debe coincidir con `scripts/extract-tr-pairs.mjs` → `hashPair`.
 */
export function hashUiPair(es: string, en: string): string {
  const s = `${en}\0${es}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}
