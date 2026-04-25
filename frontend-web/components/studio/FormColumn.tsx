'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GHOST_LINK_VAULT_VALUE, isGhostLinkVaultType } from '@card-social/constants/ghostLinkVault';
import {
  ALL_DIAL_ENTRIES,
  buildE164,
  getNationalDigitBounds,
  parsePhoneIntoDialAndNational,
  sanitizeNationalDigits,
} from '@card-social/constants/countryDialCodes';
import { isVaultDocumentImage, isVaultDocumentPdf } from '@card-social/services/vaultMimeGuards';
import { uploadVaultDocumentWeb } from '@/lib/studioModerationClient';
import { extractDomainFromLink, fetchStudioFavicon } from '@/lib/studioFaviconClient';
import { resolvePublicVaultUrlForWeb } from '@/lib/resolvePublicVaultMediaUrl';
import { saveVaultLink, newStudioItemId } from '@/lib/studioVaultService';
import type { StudioVaultLink } from '@/lib/studioVaultTypes';
import {
  CREATE_TYPES,
  mapFormTypeToServer,
  mapServerTypeToForm,
  type FormDataType,
} from '@/lib/studioFormTypes';
import { studioGradients, studioTheme } from '@/lib/studioTheme';
import { FREE_TIER_POLICY } from '@card-social/constants/freeTierPolicy';
import type { StudioLocale } from '@/lib/studioI18n';
import { studioT } from '@/lib/studioI18n';
import StudioMdiGlyph from '@/components/studio/StudioMdiGlyph';

type Props = {
  locale: StudioLocale;
  userId: string;
  editing: StudioVaultLink | undefined;
  allLinks: StudioVaultLink[];
  formIconMci: string;
  onIconChange: (icon: string) => void;
  onClose: () => void;
  onOpenIconSelector: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaveSuccess: () => void;
};

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function displayDocumentName(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const leaf = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    return leaf || 'Archivo guardado';
  } catch {
    return 'Archivo guardado';
  }
}

