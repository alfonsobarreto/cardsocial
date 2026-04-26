/**
 * Iconos genéricos monocromo para prueba social (verticales).
 * Color vía `currentColor` (controlado en CSS).
 */
type IconProps = { className?: string; title: string };

const common = { viewBox: '0 0 48 48', fill: 'none' as const, stroke: 'currentColor' as const, strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function IconRealEstate({ className, title }: IconProps) {
  return (
    <svg {...common} className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M8 22 L24 8 L40 22 V40 H8 Z" />
      <path d="M18 40 V28 H30 V40" />
      <path d="M8 20 H4 V44 H44 V20 H40" opacity={0.45} />
    </svg>
  );
}

export function IconGastronomia({ className, title }: IconProps) {
  return (
    <svg {...common} className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M18 6 V34 C18 36 20 38 22 38 C24 38 26 36 26 34 V6" />
      <path d="M30 6 L33 6 L32 20 L32 40 H28 L28 20 L30 6 Z" />
    </svg>
  );
}

export function IconAgencias({ className, title }: IconProps) {
  return (
    <svg {...common} className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="10" y="12" width="12" height="30" />
      <rect x="26" y="8" width="12" height="34" />
      <path d="M10 20 H22 M10 28 H22 M26 18 H38 M26 24 H32" opacity={0.4} />
    </svg>
  );
}

export function IconStartups({ className, title }: IconProps) {
  return (
    <svg {...common} className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M24 6 C18 14 16 22 16 30 C16 32 18 34 20 34 H28 C30 34 32 32 32 30 C32 22 30 14 24 6 Z" />
      <path d="M20 34 L18 42 M28 34 L30 42" />
      <path d="M24 28 V38" opacity={0.5} />
      <circle cx="24" cy="18" r="2.5" />
    </svg>
  );
}

export function IconEducacion({ className, title }: IconProps) {
  return (
    <svg {...common} className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M4 20 L24 10 L44 20 L24 30 Z" />
      <path d="M4 20 V38 L24 44 V24" />
      <path d="M44 20 V32" />
      <path d="M20 12 L20 4 L28 4 L28 8" />
    </svg>
  );
}
