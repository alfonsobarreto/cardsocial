/**
 * Color de primer plano para chips/pastillas sobre el gradiente de la tarjeta.
 * Usa el color de icono del theme si hay contraste suficiente; si no, elige claro u oscuro.
 */

const FALLBACK_DARK = '#071226';
const FALLBACK_LIGHT = '#FFFFFF';

function parseCssColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const s = input.trim();
  if (!s) return null;
  if (s.toLowerCase() === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) {
      h = h.split('').map((c) => c + c).join('');
    }
    if (h.length === 6) {
      const n = parseInt(h, 16);
      if (Number.isNaN(n)) return null;
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    }
    if (h.length === 8) {
      const n = parseInt(h, 16);
      if (Number.isNaN(n)) return null;
      return {
        r: (n >> 24) & 255,
        g: (n >> 16) & 255,
        b: (n >> 8) & 255,
        a: (n & 255) / 255,
      };
    }
    return null;
  }
  const rgb = s.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (rgb) {
    const r = Math.min(255, Math.max(0, Math.round(Number(rgb[1]))));
    const g = Math.min(255, Math.max(0, Math.round(Number(rgb[2]))));
    const b = Math.min(255, Math.max(0, Math.round(Number(rgb[3]))));
    const a = rgb[4] !== undefined ? Math.min(1, Math.max(0, Number(rgb[4]))) : 1;
    return { r, g, b, a };
  }
  return null;
}

function gradientMidRgb(g: [string, string, string]): { r: number; g: number; b: number } {
  const pts = g.map((x) => parseCssColor(x)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (pts.length === 0) {
    return { r: 200, g: 220, b: 240 };
  }
  const sum = pts.reduce(
    (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
    { r: 0, g: 0, b: 0 },
  );
  return {
    r: Math.round(sum.r / pts.length),
    g: Math.round(sum.g / pts.length),
    b: Math.round(sum.b / pts.length),
  };
}

function compositeRgb(
  under: { r: number; g: number; b: number },
  over: { r: number; g: number; b: number; a: number },
): { r: number; g: number; b: number } {
  const a = over.a;
  return {
    r: Math.round(over.r * a + under.r * (1 - a)),
    g: Math.round(over.g * a + under.g * (1 - a)),
    b: Math.round(over.b * a + under.b * (1 - a)),
  };
}

function srgbChannelToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  const R = srgbChannelToLinear(r);
  const G = srgbChannelToLinear(g);
  const B = srgbChannelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(lum1: number, lum2: number): number {
  const L1 = Math.max(lum1, lum2);
  const L2 = Math.min(lum1, lum2);
  return (L1 + 0.05) / (L2 + 0.05);
}

export function resolvePillForegroundColor(options: {
  cardGradient: [string, string, string];
  pillBackground: string;
  preferredColor: string;
  minContrast?: number;
}): string {
  const minC = options.minContrast ?? 3;
  const under = gradientMidRgb(options.cardGradient);
  const pill = parseCssColor(options.pillBackground);
  if (!pill) {
    return options.preferredColor;
  }
  const surface = compositeRgb(under, pill);
  const lumBg = relativeLuminance(surface.r, surface.g, surface.b);

  const pref = parseCssColor(options.preferredColor);
  if (!pref) {
    return FALLBACK_DARK;
  }
  const lumPref = relativeLuminance(pref.r, pref.g, pref.b);
  if (contrastRatio(lumPref, lumBg) >= minC) {
    return options.preferredColor;
  }

  const dark = parseCssColor(FALLBACK_DARK)!;
  const light = parseCssColor(FALLBACK_LIGHT)!;
  const cDark = contrastRatio(relativeLuminance(dark.r, dark.g, dark.b), lumBg);
  const cLight = contrastRatio(relativeLuminance(light.r, light.g, light.b), lumBg);
  return cDark >= cLight ? FALLBACK_DARK : FALLBACK_LIGHT;
}
