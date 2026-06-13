/**
 * Wallpaper de marca — referencias del PDF:
 * - Noche (imagen 1, Funnel Estratégico): Midnight Navy + constelación luminosa.
 * - Día (imagen 2, Roadmap Growth): blanco + órbitas suaves + grid de puntos.
 */

import { brandAccentAlpha, brandColors } from './brandTokens';

export type BrandNodesMode = 'day' | 'night';

export type BrandNodePoint = {
  x: number;
  y: number;
  r: number;
  fill: string;
  glow?: boolean;
};

export type BrandNodeEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  opacity: number;
};

export type BrandDiffuseOrb = {
  cx: number;
  cy: number;
  r: number;
  fill: string;
};

/** Arco orbital (día — Roadmap). */
export type BrandOrbitPath = {
  d: string;
  stroke: string;
  opacity: number;
  strokeWidth: number;
};

export type BrandNodesMesh = {
  nodes: BrandNodePoint[];
  edges: BrandNodeEdge[];
  orbs: BrandDiffuseOrb[];
  paths: BrandOrbitPath[];
  dotGrid: BrandNodePoint[];
};

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Día — órbitas, glow central suave, grid de puntos (Roadmap). */
function buildDayMesh(): BrandNodesMesh {
  const paths: BrandOrbitPath[] = [
    {
      d: 'M -8 62 Q 48 18 108 48',
      stroke: brandColors.digitalViolet,
      opacity: 0.14,
      strokeWidth: 0.32,
    },
    {
      d: 'M -5 78 Q 52 42 105 72',
      stroke: brandColors.electricBlue,
      opacity: 0.12,
      strokeWidth: 0.28,
    },
    {
      d: 'M 12 92 Q 55 58 98 88',
      stroke: brandColors.digitalViolet,
      opacity: 0.1,
      strokeWidth: 0.26,
    },
  ];

  const nodes: BrandNodePoint[] = [
    { x: 0.18, y: 0.52, r: 0.45, fill: 'rgba(122, 77, 255, 0.35)' },
    { x: 0.32, y: 0.38, r: 0.4, fill: 'rgba(47, 123, 255, 0.32)' },
    { x: 0.48, y: 0.28, r: 0.5, fill: 'rgba(122, 77, 255, 0.38)' },
    { x: 0.62, y: 0.34, r: 0.42, fill: 'rgba(47, 123, 255, 0.3)' },
    { x: 0.76, y: 0.46, r: 0.45, fill: 'rgba(122, 77, 255, 0.34)' },
    { x: 0.88, y: 0.58, r: 0.4, fill: 'rgba(47, 123, 255, 0.28)' },
    { x: 0.42, y: 0.62, r: 0.35, fill: 'rgba(122, 77, 255, 0.25)' },
    { x: 0.55, y: 0.72, r: 0.38, fill: 'rgba(47, 123, 255, 0.26)' },
  ];

  const edges: BrandNodeEdge[] = [
    { x1: 0.18, y1: 0.52, x2: 0.32, y2: 0.38, stroke: brandColors.digitalViolet, opacity: 0.1 },
    { x1: 0.32, y1: 0.38, x2: 0.48, y2: 0.28, stroke: brandColors.electricBlue, opacity: 0.09 },
    { x1: 0.48, y1: 0.28, x2: 0.62, y2: 0.34, stroke: brandColors.digitalViolet, opacity: 0.09 },
    { x1: 0.62, y1: 0.34, x2: 0.76, y2: 0.46, stroke: brandColors.electricBlue, opacity: 0.08 },
    { x1: 0.76, y1: 0.46, x2: 0.88, y2: 0.58, stroke: brandColors.digitalViolet, opacity: 0.08 },
  ];

  const dotGrid: BrandNodePoint[] = [];
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      dotGrid.push({
        x: 0.8 + col * 0.028,
        y: 0.05 + row * 0.028,
        r: 0.28,
        fill: 'rgba(47, 123, 255, 0.22)',
      });
    }
  }

  const orbs: BrandDiffuseOrb[] = [
    { cx: 0.5, cy: 0.42, r: 38, fill: 'rgba(122, 77, 255, 0.07)' },
    { cx: 0.22, cy: 0.18, r: 18, fill: 'rgba(47, 123, 255, 0.05)' },
    { cx: 0.78, cy: 0.82, r: 16, fill: brandAccentAlpha.lavender08 },
  ];

  return { nodes, edges, orbs, paths, dotGrid };
}

