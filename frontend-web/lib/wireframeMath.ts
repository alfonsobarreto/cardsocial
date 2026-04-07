/**
 * Copia 1:1 de `components/smartCard/wireframeMath.ts` (Mis Tarjetas / Stitch).
 */

export const WIREFRAME_MAX_ICONS = 24;

export function getWireframeIconRowPlan(count: number): number[] {
  const n = Math.max(0, Math.min(WIREFRAME_MAX_ICONS, Math.floor(count)));
  if (n <= 0) return [];
  if (n <= 3) return [n];
  if (n === 4) return [2, 2];
  if (n === 5) return [2, 3];
  if (n === 6) return [3, 3];
  if (n === 7) return [3, 4];
  if (n === 8) return [4, 4];
  if (n === 9) return [3, 3, 3];
  if (n === 10) return [4, 3, 3];
  if (n === 11) return [4, 4, 3];
  return [4, 4, 4];
}

export const WIREFRAME_SLOT_LABEL_RESERVE = 36;
export const WIREFRAME_STITCH_GAP = 12;
export const WIREFRAME_STITCH_HORIZONTAL_INSET = 48;
export const WIREFRAME_STITCH_SINGLE_MAX_SIDE = 112;

export function wireframeSlotBelowBubbleHeight(bubbleSize: number, iconLabelFontSize: number): number {
  const labelFontSize = Math.max(
    9,
    Math.min(15, Math.round(Math.min(bubbleSize * 0.155, iconLabelFontSize + 5))),
  );
  const labelLineHeight = Math.ceil(labelFontSize * 1.22);
  return 8 + labelLineHeight * 2 + 8 + 6;
}

function sideFromWidth(usableW: number, rowPlan: number[], gap: number): number {
  const totalIcons = rowPlan.reduce((a, b) => a + b, 0);
  if (totalIcons <= 1) {
    return Math.min(WIREFRAME_STITCH_SINGLE_MAX_SIDE, usableW);
  }
  let sW = Number.POSITIVE_INFINITY;
  for (const cols of rowPlan) {
    if (cols <= 0) continue;
    const raw = (usableW - gap * (cols - 1)) / cols;
    if (Number.isFinite(raw) && raw > 0) {
      sW = Math.min(sW, raw);
    }
  }
  return Number.isFinite(sW) && sW > 0 ? sW : 0;
}

export function computeStitchWireframeBubbleSide(
  usableW: number,
  gridH: number,
  rowPlan: number[],
  gap: number,
  rowGapV: number,
  themeIconLabelFontSize: number,
): number {
  if (rowPlan.length === 0 || usableW <= 0) return 0;

  const sideFromW = sideFromWidth(usableW, rowPlan, gap);
  if (sideFromW <= 0) return 0;

  /** Primera pintura / SSR: aún no hay altura del ResizeObserver → no devolver 0 o desaparecen los iconos. */
  if (gridH <= 0) {
    return Math.max(26, Math.min(WIREFRAME_STITCH_SINGLE_MAX_SIDE, Math.floor(sideFromW)));
  }

  const numRows = rowPlan.length;
  const betweenRows = rowGapV * Math.max(0, numRows - 1);

  const fits = (cell: number) => {
    const bubble = Math.max(26, Math.floor(cell));
    const below = wireframeSlotBelowBubbleHeight(bubble, themeIconLabelFontSize);
    return numRows * (bubble + below) + betweenRows <= gridH + 0.5;
  };

  let lo = 26;
  let hi = Math.min(Math.floor(sideFromW), 560);
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best === 0 && numRows > 0) {
    const wCap = Math.floor(sideFromW);
    const hCap = Math.floor((gridH - betweenRows) / numRows - WIREFRAME_SLOT_LABEL_RESERVE);
    const tight = Math.min(wCap, Math.max(0, hCap));
    if (tight >= 26) return tight;
    /** Contenedor bajo pero hay ancho: mostrar iconos aunque roce el overflow. */
    return Math.max(26, Math.min(wCap, WIREFRAME_STITCH_SINGLE_MAX_SIDE));
  }
  return best;
}
