'use client';

import { studioT, type StudioLocale } from '@/lib/studioI18n';
import { studioTheme } from '@/lib/studioTheme';

const SUPPORTED: StudioLocale[] = ['es', 'en', 'it', 'fr', 'pt', 'de'];

type Props = {
  locale: StudioLocale;
  onChange: (next: StudioLocale) => void;
  /** Visible label for accessibility */
  label: string;
};

/**
 * Single compact control for Studio languages (mobile-friendly vs a row of chips).
 */
export function StudioLocaleDropdown({ locale, onChange, label }: Props) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 800, color: studioTheme.textSubtle, letterSpacing: 0.6 }}>{label}</span>
      <select
        value={locale}
        aria-label={label}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'es' || v === 'en' || v === 'it' || v === 'fr' || v === 'pt' || v === 'de') onChange(v);
        }}
        style={{
          padding: '8px 11px',
          borderRadius: 8,
          border: `1px solid ${studioTheme.border}`,
          background: studioTheme.surface,
          color: studioTheme.text,
          fontSize: 12,
          fontWeight: 800,
          cursor: 'pointer',
          minWidth: 120,
          maxWidth: 160,
        }}
      >
        {SUPPORTED.map((l) => (
          <option key={l} value={l}>
            {studioT(locale, `lang.${l}`)} ({l.toUpperCase()})
          </option>
        ))}
      </select>
    </label>
  );
}
