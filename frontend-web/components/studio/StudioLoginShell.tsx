'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getStudioAuth, getStudioDb } from '@/lib/studioFirebase';
import { resolveSignInEmail } from '@/lib/resolveSignInEmail';
import {
  readBrowserLocale,
  readStoredLocale,
  studioLocaleFromQuery,
  studioT,
  type StudioLocale,
} from '@/lib/studioI18n';
import { readSafeNextPath, setStudioAuthCookie } from '@/lib/studioAuthClient';
import StudioLogin from '@/components/studio/StudioLogin';

export default function StudioLoginShell() {
  const router = useRouter();
  const [locale, setLocale] = useState<StudioLocale>('en');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState('/studio/bunker');

  const t = useCallback((k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars), [locale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setNextPath(readSafeNextPath(params.get('next')));
    setLocale(studioLocaleFromQuery(params.get('lang')) ?? readStoredLocale() ?? readBrowserLocale());
  }, []);

  useEffect(() => {
    return onAuthStateChanged(getStudioAuth(), (user) => {
      if (user) {
        setStudioAuthCookie(true);
        router.replace(nextPath);
      }
    });
  }, [nextPath, router]);

  const onSignIn = useCallback(async () => {
    setError(null);
    const rawUsername = username.trim();
    if (!rawUsername) {
      setError(t('login.missingUsername'));
      return;
    }
    setLoading(true);
    try {
      const emailResolved = await resolveSignInEmail(rawUsername);
      if (!emailResolved) {
        setError(t('login.userNotFound'));
        return;
      }
      const credential = await signInWithEmailAndPassword(getStudioAuth(), emailResolved, password);
      const userDocRef = doc(getStudioDb(), 'users', credential.user.uid);
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
      setStudioAuthCookie(true);
      router.replace(nextPath);
    } catch {
      setError(t('login.error'));
    } finally {
      setLoading(false);
    }
  }, [nextPath, password, router, t, username]);

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
