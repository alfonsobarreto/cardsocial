'use client';

import { resolveCardStudioFreeIconDef, CARD_STUDIO_FALLBACK_ICON_DEF } from '@/lib/cardStudioFreeIconPaths';
import { studioTheme } from '@/lib/studioTheme';
import type { StudioLocale } from '@/lib/studioI18n';
import { studioT } from '@/lib/studioI18n';
import type { SlotIconDef } from '@/lib/slotIcons';
import { STUDIO_ICON_COUNT, STUDIO_ICON_SECTIONS } from '@/lib/studioIconCatalog';

type Props = {
  locale: StudioLocale;
  onClose: () => void;
  selectedMci: string;
  onSelectIcon: (mci: string) => void;
};

function glyph(def: SlotIconDef, size: number, color: string) {
  return (
    <svg width={size} height={size} viewBox={def.viewBox ?? '0 0 24 24'} style={{ display: 'block', color }}>
      <path d={def.path} fill="currentColor" />
    </svg>
  );
}

function IconCell({ mciName, active, onPick }: { mciName: string; active: boolean; onPick: () => void }) {
  const def = resolveCardStudioFreeIconDef(mciName) ?? CARD_STUDIO_FALLBACK_ICON_DEF;
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        aspectRatio: '1',
        borderRadius: 12,
        background: active ? 'rgba(212, 175, 55, 0.2)' : studioTheme.surfaceElevated,
        border: active ? `2px solid ${studioTheme.gold}` : `1px solid ${studioTheme.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: studioTheme.gold,
        padding: 0,
      }}
      title={mciName}
    >
      {glyph(def, 30, 'currentColor')}
    </button>
  );
}

export default function IconSelectorColumn({ locale, onClose, selectedMci, onSelectIcon }: Props) {
  const t = (k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars);
  const label = (es: string, en: string) => (locale === 'es' ? es : en);
  const norm = (k: string) => k.toLowerCase().replace(/\s+/g, '-');

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
        background: studioTheme.bg,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: `1px solid ${studioTheme.border}`,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: studioTheme.text }}>{t('icons.title')}</h2>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: studioTheme.textMuted, maxWidth: 280, lineHeight: 1.4 }}>
            {t('icons.hint')}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: studioTheme.goldLight }}>
            {t('icons.count', { n: STUDIO_ICON_COUNT })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('column.close')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: `1px solid ${studioTheme.border}`,
            background: 'transparent',
            color: studioTheme.gold,
            fontSize: 18,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {STUDIO_ICON_SECTIONS.map((section) => (
          <section key={section.title} style={{ marginBottom: 22 }}>
            <p style={{ fontSize: 11, color: studioTheme.gold, fontWeight: 700, margin: '0 0 8px' }}>
              {label(section.title, section.titleEn)}
            </p>
            {section.items.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {section.items.map((item) => (
                  <div key={`${section.title}-${item.icon}-${item.label}`} style={{ minWidth: 0 }}>
                    <IconCell
                      mciName={item.icon}
                      active={norm(selectedMci) === norm(item.icon)}
                      onPick={() => {
                        onSelectIcon(item.icon);
                        onClose();
                      }}
                    />
                    <div
                      style={{
                        marginTop: 4,
                        color: studioTheme.textSubtle,
                        fontSize: 10,
                        lineHeight: 1.2,
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={label(item.label, item.labelEn)}
                    >
                      {label(item.label, item.labelEn)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: `1px dashed ${studioTheme.border}`,
                  color: studioTheme.textMuted,
                  fontSize: 12,
                }}
              >
                {label(section.emptyLabel || 'Próximamente', section.emptyLabelEn || 'Coming soon')}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
