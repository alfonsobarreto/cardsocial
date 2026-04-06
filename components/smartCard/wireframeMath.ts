/**
 * Misma geometría de rejilla que Mis Tarjetas (Stitch / wireframe).
 */

export const WIREFRAME_MAX_ICONS = 24;

/** Máx. 3 filas. 1–3: una fila; 4–8: dos filas; 9–12: tres filas (reparto equilibrado). */
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

export function computeStitchWireframeBubbleSide(
  usableW: number,
  gridH: number,
  rowPlan: number[],
  gap: number,
  rowGapV: number,
  themeIconLabelFontSize: number,
): number {
  if (rowPlan.length === 0 || usableW <= 0 || gridH <= 0) return 0;

  const totalIcons = rowPlan.reduce((a, b) => a + b, 0);
  let sideFromW: number;

  if (totalIcons <= 1) {
    sideFromW = Math.min(WIREFRAME_STITCH_SINGLE_MAX_SIDE, usableW);
  } else {
    let sW = Number.POSITIVE_INFINITY;
    for (const cols of rowPlan) {
      if (cols <= 0) continue;
      const raw = (usableW - gap * (cols - 1)) / cols;
      if (Number.isFinite(raw) && raw > 0) {
        sW = Math.min(sW, raw);
      }
    }
    if (!Number.isFinite(sW) || sW <= 0) return 0;
    sideFromW = sW;
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
    return Math.min(
      Math.floor(sideFromW),
      Math.max(0, Math.floor((gridH - betweenRows) / numRows - WIREFRAME_SLOT_LABEL_RESERVE)),
    );
  }
  return best;
}

export function getPreviewModalStackSize(screenH: number, iconSlotCount: number): { height: number; maxHeight: number } {
  const rowCount = Math.max(1, getWireframeIconRowPlan(iconSlotCount).length);
  const threeRows = rowCount >= 3;
  const fraction = threeRows ? 0.84 : 0.74;
  const capPx = threeRows ? 800 : 680;
  return {
    height: Math.min(screenH * fraction, capPx),
    maxHeight: screenH * 0.92,
  };
}
