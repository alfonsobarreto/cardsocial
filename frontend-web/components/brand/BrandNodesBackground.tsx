'use client';

import {
  BRAND_NODES_MESH_DAY,
  BRAND_NODES_MESH_NIGHT,
  brandNodesBaseColor,
  type BrandNodesMode,
} from '@card-social/styles/brandNodesMesh';

type Props = {
  mode: BrandNodesMode;
  className?: string;
  style?: React.CSSProperties;
  /** Opacidad de la malla (no del lienzo base). */
  meshOpacity?: number;
};

const VIEW = 100;
const DEFAULT_MESH_OPACITY = { day: 0.28, night: 0.36 } as const;

export default function BrandNodesBackground({ mode, className, style, meshOpacity }: Props) {
  const mesh = mode === 'night' ? BRAND_NODES_MESH_NIGHT : BRAND_NODES_MESH_DAY;
  const base = brandNodesBaseColor(mode);
  const svgOpacity = meshOpacity ?? DEFAULT_MESH_OPACITY[mode];

  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: base,
        ...style,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        style={{ display: 'block', opacity: svgOpacity }}
      >
        <defs>
          <filter id="brand-node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          {mesh.orbs.map((orb, i) => (
            <radialGradient key={`orb-grad-${i}`} id={`brand-orb-grad-${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={orb.fill} stopOpacity="1" />
              <stop offset="100%" stopColor={orb.fill} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        {mesh.orbs.map((orb, i) => (
          <circle
            key={`orb-${i}`}
            cx={orb.cx * VIEW}
            cy={orb.cy * VIEW}
            r={orb.r}
            fill={`url(#brand-orb-grad-${i})`}
          />
        ))}

        <g>
          {mesh.edges.map((edge, i) => (
            <line
              key={`edge-${i}`}
              x1={edge.x1 * VIEW}
              y1={edge.y1 * VIEW}
              x2={edge.x2 * VIEW}
              y2={edge.y2 * VIEW}
              stroke={edge.stroke}
              strokeWidth={mode === 'night' ? 0.35 : 0.28}
              strokeOpacity={edge.opacity}
            />
          ))}
        </g>

        <g>
          {mesh.nodes.map((node, i) => (
            <g key={`node-${i}`}>
              {node.glow ? (
                <circle
                  cx={node.x * VIEW}
                  cy={node.y * VIEW}
                  r={node.r * 2.2}
                  fill={node.fill}
                  opacity={0.1}
                  filter="url(#brand-node-glow)"
                />
              ) : null}
              <circle
                cx={node.x * VIEW}
                cy={node.y * VIEW}
                r={node.r}
                fill={node.fill}
                opacity={mode === 'night' ? 0.7 : 0.55}
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
