/**
 * Debe coincidir con `components/smartCard/wireframeMath.ts` → getWireframeIconRowPlan.
 */
const WIREFRAME_MAX_ICONS = 24;

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
