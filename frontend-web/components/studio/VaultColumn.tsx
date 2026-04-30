'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isGhostLinkVaultDeletionProtected, isGhostLinkVaultType } from '@card-social/constants/ghostLinkVault';
import { FREE_TIER_POLICY } from '@card-social/constants/freeTierPolicy';
import type { StudioLocale } from '@/lib/studioI18n';
import { studioT } from '@/lib/studioI18n';
import type { StudioVaultLink } from '@/lib/studioVaultTypes';
import { deleteStudioVaultLink, toggleStudioVaultFavorite } from '@/lib/studioVaultService';
import { studioGradients, studioTheme } from '@/lib/studioTheme';
import StudioMdiGlyph from '@/components/studio/StudioMdiGlyph';
import type { StudioProfile } from '@/components/studio/ProfileColumn';

type Props = {
  locale: StudioLocale;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onAddClick: () => void;
  links: StudioVaultLink[];
  onSelectLink: (link: StudioVaultLink) => void;
  userId: string;
  profile: StudioProfile | null;
  /** Si true, muestra contador tipo app premium (`n · Ilimitado`). */
  vaultUnlimited?: boolean;
};

function searchableBlob(l: StudioVaultLink): string {
  return [l.title, l.type, l.value, l.iconName, l.icon, l.id]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(' ');
}

