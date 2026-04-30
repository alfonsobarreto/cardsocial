'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getStudioAuth } from '@/lib/studioFirebase';
import { getStudioDb } from '@/lib/studioFirebase';
import { subscribeVaultLinks } from '@/lib/studioVaultService';
import type { StudioVaultLink } from '@/lib/studioVaultTypes';
import {
  readBrowserLocale,
  readStoredLocale,
  studioLocaleFromQuery,
  studioT,
  writeStoredLocale,
  type StudioLocale,
} from '@/lib/studioI18n';
import { studioTheme } from '@/lib/studioTheme';
import { assignStudioLoginPage, setStudioAuthCookie } from '@/lib/studioAuthClient';
import { readStudioUserAvatarUrl, readStudioUserFullName, readStudioUserNickName } from '@/lib/studioUserIdentityFields';
import FormColumn from '@/components/studio/FormColumn';
import IconSelectorColumn from '@/components/studio/IconSelectorColumn';
import ProfileColumn, { type StudioProfile } from '@/components/studio/ProfileColumn';
import VaultColumn from '@/components/studio/VaultColumn';

function iconMciFromLink(l: StudioVaultLink | undefined, fallback: string): string {
  if (!l) return fallback;
  const raw = l.icon || l.iconName;
  return String(raw || 'link-variant').trim() || 'link-variant';
}