export default function FormColumn({
  locale,
  userId,
  editing,
  allLinks,
  formIconMci,
  onIconChange,
  onClose,
  onOpenIconSelector,
  onDirtyChange,
  onSaveSuccess,
}: Props) {
  const t = (k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars);
  const isEdit = Boolean(editing?.id);
  const isGhostEdit = isEdit && isGhostLinkVaultType(editing?.type);

  const [dataType, setDataType] = useState<FormDataType>('link');
  const [name, setName] = useState('');
  const [data, setData] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNational, setPhoneNational] = useState('');
  const [localMime, setLocalMime] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [faviconLoading, setFaviconLoading] = useState(false);
  const [faviconDismissedForDomain, setFaviconDismissedForDomain] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDataType('link');
      setName('');
      setData('');
      setCountryCode('+1');
      setPhoneNational('');
      setLocalMime(undefined);
      setFormError(null);
      setFaviconDismissedForDomain('');
      return;
    }
    const ft = mapServerTypeToForm(editing.type);
    setDataType(ft);
    setName(editing.title || '');
    setLocalMime(editing.vaultMimeType);
    if (ft === 'phone') {
      const p = parsePhoneIntoDialAndNational(String(editing.value || '+10000000000'));
      setCountryCode(p.dial);
      setPhoneNational(p.national);
      setData('');
    } else {
      setData(ft === 'ghost' ? '' : String(editing.value || ''));
      setCountryCode('+1');
      setPhoneNational('');
    }
  }, [editing?.id, editing]);

  const linkFaviconDomain = dataType === 'link' ? extractDomainFromLink(data) : '';
  const showFaviconPrompt = Boolean(linkFaviconDomain && faviconDismissedForDomain !== linkFaviconDomain);

  const markDirty = useCallback(
    () => onDirtyChange(true),
    [onDirtyChange],
  );

  const tryOpenPhone = useCallback(() => {
    if (dataType !== 'phone') return;
    const e164 = buildE164(countryCode, phoneNational);
    if (e164.length < 8) {
      setFormError(t('form.errorPhoneShort'));
      return;
    }
    window.open(`tel:${e164}`, '_self', 'noopener');
  }, [countryCode, dataType, phoneNational, t]);

  const tryOpenDocument = useCallback(() => {
    const u = String(data || '').trim();
    if (!u) return;
    const abs = resolvePublicVaultUrlForWeb(u) || u;
    if (!/^https?:\/\//i.test(abs)) {
      setFormError(t('form.errorDocUrl'));
      return;
    }
    window.open(abs, '_blank', 'noopener,noreferrer');
  }, [data, t]);

  const runFaviconLookup = useCallback(async () => {
    if (!linkFaviconDomain) return;
    setFormError(null);
    setFaviconLoading(true);
    try {
      const favicon = await Promise.race([
        fetchStudioFavicon(data),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
      ]);
      if (!favicon) {
        setFormError(t('favicon.none'));
        return;
      }
      onIconChange(favicon);
      setFaviconDismissedForDomain(linkFaviconDomain);
      markDirty();
    } catch {
      setFormError(t('favicon.none'));
    } finally {
      setFaviconLoading(false);
    }
  }, [data, linkFaviconDomain, markDirty, onIconChange, t]);

  const handleDocumentFile = useCallback(async (file: File) => {
    if (!file || dataType !== 'document') return;
    setFormError(null);
    setBusy(true);
    try {
      const up = await uploadVaultDocumentWeb(file, userId, name.trim() || 'document');
      const url = String(up.publicUrl || '').trim();
      if (!url) {
        throw new Error(t('form.uploadNoUrl'));
      }
      setData(url);
      setLocalMime(String(up.mimeType || file.type || '').trim() || undefined);
      markDirty();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('form.uploadError'));
    } finally {
      setBusy(false);
    }
  }, [dataType, markDirty, name, t, userId]);

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      await handleDocumentFile(file);
    }
  };

  const handleSave = useCallback(async () => {
    setFormError(null);
    if (isGhostEdit) {
      const isFavicon = /^https?:\/\//i.test(formIconMci);
      const pl: StudioVaultLink = {
        ...editing!,
        title: name.trim() || editing!.title,
        icon: formIconMci,
        updatedAt: new Date().toISOString(),
        iconName: isFavicon ? 'Favicon' : formIconMci,
      };
      setBusy(true);
      try {
        await saveVaultLink(userId, pl);
        onDirtyChange(false);
        onSaveSuccess();
      } catch {
        setFormError(t('login.error'));
      } finally {
        setBusy(false);
      }
      return;
    }

    const n = name.trim();
    if (!n) {
      setFormError(t('form.errorName'));
      return;
    }
    if (!isEdit) {
      if (allLinks.length >= FREE_TIER_POLICY.vaultItems) {
        setFormError(t('form.vaultLimit'));
        return;
      }
    }
    if (dataType === 'phone') {
      const { min, max } = getNationalDigitBounds(countryCode);
      const d = sanitizeNationalDigits(phoneNational);
      if (d.length < min || d.length > max) {
        setFormError(t('form.errorPhoneLen').replace('{min}', String(min)).replace('{max}', String(max)));
        return;
      }
    }
    if (dataType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.trim())) {
      setFormError(t('form.errorEmail'));
      return;
    }
    if (dataType === 'link') {
      let u = data.trim();
      if (!u) {
        setFormError(t('form.errorLink'));
        return;
      }
      if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
      if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(u)) {
        setFormError(t('form.errorLink'));
        return;
      }
    }
    if (dataType === 'text' && wordCount(data) > 200) {
      setFormError(t('form.errorTextMax'));
      return;
    }
    if (dataType === 'document' && !data.trim()) {
      setFormError(t('form.errorDoc'));
      return;
    }
    const serverType = mapFormTypeToServer(dataType);
    let valueOut = data.trim();
    if (dataType === 'phone') {
      valueOut = buildE164(countryCode, phoneNational);
    } else if (dataType === 'ghost') {
      valueOut = GHOST_LINK_VAULT_VALUE;
    } else if (dataType === 'link') {
      valueOut = data.trim();
      if (!/^https?:\/\//i.test(valueOut)) valueOut = `https://${valueOut}`;
    }

    const iconNameLabel = formIconMci;
    const isFavicon = /^https?:\/\//i.test(formIconMci);
    const iconData = isFavicon ? formIconMci : formIconMci.trim().toLowerCase().replace(/\s+/g, '-') || 'link-variant';

    const id = isEdit && editing ? editing.id : newStudioItemId();
    if (!isEdit) {
      const dup = allLinks.some((x) => x.id !== id && (x.title || '').trim().toLowerCase() === n.toLowerCase());
      if (dup) {
        setFormError(t('form.errorDup'));
        return;
      }
    }

    const pl: StudioVaultLink = {
      id,
      title: n,
      type: serverType,
      value: valueOut,
      iconName: isFavicon ? 'Favicon' : iconNameLabel,
      icon: iconData,
      isFavorite: editing?.isFavorite || false,
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(dataType === 'document' && localMime ? { vaultMimeType: localMime } : {}),
      ...(isGhostLinkVaultType(serverType) ? { vaultProtected: true } : {}),
    };

    if (dataType === 'ghost' && !isEdit) {
      setFormError(t('form.errorGhostCreate'));
      return;
    }

    setBusy(true);
    try {
      await saveVaultLink(userId, pl);
      onDirtyChange(false);
      onSaveSuccess();
    } catch {
      setFormError(t('login.error'));
    } finally {
      setBusy(false);
    }
  }, [
    allLinks,
    countryCode,
    data,
    dataType,
    editing,
    formIconMci,
    onIconChange,
    isEdit,
    isGhostEdit,
    localMime,
    name,
    onDirtyChange,
    onSaveSuccess,
    phoneNational,
    t,
    userId,
  ]);

  const typesToShow: FormDataType[] = isGhostEdit ? ['ghost'] : CREATE_TYPES;

  const docIsPdf = isVaultDocumentPdf(data, localMime);
  const docIsImg = isVaultDocumentImage(data, localMime);
  const docUrl = resolvePublicVaultUrlForWeb(data) || data;
  const hasViewableDocUrl = /^https?:\/\//i.test(String(docUrl || ''));

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
        background: studioTheme.surface,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: `1px solid ${studioTheme.border}`,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('form.close')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: `1px solid ${studioTheme.border}`,
            background: 'transparent',
            color: studioTheme.gold,
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: 1.2, color: studioTheme.text }}>
          {isEdit ? t('form.editTitle') : t('form.title')}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          style={{
            minWidth: 88,
            padding: '10px 12px',
            borderRadius: 10,
            border: 'none',
            fontSize: 12,
            fontWeight: 900,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.75 : 1,
            background: studioGradients.cta,
            color: studioTheme.fabText,
          }}
        >
          {busy ? t('form.saving') : isEdit ? t('form.save') : t('form.create')}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {isGhostEdit ? <p style={{ color: studioTheme.textMuted, fontSize: 12, lineHeight: 1.5 }}>{t('form.ghostEditHint')}</p> : null}

        <p style={{ margin: '0 0 8px', fontSize: 12, color: studioTheme.gold, fontStyle: 'italic' }}>{t('form.typeHint')}</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 20,
            opacity: isGhostEdit ? 0.5 : 1,
            pointerEvents: isGhostEdit ? 'none' : 'auto',
          }}
        >
          {typesToShow.map((tp) => {
            const active = dataType === tp;
            const labelKey = `form.type.${tp === 'text' ? 'text' : tp === 'link' ? 'link' : tp}` as 'form.type.link';
            const k =
              tp === 'link'
                ? 'form.type.link'
                : tp === 'email'
                  ? 'form.type.email'
                  : tp === 'phone'
                    ? 'form.type.phone'
                    : tp === 'text'
                      ? 'form.type.text'
                      : tp === 'document'
                        ? 'form.type.document'
                        : 'form.type.ghost';
            return (
              <button
                key={tp}
                type="button"
                disabled={isGhostEdit}
                onClick={() => {
                  setDataType(tp);
                  markDirty();
                }}
                style={{
                  padding: '12px 8px',
                  borderRadius: 10,
                  border: active ? `2px solid ${studioTheme.gold}` : `1px solid ${studioTheme.border}`,
                  background: active ? studioGradients.cta : studioTheme.surfaceElevated,
                  color: active ? studioTheme.fabText : studioTheme.text,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: isGhostEdit ? 'not-allowed' : 'pointer',
                }}
              >
                {t(k)}
              </button>
            );
          })}
        </div>
        {formError ? <p style={{ color: studioTheme.error, fontSize: 13, margin: '0 0 10px' }}>{formError}</p> : null}

        <label style={{ fontSize: 11, color: studioTheme.goldLight }}>{t('form.name')}</label>
        <input
          value={name}
          disabled={false}
          onChange={(e) => {
            setName(e.target.value);
            markDirty();
          }}
          placeholder={t('form.namePh')}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            marginTop: 6,
            marginBottom: 14,
            padding: '12px 12px',
            borderRadius: 10,
            border: `1px solid ${studioTheme.borderStrong}`,
            background: studioTheme.bg,
            color: studioTheme.text,
            fontSize: 14,
          }}
        />

        {dataType === 'phone' && !isGhostEdit ? (
          <>
            <label style={{ fontSize: 11, color: studioTheme.goldLight }}>{t('form.dial')}</label>
            <select
              value={countryCode}
              onChange={(e) => {
                setCountryCode(e.target.value);
                markDirty();
              }}
              style={{
                width: '100%',
                marginTop: 6,
                marginBottom: 8,
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${studioTheme.border}`,
                background: studioTheme.bg,
                color: studioTheme.text,
                fontSize: 13,
              }}
            >
              {ALL_DIAL_ENTRIES.map((e) => (
                <option key={e.id} value={e.code}>
                  {e.code} {e.country}
                </option>
              ))}
            </select>
            <label style={{ fontSize: 11, color: studioTheme.goldLight }}>{t('form.national')}</label>
            <input
              inputMode="numeric"
              value={phoneNational}
              onChange={(e) => {
                setPhoneNational(e.target.value);
                markDirty();
              }}
              placeholder={t('form.nationalPh')}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 6,
                marginBottom: 8,
                padding: '12px 12px',
                borderRadius: 10,
                border: `1px solid ${studioTheme.borderStrong}`,
                background: studioTheme.bg,
                color: studioTheme.text,
                fontSize: 14,
              }}
            />
            <button
              type="button"
              onClick={tryOpenPhone}
              style={{
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${studioTheme.gold}`,
                background: 'transparent',
                color: studioTheme.gold,
                cursor: 'pointer',
                width: '100%',
                fontWeight: 600,
              }}
            >
              {t('form.openPhone')}
            </button>
          </>
        ) : null}

        {dataType === 'link' && !isGhostEdit ? (
          <>
            <label style={{ fontSize: 11, color: studioTheme.goldLight }}>{t('form.data')}</label>
            <input
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                markDirty();
              }}
              placeholder={t('form.dataPh')}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 6,
                marginBottom: 14,
                padding: '12px 12px',
                borderRadius: 10,
                border: `1px solid ${studioTheme.borderStrong}`,
                background: studioTheme.bg,
                color: studioTheme.text,
                fontSize: 14,
              }}
            />
            {showFaviconPrompt ? (
              <div
                style={{
                  margin: '0 0 14px',
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${studioTheme.border}`,
                  background: studioTheme.surfaceElevated,
                }}
              >
                <div style={{ color: studioTheme.text, fontSize: 13, fontWeight: 700 }}>{t('favicon.promptTitle')}</div>
                <div style={{ color: studioTheme.textMuted, fontSize: 12, marginTop: 4 }}>{linkFaviconDomain}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setFaviconDismissedForDomain(linkFaviconDomain)}
                    disabled={faviconLoading}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${studioTheme.border}`,
                      background: 'transparent',
                      color: studioTheme.textMuted,
                      cursor: faviconLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {t('favicon.noThanks')}
                  </button>
                  <button
                    type="button"
                    onClick={runFaviconLookup}
                    disabled={faviconLoading}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: 'none',
                      background: studioGradients.cta,
                      color: studioTheme.fabText,
                      cursor: faviconLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 800,
                    }}
                  >
                    {faviconLoading ? t('favicon.searching') : t('favicon.searchNow')}
                  </button>
                </div>
              </div>
            ) : null}
            {/^https?:\/\//i.test(formIconMci) ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  margin: '0 0 14px',
                  color: studioTheme.goldLight,
                  fontSize: 12,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={formIconMci} alt="" style={{ width: 28, height: 28, borderRadius: 6 }} />
                {t('favicon.detected')}
              </div>
            ) : null}
          </>
        ) : null}

        {dataType === 'email' && !isGhostEdit ? (
          <>
            <label style={{ fontSize: 11, color: studioTheme.goldLight }}>{t('form.data')}</label>
            <input
              type="email"
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                markDirty();
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 6,
                marginBottom: 14,
                padding: '12px 12px',
                borderRadius: 10,
                border: `1px solid ${studioTheme.borderStrong}`,
                background: studioTheme.bg,
                color: studioTheme.text,
                fontSize: 14,
              }}
            />
          </>
        ) : null}

        {dataType === 'text' && !isGhostEdit ? (
          <>
            <label style={{ fontSize: 11, color: studioTheme.goldLight }}>{t('form.data')}</label>
            <div
              style={{
                position: 'relative',
                width: '100%',
                marginTop: 6,
                marginBottom: 8,
                minHeight: 132,
                borderRadius: 10,
                border: `1px solid ${studioTheme.borderStrong}`,
                background: studioTheme.bg,
                overflow: 'hidden',
              }}
            >
              {/* Espejo con las mismas métricas que el textarea; negrita/tamaño distinto desalineaba el caret. */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: '12px 12px',
                  pointerEvents: 'none',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'break-word',
                  fontSize: 15,
                  lineHeight: '22px',
                  fontWeight: 400,
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
                  color: data ? studioTheme.text : studioTheme.textSubtle,
                }}
              >
                {data || t('form.textPh')}
              </div>
              <textarea
                value={data}
                onChange={(e) => {
                  const next = e.target.value;
                  const nextWords = wordCount(next);
                  if (nextWords <= 200 || next.length < data.length) {
                    setData(next);
                    markDirty();
                  }
                }}
                rows={5}
                spellCheck
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: '100%',
                  minHeight: 132,
                  boxSizing: 'border-box',
                  padding: '12px 12px',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'transparent',
                  caretColor: studioTheme.gold,
                  fontSize: 15,
                  lineHeight: '22px',
                  fontWeight: 400,
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
                  fontSynthesis: 'none',
                  resize: 'vertical',
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: studioTheme.textSubtle, margin: '0 0 14px' }}>{t('form.textCounter', { n: wordCount(data) })}</p>
          </>
        ) : null}

        {dataType === 'document' && !isGhostEdit ? (
          <>
            <label style={{ fontSize: 11, color: studioTheme.goldLight }}>{t('form.document')}</label>
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  void handleDocumentFile(file);
                }
              }}
              onClick={() => documentInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  documentInputRef.current?.click();
                }
              }}
              style={{
                marginTop: 8,
                marginBottom: 12,
                minHeight: 132,
                borderRadius: 14,
                border: `2px dashed ${dragActive ? studioTheme.gold : studioTheme.borderStrong}`,
                background: dragActive ? 'rgba(212, 175, 55, 0.12)' : studioTheme.bg,
                color: studioTheme.text,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: 16,
                cursor: busy ? 'not-allowed' : 'pointer',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              <div style={{ color: studioTheme.gold, fontSize: 30, lineHeight: 1 }}>{data ? '◉' : '⇪'}</div>
              <div style={{ marginTop: 10, fontSize: 14, fontWeight: 800 }}>
                {busy ? t('form.uploading') : data ? displayDocumentName(data) : t('form.dropTitle')}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: studioTheme.textMuted, maxWidth: 260, lineHeight: 1.4 }}>
                {data ? t('form.dropReplace') : t('form.dropSubtitle')}
              </div>
              <input ref={documentInputRef} type="file" onChange={onPickFile} disabled={busy} style={{ display: 'none' }} />
            </div>
            {data && hasViewableDocUrl ? (
              <div style={{ marginBottom: 8, padding: 12, borderRadius: 10, background: studioTheme.bg, border: `1px solid ${studioTheme.border}` }}>
                {docIsImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={docUrl} alt="" style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain' }} />
                ) : null}
                <p style={{ fontSize: 12, color: studioTheme.textMuted, margin: '8px 0' }}>{displayDocumentName(data)}</p>
                <button
                  type="button"
                  onClick={tryOpenDocument}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${studioTheme.gold}`,
                    background: 'transparent',
                    color: studioTheme.gold,
                    cursor: 'pointer',
                    width: '100%',
                    fontWeight: 600,
                  }}
                >
                  {docIsPdf ? t('form.openPdf') : t('form.openFile')}
                </button>
              </div>
            ) : null}
            <p style={{ fontSize: 11, color: studioTheme.textSubtle }}>{t('form.documentHint')}</p>
          </>
        ) : null}

        <div
          style={{
            marginTop: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${studioTheme.border}`,
            background: studioTheme.surfaceElevated,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StudioMdiGlyph name={formIconMci} size={36} color={studioTheme.gold} />
            <div>
              <div style={{ fontSize: 12, color: studioTheme.text }}>{t('form.icon')}</div>
              <div style={{ fontSize: 11, color: studioTheme.textMuted }}>{t('form.customize')}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenIconSelector}
            style={{
              background: 'none',
              border: 'none',
              color: studioTheme.gold,
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {t('form.change')}
          </button>
        </div>
      </div>

    </div>
  );
}
