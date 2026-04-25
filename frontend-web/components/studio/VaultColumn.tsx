'use client';

import { isGhostLinkVaultType } from '@card-social/constants/ghostLinkVault';
import { studioGradients, studioTheme } from '@/lib/studioTheme';
import type { StudioLocale } from '@/lib/studioI18n';
import { studioT } from '@/lib/studioI18n';
import { mapServerTypeToForm } from '@/lib/studioFormTypes';
import type { StudioVaultLink } from '@/lib/studioVaultTypes';
import { FREE_TIER_POLICY } from '@card-social/constants/freeTierPolicy';
import StudioMdiGlyph from '@/components/studio/StudioMdiGlyph';

type Props = {
  locale: StudioLocale;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onAddClick: () => void;
  links: StudioVaultLink[];
  onSelectLink: (link: StudioVaultLink) => void;
};

function searchableBlob(l: StudioVaultLink): string {
  return [l.title, l.type, l.value, l.iconName, l.icon, l.id]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(' ');
}

export default function VaultColumn({ locale, searchQuery, onSearchChange, onAddClick, links, onSelectLink }: Props) {
  const t = (k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars);
  const q = searchQuery.trim().toLowerCase();
  const filtered = !q
    ? links
    : links.filter((l) => searchableBlob(l).includes(q));
  const n = links.length;
  const max = FREE_TIER_POLICY.vaultItems;
  const displayType = (rawType: string) => t(`form.type.${mapServerTypeToForm(rawType)}`);

  return (
    <div
      style={{
        width: 'min(100vw, 400px)',
        minWidth: 320,
        maxWidth: 420,
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${studioTheme.border}`,
        background: studioTheme.bg,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '16px 16px 12px',
          borderBottom: `1px solid ${studioTheme.border}`,
          background: studioGradients.brandBar,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: studioTheme.text }}>{t('vault.title')}</h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: studioTheme.goldLight, fontWeight: 600 }}>{t('vault.counter', { n, max })}</p>
        </div>
        <button
          type="button"
          onClick={onAddClick}
          disabled={n >= max}
          aria-label={t('vault.fab')}
          style={{
            width: 50,
            height: 50,
            borderRadius: 16,
            border: `1px solid ${studioTheme.borderStrong}`,
            cursor: n >= max ? 'not-allowed' : 'pointer',
            opacity: n >= max ? 0.4 : 1,
            background: studioGradients.cta,
            color: studioTheme.fabText,
            fontSize: 30,
            fontWeight: 300,
            lineHeight: 1,
            boxShadow: '0 8px 24px rgba(197, 160, 101, 0.35)',
          }}
        >
          +
        </button>
      </div>

      <div style={{ flexShrink: 0, padding: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${studioTheme.border}`,
            background: studioTheme.surfaceElevated,
          }}
        >
          <span style={{ opacity: 0.5 }} aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('vault.search')}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: studioTheme.text,
              fontSize: 14,
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 16px 88px', position: 'relative' }}>
        {filtered.length === 0 ? (
          <p style={{ color: studioTheme.textMuted, fontSize: 14, lineHeight: 1.5, margin: '24px 0' }}>{t('vault.empty')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {filtered.map((l) => {
              const iconKey = l.icon || l.iconName || 'link-variant';
              const ghost = isGhostLinkVaultType(l.type);
              return (
                <li key={l.id} style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => onSelectLink(l)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: 12,
                      borderRadius: 12,
                      border: `1px solid ${studioTheme.border}`,
                      background: studioTheme.surface,
                      color: studioTheme.text,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      <StudioMdiGlyph name={String(iconKey)} size={40} color={studioTheme.gold} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title || '—'}</div>
                      <div style={{ fontSize: 11, color: studioTheme.textMuted, marginTop: 2 }}>{displayType(l.type)}</div>
                      {!ghost && l.value ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: studioTheme.textSubtle,
                            marginTop: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {l.value}
                        </div>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

      </div>
    </div>
  );
}