export default function StudioShell() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  /** Evita tratar un null "transitorio" de Firebase (antes de restaurar la sesión) como cierre de sesión. */
  const signOutDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signOutInProgress = useRef(false);
  const SIGNED_OUT_DELAY_MS = 200;
  /** Tras un sign-out explícito, el debounce de `onAuthStateChanged` no debe correr aún (evita doble `router.replace` a /login y errores de navegación). */
  const SIGN_OUT_UI_GUARD_MS = 400;
  const [locale, setLocale] = useState<StudioLocale>('en');

  const [links, setLinks] = useState<StudioVaultLink[]>([]);
  const [profile, setProfile] = useState<StudioProfile | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [leftPanel, setLeftPanel] = useState<'vault' | 'profile'>('vault');
  const [vaultSearch, setVaultSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [dirtyPrompt, setDirtyPrompt] = useState(false);
  const [editingLink, setEditingLink] = useState<StudioVaultLink | undefined>(undefined);
  const [formIconMci, setFormIconMci] = useState('link-variant');

  const t = useCallback((k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars), [locale]);

  const replaceBunkerUrl = useCallback(
    (params: URLSearchParams, route?: string) => {
      if (typeof window === 'undefined') return;
      const qs = params.toString();
      router.replace(`${route || window.location.pathname || '/studio/bunker'}${qs ? `?${qs}` : ''}`);
    },
    [router],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQ = studioLocaleFromQuery(params.get('lang'));
      const stored = readStoredLocale();
      setLocale(fromQ ?? stored ?? readBrowserLocale());
    } catch {
      setLocale('en');
    }
  }, []);

  const setLocaleAndStore = useCallback(
    (l: StudioLocale) => {
      setLocale(l);
      writeStoredLocale(l);
      if (typeof window === 'undefined') {
        return;
      }
      const next = new URLSearchParams(window.location.search);
      if (l === 'es' || l === 'en' || l === 'it' || l === 'fr' || l === 'pt') {
        next.set('lang', l);
      } else {
        next.set('lang', 'en');
      }
      const qs = next.toString();
      const path = pathname || window.location.pathname;
      router.replace(qs ? `${path}?${qs}` : path);
    },
    [pathname, router],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const auth = getStudioAuth();
    const clearDebounce = () => {
      if (signOutDebounce.current) {
        clearTimeout(signOutDebounce.current);
        signOutDebounce.current = null;
      }
    };
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        clearDebounce();
        setStudioAuthCookie(true);
        setUser(u);
        return;
      }
      setUser(null);
      signOutDebounce.current = setTimeout(() => {
        signOutDebounce.current = null;
        if (signOutInProgress.current) return;
        if (getStudioAuth().currentUser) {
          return;
        }
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/login')) {
          return;
        }
        setStudioAuthCookie(false);
        assignStudioLoginPage({
          returnPathWithQuery: `${window.location.pathname}${window.location.search}`,
        });
      }, SIGNED_OUT_DELAY_MS);
    });
    return () => {
      clearDebounce();
      unsub();
    };
  }, [router]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const panel = params.get('panel');
    if (panel === 'profile') setLeftPanel('profile');
    else setLeftPanel('vault');
    if (path.endsWith('/new')) {
      setEditingLink(undefined);
      setFormIconMci('link-variant');
      setFormOpen(true);
    }
    const editMatch = path.match(/\/studio\/bunker\/icondata\/([^/]+)/);
    if (editMatch) {
      const id = decodeURIComponent(editMatch[1] || '');
      const found = links.find((l) => l.id === id);
      if (found) {
        setEditingLink(found);
        setFormIconMci(iconMciFromLink(found, 'link-variant'));
        setFormOpen(true);
      }
    }
    if (params.get('icons') === '1') setIconOpen(true);
  }, [links, user]);

  useEffect(() => {
    if (!user) {
      setLinks([]);
      setProfile(null);
      return;
    }
    return subscribeVaultLinks(user.uid, setLinks);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        await user.reload();
        if (cancelled) return;
        const authEmail = String(user.email || '').trim().toLowerCase();
        if (!authEmail) return;
        const ref = doc(getStudioDb(), 'users', user.uid);
        const snap = await getDoc(ref);
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        const storedEmail = String(data.emailLower || data.email || '').trim().toLowerCase();
        if (authEmail && authEmail !== storedEmail) {
          await updateDoc(ref, {
            email: authEmail,
            emailLower: authEmail,
            pendingEmail: null,
            pendingEmailLower: null,
            emailChangedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        /* Email reconciliation is best-effort. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ref = doc(getStudioDb(), 'users', user.uid);
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
      const lastNicknameChangeRaw = data.lastNicknameChange || data.nicknameChangedAt || data.lastUsernameChange;
      const lastNicknameChange =
        typeof (lastNicknameChangeRaw as { toDate?: unknown })?.toDate === 'function'
          ? (lastNicknameChangeRaw as { toDate: () => Date }).toDate().toISOString()
          : typeof (lastNicknameChangeRaw as { toMillis?: unknown })?.toMillis === 'function'
            ? new Date((lastNicknameChangeRaw as { toMillis: () => number }).toMillis()).toISOString()
            : lastNicknameChangeRaw
              ? String(lastNicknameChangeRaw)
              : null;
      const provider = user.providerData[0]?.providerId || 'password';
      setProfile({
        userFullName: readStudioUserFullName(data),
        userNickName: readStudioUserNickName(data),
        email: String(user.email || data.email || data.emailLower || '').trim(),
        phone: String(data.phone || data.phoneNumber || data.phoneNormalized || '').trim(),
        userAvatarUrl: readStudioUserAvatarUrl(data) || user.photoURL || '',
        firstName: String(data.firstName || '').trim(),
        lastName: String(data.lastName || '').trim(),
        bio: String(data.bio || '').trim(),
        verificationStatus: String(data.verificationStatus || 'unverified'),
        verificationSelfieFileId: data.verificationSelfieFileId
          ? String(data.verificationSelfieFileId)
          : data.verificationSelfieFileId === null
            ? null
            : undefined,
        authProvider: String(data.authProvider || provider).includes('password') ? 'password' : String(data.authProvider || provider),
        lastNicknameChange,
      });
    });
  }, [user]);

  const tryCloseForm = useCallback(() => {
    if (formDirty) {
      setDirtyPrompt(true);
      return;
    }
    setFormOpen(false);
    setIconOpen(false);
    setEditingLink(undefined);
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.delete('icons');
    replaceBunkerUrl(params, '/studio/bunker');
  }, [formDirty, replaceBunkerUrl]);

  const confirmDiscard = useCallback(() => {
    setDirtyPrompt(false);
    setFormDirty(false);
    setFormOpen(false);
    setIconOpen(false);
    setEditingLink(undefined);
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.delete('icons');
    replaceBunkerUrl(params, '/studio/bunker');
  }, [replaceBunkerUrl]);

  const onSignOut = useCallback(() => {
    if (signOutDebounce.current) {
      clearTimeout(signOutDebounce.current);
      signOutDebounce.current = null;
    }
    signOutInProgress.current = true;
    setStudioAuthCookie(false);
    // Importante: ir a /login *después* de signOut. Si navegamos antes, /login aún ve sesión
    // en Firebase, StudioLoginShell te devuelve a /studio y se produce ERR_TOO_MANY_REDIRECTS.
    void (async () => {
      try {
        await signOut(getStudioAuth());
      } catch {
        /* aun sin red: forzar ida a login */
      } finally {
        if (typeof window !== 'undefined') {
          assignStudioLoginPage({ signedOut: true });
        }
        // No bajar `signOutInProgress` al instante: onAuthStateChanged agenda un debounce
        // que podría duplicar la ida a /login (assignStudioLoginPage / next).
        setTimeout(() => {
          signOutInProgress.current = false;
        }, SIGN_OUT_UI_GUARD_MS);
      }
    })();
  }, []);

  const openProfile = useCallback(() => {
    setLeftPanel('profile');
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.set('panel', 'profile');
    replaceBunkerUrl(params, '/studio/bunker');
  }, [replaceBunkerUrl]);

  const openVault = useCallback(() => {
    setLeftPanel('vault');
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.delete('panel');
    replaceBunkerUrl(params, '/studio/bunker');
  }, [replaceBunkerUrl]);

  const openNewIconData = useCallback(() => {
    setEditingLink(undefined);
    setFormIconMci('link-variant');
    setFormOpen(true);
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.delete('icons');
    replaceBunkerUrl(params, '/studio/bunker/new');
  }, [replaceBunkerUrl]);

  const openExistingIconData = useCallback(
    (l: StudioVaultLink) => {
      setEditingLink(l);
      setFormIconMci(iconMciFromLink(l, 'link-variant'));
      setFormOpen(true);
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      params.delete('icons');
      replaceBunkerUrl(params, `/studio/bunker/icondata/${encodeURIComponent(l.id)}`);
    },
    [replaceBunkerUrl],
  );

  const openIconSelector = useCallback(() => {
    setIconOpen(true);
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.set('icons', '1');
    replaceBunkerUrl(params, typeof window !== 'undefined' ? window.location.pathname : '/studio/bunker');
  }, [replaceBunkerUrl]);

  const closeIconSelector = useCallback(() => {
    setIconOpen(false);
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.delete('icons');
    replaceBunkerUrl(params, typeof window !== 'undefined' ? window.location.pathname : '/studio/bunker');
  }, [replaceBunkerUrl]);

  const onDeleteAccount = useCallback(async () => {
    if (!user) return;
    const first = window.confirm(t('profile.deleteConfirm1'));
    if (!first) return;
    const now = new Date();
    const deadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const deadlineStr = deadline.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    });
    const second = window.confirm(t('profile.deleteConfirm2', { deadline: deadlineStr }));
    if (!second) return;
    setDeletingAccount(true);
    try {
      await updateDoc(doc(getStudioDb(), 'users', user.uid), {
        pendingDeletion: true,
        deletionRequestedAt: now,
        deletionDeadline: deadline,
      });
      window.alert(t('profile.deleteMarked', { deadline: deadlineStr }));
      await signOut(getStudioAuth());
    } catch {
      window.alert(t('profile.deleteError'));
    } finally {
      setDeletingAccount(false);
    }
  }, [locale, t, user]);

  if (!user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: studioTheme.bg,
          color: studioTheme.gold,
          fontSize: 14,
        }}
      >
        {t('studio.sessionLoading')}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: studioTheme.bg,
        color: studioTheme.text,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          padding: '12px 16px',
          borderBottom: `1px solid ${studioTheme.border}`,
          background: 'linear-gradient(180deg, #0a0a0a 0%, #000 100%)',
        }}
      >
        <button
          type="button"
          onClick={openProfile}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: 'none',
            background: 'transparent',
            color: studioTheme.text,
            cursor: 'pointer',
            minWidth: 210,
            padding: 0,
          }}
        >
          {profile?.userAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.userAvatarUrl}
              alt=""
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                objectFit: 'cover',
                border: `1px solid ${studioTheme.gold}`,
              }}
            />
          ) : (
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: `1px solid ${studioTheme.gold}`,
                display: 'grid',
                placeItems: 'center',
                color: studioTheme.gold,
              }}
            >
              ◌
            </span>
          )}
          <span style={{ minWidth: 0, textAlign: 'left' }}>
            <span style={{ display: 'block', color: studioTheme.goldLight, fontSize: 11, fontWeight: 700 }}>{t('header.welcome')}</span>
            <span style={{ display: 'block', color: studioTheme.text, fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>
              {profile?.userFullName || user.email || ''}
            </span>
          </span>
        </button>

        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
          <span style={{ fontWeight: 900, color: studioTheme.gold, fontSize: 14, letterSpacing: 1 }}>{t('studio.brand')}</span>
          <span style={{ color: studioTheme.textMuted, fontSize: 12 }}>{t('studio.subtitle')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0,
              borderRadius: 8,
              overflow: 'hidden',
              border: `1px solid ${studioTheme.border}`,
            }}
          >
            {(['es', 'en', 'it', 'fr', 'pt'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocaleAndStore(l)}
                style={{
                  padding: '6px 10px',
                  border: 'none',
                  borderRight: l !== 'pt' ? `1px solid ${studioTheme.border}` : undefined,
                  cursor: 'pointer',
                  background: locale === l ? studioTheme.gold : 'transparent',
                  color: locale === l ? studioTheme.bg : studioTheme.textMuted,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {t(`lang.${l}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onSignOut}
            style={{
              background: 'none',
              border: `1px solid ${studioTheme.border}`,
              color: studioTheme.goldLight,
              padding: '6px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {t('header.signOut')}
          </button>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            maxWidth: '100%',
            boxSizing: 'border-box',
            transition: 'transform 0.2s ease',
          }}
        >
          {leftPanel === 'profile' ? (
            <ProfileColumn
              locale={locale}
              profile={profile}
              user={user}
              deletingAccount={deletingAccount}
              onDeleteAccount={onDeleteAccount}
              onBack={openVault}
            />
          ) : (
            <VaultColumn
              locale={locale}
              searchQuery={vaultSearch}
              onSearchChange={setVaultSearch}
              links={links}
              onSelectLink={openExistingIconData}
              onAddClick={openNewIconData}
              userId={user.uid}
              profile={profile}
            />
          )}
          {formOpen ? (
            <FormColumn
              key={editingLink?.id ?? 'new'}
              locale={locale}
              userId={user.uid}
              editing={editingLink}
              allLinks={links}
              formIconMci={formIconMci}
              onIconChange={(icon) => setFormIconMci(icon)}
              onClose={tryCloseForm}
              onOpenIconSelector={openIconSelector}
              onDirtyChange={setFormDirty}
              onSaveSuccess={() => {
                setFormOpen(false);
                setIconOpen(false);
                setFormDirty(false);
                setEditingLink(undefined);
                const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
                params.delete('icons');
                replaceBunkerUrl(params, '/studio/bunker');
              }}
            />
          ) : null}
          {formOpen && iconOpen ? (
            <IconSelectorColumn
              locale={locale}
              selectedMci={formIconMci}
              onSelectIcon={(mci) => setFormIconMci(mci)}
              onClose={closeIconSelector}
            />
          ) : null}
        </div>
      </div>

      {dirtyPrompt ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            style={{
              padding: 24,
              borderRadius: 14,
              background: studioTheme.surface,
              border: `1px solid ${studioTheme.border}`,
              maxWidth: 380,
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>{t('dirty.title')}</h3>
            <p style={{ margin: '0 0 16px', color: studioTheme.textMuted, fontSize: 14, lineHeight: 1.5 }}>{t('dirty.body')}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDirtyPrompt(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: `1px solid ${studioTheme.border}`,
                  background: 'transparent',
                  color: studioTheme.text,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {t('dirty.stay')}
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: studioTheme.error,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {t('dirty.discard')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