/** Noche — constelación + pulso cyan/violeta (Funnel). */
function buildNightMesh(): BrandNodesMesh {
  const rand = mulberry32(0xca4d50c1);
  const palette = [
    'rgba(255, 255, 255, 0.75)',
    brandColors.electricBlue,
    brandColors.digitalViolet,
    'rgba(230, 244, 255, 0.6)',
    '#4D8FFF',
  ] as const;

  const nodes: BrandNodePoint[] = [];

  // Cluster derecho (red viva — imagen 1)
  for (let i = 0; i < 22; i += 1) {
    const x = 0.52 + rand() * 0.44;
    const y = 0.12 + rand() * 0.78;
    const r = 0.32 + rand() * 0.7;
    const fill = palette[Math.floor(rand() * palette.length)]!;
    const glow = rand() > 0.55;
    nodes.push({ x, y, r, fill, glow });
  }
  // Puntos dispersos izquierda/centro
  for (let i = 0; i < 12; i += 1) {
    const x = 0.04 + rand() * 0.55;
    const y = 0.08 + rand() * 0.84;
    const r = 0.28 + rand() * 0.55;
    const fill = palette[Math.floor(rand() * palette.length)]!;
    const glow = rand() > 0.82;
    nodes.push({ x, y, r, fill, glow });
  }

  const maxDist = 0.2;
  const maxLinks = 2;
  const edgeSet = new Set<string>();
  const edges: BrandNodeEdge[] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const dists: { j: number; d: number }[] = [];
    for (let j = i + 1; j < nodes.length; j += 1) {
      const dx = nodes[i]!.x - nodes[j]!.x;
      const dy = nodes[i]!.y - nodes[j]!.y;
      const d = Math.hypot(dx, dy);
      if (d <= maxDist) {
        dists.push({ j, d });
      }
    }
    dists.sort((a, b) => a.d - b.d);
    for (let k = 0; k < Math.min(maxLinks, dists.length); k += 1) {
      const j = dists[k]!.j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      const stroke = k === 0 ? brandColors.electricBlue : brandColors.digitalViolet;
      const opacity = 0.07 + (1 - dists[k]!.d / maxDist) * 0.12;
      edges.push({
        x1: nodes[i]!.x,
        y1: nodes[i]!.y,
        x2: nodes[j]!.x,
        y2: nodes[j]!.y,
        stroke,
        opacity,
      });
    }
  }

  const orbs: BrandDiffuseOrb[] = [
    { cx: 0.5, cy: 0.5, r: 30, fill: 'rgba(47, 123, 255, 0.06)' },
    { cx: 0.85, cy: 0.35, r: 26, fill: brandAccentAlpha.glow16 },
    { cx: 0.15, cy: 0.12, r: 20, fill: brandAccentAlpha.glow12 },
    { cx: 0.72, cy: 0.82, r: 18, fill: 'rgba(122, 77, 255, 0.08)' },
  ];

  return { nodes, edges, orbs, paths: [], dotGrid: [] };
}

export function buildBrandNodesMesh(mode: BrandNodesMode): BrandNodesMesh {
  return mode === 'night' ? buildNightMesh() : buildDayMesh();
}

export const BRAND_NODES_MESH_DAY = buildDayMesh();
export const BRAND_NODES_MESH_NIGHT = buildNightMesh();

export function brandNodesBaseColor(mode: BrandNodesMode): string {
  return mode === 'night' ? brandColors.midnightNavy : brandColors.white;
}

export const BRAND_MESH_OPACITY = { day: 0.55, night: 0.42 } as const;
