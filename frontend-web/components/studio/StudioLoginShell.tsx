'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getStudioAuth, getStudioDb } from '@/lib/studioFirebase';
import { resolveSignInEmailCandidates } from '@/lib/resolveSignInEmail';
import {
  readBrowserLocale,
  readStoredLocale,
  studioLocaleFromQuery,
  studioT,
  type StudioLocale,
} from '@/lib/studioI18n';
import {
  clearStudioSigningOutFlag,
  readStudioSigningOutFlag,
  readSafeNextPath,
  setStudioAuthCookie,
} from '@/lib/studioAuthClient';
import StudioLogin from '@/components/studio/StudioLogin';

function stripSignedOutQueryFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const p = new URLSearchParams(window.location.search);
    if (!p.get('signedOut')) return;
    p.delete('signedOut');
    const q = p.toString();
    const path = window.location.pathname || '/login';
    window.history.replaceState({}, '', q ? `${path}?${q}` : path);
  } catch {
    /* ignore */
  }
}

export default function StudioLoginShell() {
  const router = useRouter();
  const [locale, setLocale] = useState<StudioLocale>('en');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = useCallback((k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars), [locale]);

  const bootRedirectDone = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setLocale(studioLocaleFromQuery(params.get('lang')) ?? readStoredLocale() ?? readBrowserLocale());
  }, []);

  useEffect(() => {
    return onAuthStateChanged(getStudioAuth(), (user) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const legacySignedOut = params.get('signedOut') === '1';
      const storageSigningOut = readStudioSigningOutFlag();

      if (!user) {
        bootRedirectDone.current = false;
        clearStudioSigningOutFlag();
        stripSignedOutQueryFromUrl();
        return;
      }

      /** Cerrar sesión forzado (Salir en Studio o query legada) — nunca redirigir a /studio hasta quedar sin usuario. */
      if (legacySignedOut || storageSigningOut) {
        bootRedirectDone.current = true;
        setStudioAuthCookie(false);
        void (async () => {
          try {
            await signOut(getStudioAuth());
          } catch {
            /* ignore */
          } finally {
            clearStudioSigningOutFlag();
            stripSignedOutQueryFromUrl();
          }
        })();
        return;
      }

      setStudioAuthCookie(true);
      if (window.location.pathname !== '/login') return;
      if (bootRedirectDone.current) return;
      bootRedirectDone.current = true;
      const go = params.get('next') || null;
      router.replace(readSafeNextPath(go));
    });
  }, [router]);

  const onSignIn = useCallback(async () => {
    setError(null);
    const rawUsername = username.trim();
    if (!rawUsername) {
      setError(t('login.missingUsername'));
      return;
    }
    setLoading(true);
    try {
      const candidates = await resolveSignInEmailCandidates(rawUsername);
      if (!candidates?.length) {
        setError(t('login.userNotFound'));
        return;
      }
      let credential: Awaited<ReturnType<typeof signInWithEmailAndPassword>> | null = null;
      for (let i = 0; i < candidates.length; i++) {
        const emailTry = candidates[i];
        try {
          credential = await signInWithEmailAndPassword(getStudioAuth(), emailTry, password);
          break;
        } catch (e) {
          const code = String((e as { code?: string })?.code || '');
          const tryNext =
            (code === 'auth/invalid-credential' || code === 'auth/wrong-password') && i < candidates.length - 1;
          if (!tryNext) {
            setError(t('login.error'));
            return;
          }
        }
      }
      if (!credential) {
        setError(t('login.error'));
        return;
      }
      const userDocRef = doc(getStudioDb(), 'users', credential.user.uid);
      try {
        await credential.user.reload();
        const authEmail = String(credential.user.email || '').trim().toLowerCase();
        if (authEmail) {
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            const data = snap.data() as Record<string, unknown>;
            const storedEmail = String(data.emailLower || data.email || '').trim().toLowerCase();
            if (authEmail !== storedEmail) {
              await updateDoc(userDocRef, {
                email: authEmail,
                emailLower: authEmail,
                pendingEmail: null,
                pendingEmailLower: null,
                emailChangedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
      } catch {
        /* best-effort reconcile Firestore with Auth */
      }
      try {
        const userSnap = await getDoc(userDocRef);
        const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : null;
        const rawDeadline = userData?.deletionDeadline as unknown;
        if (userData?.pendingDeletion && rawDeadline) {
          const deadlineMs =
            typeof rawDeadline === 'number'
              ? rawDeadline
              : rawDeadline instanceof Date
                ? rawDeadline.getTime()
                : typeof (rawDeadline as { toMillis?: unknown })?.toMillis === 'function'
                  ? (rawDeadline as { toMillis: () => number }).toMillis()
                  : new Date(String(rawDeadline)).getTime();
          if (Number.isFinite(deadlineMs) && Date.now() < deadlineMs) {
            await updateDoc(userDocRef, {
              pendingDeletion: false,
              deletionRequestedAt: null,
              deletionDeadline: null,
            });
            window.alert(t('profile.restored'));
          } else if (Number.isFinite(deadlineMs)) {
            window.alert(t('profile.deleteExpired'));
            await signOut(getStudioAuth());
            return;
          }
        }
      } catch {
        /* Do not block sign-in if the restoration check cannot run. */
      }
      try {
        await updateDoc(userDocRef, {
          language: locale,
          appLanguage: locale,
          updatedAt: serverTimestamp(),
        });
      } catch {
        /* ignore profile merge (StudioRegisterShell / login path) */
      }
      setStudioAuthCookie(true);
      const go =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;
      router.replace(readSafeNextPath(go));
    } catch {
      setError(t('login.error'));
    } finally {
      setLoading(false);
    }
  }, [locale, password, router, t, username]);

  return (
    <StudioLogin
      locale={locale}
      username={username}
      password={password}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onSubmit={onSignIn}
      loading={loading}
      error={error}
    />
  );
}
