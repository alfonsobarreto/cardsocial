import {
  BRAND_NODES_MESH_DAY,
  BRAND_NODES_MESH_NIGHT,
  brandNodesBaseColor,
  type BrandNodesMode,
} from '../../../styles/brandNodesMesh';

type Props = {
  mode: BrandNodesMode;
  className?: string;
};

const VIEW = 100;

const DEFAULT_MESH_OPACITY = { day: 0.28, night: 0.36 } as const;

export function BrandNodesBackground({ mode, className = '' }: Props) {
  const mesh = mode === 'night' ? BRAND_NODES_MESH_NIGHT : BRAND_NODES_MESH_DAY;
  const base = brandNodesBaseColor(mode);
  const svgOpacity = DEFAULT_MESH_OPACITY[mode];

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ backgroundColor: base, zIndex: 0 }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
        style={{ opacity: svgOpacity }}
      >
        <defs>
          <filter id="admin-brand-node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          {mesh.orbs.map((orb, i) => (
            <radialGradient key={`orb-grad-${i}`} id={`admin-brand-orb-${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={orb.fill} stopOpacity="1" />
              <stop offset="100%" stopColor={orb.fill} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {mesh.orbs.map((orb, i) => (
          <circle key={`orb-${i}`} cx={orb.cx * VIEW} cy={orb.cy * VIEW} r={orb.r} fill={`url(#admin-brand-orb-${i})`} />
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
                  r={node.r * 2.8}
                  fill={node.fill}
                  opacity={0.22}
                  filter="url(#admin-brand-node-glow)"
                />
              ) : null}
              <circle cx={node.x * VIEW} cy={node.y * VIEW} r={node.r} fill={node.fill} opacity={mode === 'night' ? 0.88 : 0.72} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