function normalizeVaultType(type: string): string {
  return String(type || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function typeBadgeForItem(
  type: string,
  t: (k: string, vars?: Record<string, string | number>) => string,
): { mdi: string; labelKey: string } | null {
  const n = normalizeVaultType(type);
  const map: Record<string, { mdi: string; labelKey: string }> = {
    enlaces: { mdi: 'link-variant', labelKey: 'form.type.link' },
    email: { mdi: 'email-outline', labelKey: 'form.type.email' },
    'teléfono': { mdi: 'phone-lock', labelKey: 'form.type.phone' },
    telefono: { mdi: 'phone-lock', labelKey: 'form.type.phone' },
    'texto plain': { mdi: 'text-short', labelKey: 'form.type.text' },
    texto: { mdi: 'text-short', labelKey: 'form.type.text' },
    documento: { mdi: 'file-document-outline', labelKey: 'form.type.document' },
    'ghost-link': { mdi: 'phone-in-talk', labelKey: 'form.type.ghost' },
    ghost_link: { mdi: 'phone-in-talk', labelKey: 'form.type.ghost' },
  };
  if (isGhostLinkVaultType(type)) {
    return { mdi: 'phone-in-talk', labelKey: 'form.type.ghost' };
  }
  return map[n] ?? { mdi: 'help-circle-outline', labelKey: 'form.type.link' };
}

export default function VaultColumn({
  locale,
  searchQuery,
  onSearchChange,
  onAddClick,
  links,
  onSelectLink,
  userId,
  profile,
  vaultUnlimited = false,
}: Props) {
  const t = useCallback((k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars), [locale]);
  const q = searchQuery.trim().toLowerCase();
  const filtered = !q ? links : links.filter((l) => searchableBlob(l).includes(q));
  const n = links.length;
  const max = FREE_TIER_POLICY.vaultItems;

  const displayName = String(profile?.userFullName || '').trim() || '—';
  const verified = profile?.verificationStatus === 'verified' || Boolean(profile?.verificationSelfieFileId);

  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuForId) return;
    const onDoc = (e: MouseEvent) => {
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setMenuForId(null);
      }
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [menuForId]);

  const closeMenu = () => setMenuForId(null);

  const onToggleFavorite = async (link: StudioVaultLink) => {
    closeMenu();
    setBusy(link.id);
    try {
      await toggleStudioVaultFavorite(userId, link, !link.isFavorite);
    } catch (e) {
      console.warn(e);
      window.alert(t('vault.err.favorite'));
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async (link: StudioVaultLink) => {
    closeMenu();
    if (isGhostLinkVaultDeletionProtected(link.type) || link.vaultProtected) {
      window.alert(t('vault.protected'));
      return;
    }
    if (!window.confirm(`${t('vault.delete.title')}\n\n${t('vault.delete.body', { title: link.title })}`)) {
      return;
    }
    setBusy(link.id);
    try {
      await deleteStudioVaultLink(userId, link.id);
    } catch (e) {
      console.warn(e);
      window.alert(t('vault.err.delete'));
    } finally {
      setBusy(null);
    }
  };

  const iconInner = (link: StudioVaultLink) => {
    const raw = String(link.icon || link.iconName || 'link-variant').trim() || 'link-variant';
    if (raw.startsWith('http')) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={raw} alt="" style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover', display: 'block' }} />
      );
    }
    return <StudioMdiGlyph name={raw} size={32} color={studioTheme.gold} />;
  };

  const counterLabel = useMemo(() => {
    if (vaultUnlimited) {
      return t('vault.counterUnlimited', { n });
    }
    return t('vault.counter', { n, max });
  }, [vaultUnlimited, n, max, t]);

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
        position: 'relative',
      }}
    >
      {/* Cabecera alineada a vault.tsx (nombre + verificado + contador) */}
      <div
        style={{
          flexShrink: 0,
          padding: '18px 16px 20px',
          borderBottom: `1px solid ${studioTheme.border}`,
          background: 'transparent',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: studioTheme.text, lineHeight: 1.2 }}>{displayName}</span>
          {verified ? (
            <span
              title="Verified"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 999,
                background: '#1d9bf0',
                color: '#fff',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              ✓
            </span>
          ) : null}
        </div>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 22,
            fontWeight: 800,
            color: studioTheme.gold,
            lineHeight: 1.25,
          }}
        >
          {counterLabel}
        </p>
      </div>

      {links.length > 0 ? (
        <div style={{ flexShrink: 0, padding: '10px 14px 4px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 12,
              border: `1px solid ${studioTheme.border}`,
              background: studioTheme.surfaceElevated,
              padding: '0 12px',
              height: 40,
            }}
          >
            <span style={{ opacity: 0.55, fontSize: 15 }} aria-hidden>
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
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: studioTheme.textMuted,
                  cursor: 'pointer',
                  padding: 4,
                  fontSize: 16,
                }}
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <div style={{ height: '100%', overflowY: 'auto', padding: '12px 12px 100px' }}>
          {filtered.length === 0 ? (
            <p style={{ color: studioTheme.textMuted, fontSize: 14, lineHeight: 1.5, margin: '24px 8px' }}>{t('vault.empty')}</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '4px 4px',
                alignItems: 'start',
              }}
            >
              {filtered.map((l) => {
                const badge = typeBadgeForItem(l.type, t);
                const ghost = isGhostLinkVaultType(l.type) || Boolean(l.vaultProtected);
                const canDelete = !isGhostLinkVaultDeletionProtected(l.type) && !l.vaultProtected;
                const menuOpen = menuForId === l.id;
                const isBusy = busy === l.id;

                return (
                  <div key={l.id} style={{ padding: '10px 4px', textAlign: 'center' }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onSelectLink(l)}
                        style={{
                          alignItems: 'center',
                          background: 'transparent',
                          border: 'none',
                          cursor: isBusy ? 'wait' : 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          padding: 0,
                          width: '100%',
                        }}
                      >
                        <div
                          style={{
                            width: 58,
                            height: 58,
                            borderRadius: 999,
                            background: studioTheme.iconCircleBg,
                            boxShadow: '0 3px 6px rgba(0,0,0,0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                          }}
                        >
                          {iconInner(l)}
                          {l.isFavorite ? (
                            <span
                              style={{
                                position: 'absolute',
                                top: -2,
                                left: -2,
                                width: 16,
                                height: 16,
                                borderRadius: 8,
                                background: studioTheme.gold,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 9,
                                lineHeight: 1,
                              }}
                            >
                              ★
                            </span>
                          ) : null}
                          {ghost ? (
                            <span
                              style={{
                                position: 'absolute',
                                bottom: -2,
                                right: -2,
                                width: 18,
                                height: 18,
                                borderRadius: 9,
                                background: 'rgba(0,0,0,0.85)',
                                border: `1px solid ${studioTheme.border}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 10,
                              }}
                              aria-hidden="true"
                            >
                              🛡
                            </span>
                          ) : null}
                        </div>
                        <span
                          style={{
                            marginTop: 8,
                            fontSize: 11,
                            fontWeight: 300,
                            color: studioTheme.text,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                            textAlign: 'center',
                            width: '100%',
                            maxWidth: 88,
                            lineHeight: 1.25,
                          }}
                        >
                          {l.title || '—'}
                        </span>
                        {badge ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              marginTop: 4,
                              padding: '2px 6px',
                              borderRadius: 6,
                              background: studioTheme.typeBadgeBg,
                              fontSize: 8,
                              fontWeight: 300,
                              color: studioTheme.typeBadgeText,
                            }}
                          >
                            <StudioMdiGlyph name={badge.mdi} size={9} color={studioTheme.typeBadgeText} />
                            {t(badge.labelKey)}
                          </span>
                        ) : null}
                      </button>

                      <button
                        type="button"
                        aria-label={t('vault.menu.more')}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuForId((id) => (id === l.id ? null : l.id));
                        }}
                        style={{
                          position: 'absolute',
                          top: -2,
                          right: -2,
                          width: 22,
                          height: 20,
                          borderRadius: 6,
                          border: `1px solid ${studioTheme.border}`,
                          background: 'rgba(12,12,14,0.92)',
                          color: studioTheme.text,
                          fontSize: 12,
                          fontWeight: 900,
                          cursor: 'pointer',
                          lineHeight: 1,
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
                        }}
                      >
                        ···
                      </button>

                      {menuOpen ? (
                        <div
                          ref={menuRef}
                          role="menu"
                          style={{
                            position: 'absolute',
                            top: '100%',
                            right: -4,
                            marginTop: 4,
                            zIndex: 40,
                            minWidth: 188,
                            borderRadius: 14,
                            border: `1px solid ${studioTheme.border}`,
                            background: studioTheme.surfaceElevated,
                            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
                            padding: '6px 0',
                            textAlign: 'left',
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void onToggleFavorite(l)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              width: '100%',
                              border: 'none',
                              background: 'transparent',
                              color: studioTheme.gold,
                              fontWeight: 700,
                              fontSize: 14,
                              padding: '12px 16px',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            ★ {t('vault.menu.favorite')}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              closeMenu();
                              onSelectLink(l);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              width: '100%',
                              border: 'none',
                              background: 'transparent',
                              color: studioTheme.text,
                              fontWeight: 700,
                              fontSize: 14,
                              padding: '12px 16px',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            ✎ {t('vault.menu.edit')}
                          </button>
                          {canDelete ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void onDelete(l)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                width: '100%',
                                border: 'none',
                                borderTop: `1px solid ${studioTheme.border}`,
                                background: 'transparent',
                                color: studioTheme.error,
                                fontWeight: 700,
                                fontSize: 14,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              🗑 {t('vault.menu.delete')}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onAddClick}
          disabled={n >= max && !vaultUnlimited}
          aria-label={t('vault.fab')}
          style={{
            position: 'absolute',
            right: 18,
            bottom: 24,
            width: 60,
            height: 60,
            borderRadius: 30,
            border: `1px solid ${studioTheme.borderStrong}`,
            cursor: n >= max && !vaultUnlimited ? 'not-allowed' : 'pointer',
            opacity: n >= max && !vaultUnlimited ? 0.45 : 1,
            background: studioGradients.cta,
            color: studioTheme.fabText,
            fontSize: 30,
            fontWeight: 300,
            lineHeight: 1,
            boxShadow: '0 8px 24px rgba(197, 160, 101, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
