'use client';

import { mdiTrashCanOutline } from '@mdi/js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isGhostLinkVaultDeletionProtected, isGhostLinkVaultType } from '@card-social/constants/ghostLinkVault';
import type { StudioLocale } from '@/lib/studioI18n';
import { studioT } from '@/lib/studioI18n';
import type { StudioVaultLink } from '@/lib/studioVaultTypes';
import { deleteStudioVaultLink, toggleStudioVaultFavorite } from '@/lib/studioVaultService';
import { syncStudioVaultDeleteToMongoCards } from '@/lib/studioVaultCardSync';
import { studioGradients, studioTheme } from '@/lib/studioTheme';
import { runStudioVaultItemPrimaryAction } from '@/lib/runStudioVaultItemPrimaryAction';
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
  /** Límite IconData según `system_config/tiers` y tier del usuario (no aplica si `vaultUnlimited`). */
  vaultItemMax: number;
  /** Solo `super_admin` en Firestore: texto «ilimitado» y sin tope en UI. */
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
  vaultItemMax,
  vaultUnlimited = false,
}: Props) {
  const t = useCallback((k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars), [locale]);
  const q = searchQuery.trim().toLowerCase();
  const filtered = !q ? links : links.filter((l) => searchableBlob(l).includes(q));
  const n = links.length;
  const max = Math.max(0, vaultItemMax);

  const displayName = String(profile?.userFullName || '').trim() || '—';
  const verified = profile?.verificationStatus === 'verified' || Boolean(profile?.verificationSelfieFileId);

  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const [textPreview, setTextPreview] = useState<{ title: string; body: string } | null>(null);

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

  useEffect(() => {
    if (!imagePreview && !textPreview) return undefined;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setImagePreview(null);
        setTextPreview(null);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [imagePreview, textPreview]);

  const closeMenu = () => setMenuForId(null);

  const execPrimaryAction = useCallback(
    (link: StudioVaultLink) => {
      runStudioVaultItemPrimaryAction(link, {
        locale,
        t,
        openImageLightbox: setImagePreview,
        openTextSheet: setTextPreview,
      });
    },
    [locale, t],
  );

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
      await syncStudioVaultDeleteToMongoCards(userId, link.id);
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
        <div
          style={{
            margin: '12px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: studioTheme.gold,
              lineHeight: 1.25,
            }}
          >
            {counterLabel}
          </p>
          <button
            type="button"
            onClick={onAddClick}
            disabled={n >= max && !vaultUnlimited}
            aria-label={t('vault.fab')}
            title={t('vault.fab')}
            style={{
              flexShrink: 0,
              width: 48,
              height: 48,
              borderRadius: 24,
              border: `1px solid ${studioTheme.borderStrong}`,
              cursor: n >= max && !vaultUnlimited ? 'not-allowed' : 'pointer',
              opacity: n >= max && !vaultUnlimited ? 0.45 : 1,
              background: studioGradients.cta,
              color: studioTheme.fabText,
              fontSize: 26,
              fontWeight: 300,
              lineHeight: 1,
              boxShadow: '0 6px 18px rgba(197, 160, 101, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </button>
        </div>
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
        <div style={{ height: '100%', overflowY: 'auto', padding: '12px 12px 16px' }}>
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
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!isBusy) {
                            execPrimaryAction(l);
                          }
                        }}
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
                              <svg
                                width={18}
                                height={18}
                                viewBox="0 0 24 24"
                                aria-hidden
                                style={{ flexShrink: 0, display: 'block', color: studioTheme.error }}
                              >
                                <path d={mdiTrashCanOutline} fill="currentColor" />
                              </svg>
                              {t('vault.menu.delete')}
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
      </div>

      {imagePreview ? (
        <div
          role="presentation"
          onClick={() => setImagePreview(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 'min(96vw, 560px)',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  color: studioTheme.text,
                  fontWeight: 700,
                  fontSize: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {imagePreview.title}
              </span>
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                style={{
                  flexShrink: 0,
                  borderRadius: 10,
                  border: `1px solid ${studioTheme.border}`,
                  background: studioTheme.surfaceElevated,
                  color: studioTheme.gold,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '8px 14px',
                  cursor: 'pointer',
                }}
              >
                {t('vault.preview.close')}
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview.url}
              alt=""
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: 'calc(92vh - 72px)',
                objectFit: 'contain',
                borderRadius: 12,
                border: `1px solid ${studioTheme.border}`,
                background: '#050505',
              }}
            />
          </div>
        </div>
      ) : null}

      {textPreview ? (
        <div
          role="presentation"
          onClick={() => setTextPreview(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="vault-text-preview-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              maxHeight: '88vh',
              overflow: 'auto',
              borderRadius: 18,
              border: `1px solid ${studioTheme.border}`,
              background: studioTheme.surfaceElevated,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <h2 id="vault-text-preview-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: studioTheme.text, flex: 1 }}>
                {textPreview.title}
              </h2>
              <button
                type="button"
                onClick={() => setTextPreview(null)}
                style={{
                  flexShrink: 0,
                  borderRadius: 10,
                  border: `1px solid ${studioTheme.border}`,
                  background: 'transparent',
                  color: studioTheme.textMuted,
                  fontWeight: 700,
                  fontSize: 18,
                  lineHeight: 1,
                  width: 34,
                  height: 34,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
                aria-label={t('vault.preview.close')}
              >
                ×
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(0,0,0,0.35)',
                border: `1px solid ${studioTheme.border}`,
                color: studioTheme.text,
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '48vh',
                overflow: 'auto',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              }}
            >
              {textPreview.body || '—'}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(textPreview.body ?? '');
                    window.alert(t('vault.preview.copied'));
                  } catch {
                    window.alert(t('vault.action.runFailed'));
                  }
                }}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${studioTheme.borderStrong}`,
                  background: studioGradients.cta,
                  color: studioTheme.fabText,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '10px 18px',
                  cursor: 'pointer',
                }}
              >
                {t('vault.preview.copy')}
              </button>
              <button
                type="button"
                onClick={() => setTextPreview(null)}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${studioTheme.border}`,
                  background: 'transparent',
                  color: studioTheme.text,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '10px 18px',
                  cursor: 'pointer',
                }}
              >
                {t('vault.preview.close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
