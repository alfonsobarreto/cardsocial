/**
 * Malla de nodos conectados — Sistema Visual de Marca (PDF: Nodos + Órbitas).
 * Día: puntos azul/violeta suaves sobre Ice Blue.
 * Noche: constelación luminosa sobre Midnight Navy (inspiración funnel estratégico).
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

export type BrandNodesMesh = {
  nodes: BrandNodePoint[];
  edges: BrandNodeEdge[];
  orbs: BrandDiffuseOrb[];
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

const DAY_NODE_COLORS = [
  brandColors.electricBlue,
  brandColors.digitalViolet,
  'rgba(47, 123, 255, 0.55)',
  'rgba(122, 77, 255, 0.45)',
] as const;

const NIGHT_NODE_COLORS = [
  'rgba(255, 255, 255, 0.72)',
  brandColors.electricBlue,
  brandColors.digitalViolet,
  'rgba(230, 244, 255, 0.55)',
] as const;

export function buildBrandNodesMesh(mode: BrandNodesMode, nodeCount = 34): BrandNodesMesh {
  const rand = mulberry32(mode === 'night' ? 0xca4d50c1 : 0xca4d0a7e);
  const palette = mode === 'night' ? NIGHT_NODE_COLORS : DAY_NODE_COLORS;
  const nodes: BrandNodePoint[] = [];

  for (let i = 0; i < nodeCount; i += 1) {
    const x = 0.04 + rand() * 0.92;
    const y = 0.04 + rand() * 0.92;
    const r = mode === 'night' ? 0.35 + rand() * 0.75 : 0.3 + rand() * 0.6;
    const fill = palette[Math.floor(rand() * palette.length)]!;
    const glow = mode === 'night' && rand() > 0.88;
    nodes.push({ x, y, r, fill, glow });
  }

  const maxDist = mode === 'night' ? 0.22 : 0.18;
  const maxLinks = mode === 'night' ? 2 : 2;
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
      const stroke =
        mode === 'night'
          ? k === 0
            ? brandColors.electricBlue
            : brandColors.digitalViolet
          : brandColors.electricBlue;
      const opacity = mode === 'night' ? 0.06 + (1 - dists[k]!.d / maxDist) * 0.1 : 0.05 + (1 - dists[k]!.d / maxDist) * 0.08;
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

  const orbs: BrandDiffuseOrb[] =
    mode === 'night'
      ? [
          { cx: 0.12, cy: 0.08, r: 22, fill: brandAccentAlpha.glow12 },
          { cx: 0.88, cy: 0.14, r: 24, fill: brandAccentAlpha.glow16 },
          { cx: 0.72, cy: 0.78, r: 18, fill: 'rgba(47, 123, 255, 0.06)' },
        ]
      : [
          { cx: 0.08, cy: 0.12, r: 20, fill: 'rgba(47, 123, 255, 0.05)' },
          { cx: 0.9, cy: 0.2, r: 22, fill: brandAccentAlpha.lavender08 },
          { cx: 0.5, cy: 0.88, r: 16, fill: brandAccentAlpha.ice06 },
        ];

  return { nodes, edges, orbs };
}

export const BRAND_NODES_MESH_DAY = buildBrandNodesMesh('day');
export const BRAND_NODES_MESH_NIGHT = buildBrandNodesMesh('night');

export function brandNodesBaseColor(mode: BrandNodesMode): string {
  return mode === 'night' ? brandColors.midnightNavy : brandColors.iceBlue;
}
