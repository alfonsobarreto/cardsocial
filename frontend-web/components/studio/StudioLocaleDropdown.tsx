'use client';

import { useId } from 'react';
import { studioT, type StudioLocale } from '@/lib/studioI18n';
import { studioTheme } from '@/lib/studioTheme';

const SUPPORTED: StudioLocale[] = ['es', 'en', 'it', 'fr', 'pt', 'de'];

type Props = {
  locale: StudioLocale;
  onChange: (next: StudioLocale) => void;
  /** Visible label for accessibility */
  label: string;
  /** `header` = compact row for Studio top bar; `default` = labeled row */
  variant?: 'default' | 'header';
};

/**
 * Compact language control for Studio (6 locales: ES, EN, IT, FR, PT, DE).
 * Replaces chip rows with a single premium-styled dropdown.
 */
export function StudioLocaleDropdown({ locale, onChange, label, variant = 'default' }: Props) {
  const selectId = useId();
  const isHeader = variant === 'header';

  return (
    <label
      htmlFor={selectId}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        margin: 0,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: studioTheme.textSubtle,
          letterSpacing: 0.6,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <select
          id={selectId}
          name="studioLocale"
          value={locale}
          aria-label={label}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'es' || v === 'en' || v === 'it' || v === 'fr' || v === 'pt' || v === 'de') onChange(v);
          }}
          style={{
            padding: isHeader ? '7px 32px 7px 12px' : '8px 32px 8px 11px',
            borderRadius: 10,
            border: `1px solid ${studioTheme.borderStrong}`,
            background: `linear-gradient(180deg, ${studioTheme.surfaceElevated} 0%, ${studioTheme.surface} 100%)`,
            color: studioTheme.gold,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.4,
            cursor: 'pointer',
            minWidth: isHeader ? 128 : 120,
            maxWidth: 200,
            boxShadow: '0 4px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(47,123,255,0.12)',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
        >
          {SUPPORTED.map((l) => (
            <option key={l} value={l} style={{ background: '#141414', color: studioTheme.gold }}>
              {studioT(locale, `lang.${l}`)} ({l.toUpperCase()})
            </option>
          ))}
        </select>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 11,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: studioTheme.goldLight,
            fontSize: 9,
            lineHeight: 1,
          }}
        >
          ▼
        </span>
      </div>
    </label>
  );
}
