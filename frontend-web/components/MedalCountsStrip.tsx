'use client';

/**
 * Franja de medallas en tarjeta pública web (`/b/…`, `/u/…`) — mismo layout que la cápsula del mirror
 * con `medalPills` en `IsolatedWireframeCard.tsx` (icono MDI + contador).
 */
import type { CardTheme } from '@/lib/themes';
import type { PublicMedalStripDef } from '@/lib/businessMedalDefinitions';
import { resolvePillForegroundColor } from '@card-social/services/pillForegroundColor';

/** Igual que `IsolatedWireframeCard` cápsula espejo (`capsuleStyle`). */
const MEDAL_CAPSULE_PILL_BG = 'rgba(255,255,255,0.12)';

/** Proporción 5:4 (ancho × alto); escala visual ≈ 4/3 respecto al tamaño base. */
const MEDAL_ICON_W = 27;
const MEDAL_ICON_H = 21;

type Props = {
  theme: CardTheme;
  locale: 'es' | 'en';
  defs: readonly PublicMedalStripDef[];
  /** Conteos desde `medals/{bId}` o `medals/{sid}` según tipo de tarjeta. */
  medalCounts?: Record<string, number> | null;
};

export default function MedalCountsStrip({ theme, locale, defs, medalCounts }: Props) {
  const bd = theme.border;
  const fg = resolvePillForegroundColor({
    cardGradient: theme.background,
    pillBackground: MEDAL_CAPSULE_PILL_BG,
    preferredColor: theme.icon.color,
    minContrast: 3,
  });

  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  const counts = medalCounts || {};

  return (
    <div
      role="region"
      aria-label={tr('Medallas públicas', 'Public medals')}
      style={{
        width: '100%',
        marginTop: 6,
        paddingLeft: 2,
        paddingRight: 2,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-evenly',
          flexWrap: 'nowrap',
          gap: 5,
          borderRadius: 999,
          backgroundColor: MEDAL_CAPSULE_PILL_BG,
          borderWidth: Math.max(1, bd.width),
          borderStyle: 'solid',
          borderColor: bd.color,
          padding: '12px 12px',
          boxSizing: 'border-box',
        }}
      >
        {defs.map((m) => {
          const raw = counts[m.key];
          const num = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
          const label = locale === 'es' ? m.labelEs : m.labelEn;
          return (
            <div
              key={m.key}
              style={{
                display: 'inline-flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                flexShrink: 1,
                minWidth: 0,
              }}
              title={`${label}: ${num}`}
            >
              <svg
                width={MEDAL_ICON_W}
                height={MEDAL_ICON_H}
                viewBox="0 0 24 24"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden
                style={{ flexShrink: 0 }}
              >
                <path fill={fg} d={m.path} />
              </svg>
              <span
                style={{
                  color: fg,
                  fontSize: 16,
                  fontWeight: 600,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {num}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
