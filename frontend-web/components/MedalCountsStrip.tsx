'use client';

/**
 * Franja de medallas en tarjeta pública web (`/b/…`, `/u/…`) — mismo layout que la cápsula del mirror
 * con `medalPills` en `IsolatedWireframeCard.tsx` (icono MDI + contador).
 */
import type { CardTheme } from '@/lib/themes';
import type { PublicMedalStripDef } from '@/lib/businessMedalDefinitions';
import { averageCardBackgroundLuminance } from '@/lib/publicEarlyAccessCta';

type Props = {
  theme: CardTheme;
  locale: 'es' | 'en';
  defs: readonly PublicMedalStripDef[];
  /** Conteos desde `medals/{bId}` o `medals/{sid}` según tipo de tarjeta. */
  medalCounts?: Record<string, number> | null;
};

export default function MedalCountsStrip({ theme, locale, defs, medalCounts }: Props) {
  const bd = theme.border;
  const lum = averageCardBackgroundLuminance(theme);
  const lightCard = lum >= 0.45;
  const foreground = lightCard ? 'rgba(17,24,39,0.92)' : 'rgba(253,253,253,0.93)';
  const capsuleBg = lightCard ? 'rgba(17,24,39,0.08)' : 'rgba(255,255,255,0.12)';

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
          gap: 4,
          borderRadius: 999,
          backgroundColor: capsuleBg,
          borderWidth: Math.max(1, bd.width),
          borderStyle: 'solid',
          borderColor: bd.color,
          padding: '10px 10px',
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
                gap: 3,
                flexShrink: 1,
                minWidth: 0,
              }}
              title={`${label}: ${num}`}
            >
              <svg width={17} height={17} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
                <path fill={foreground} d={m.path} />
              </svg>
              <span
                style={{
                  color: foreground,
                  fontSize: 12,
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
