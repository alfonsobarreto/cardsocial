import { auth } from '@/services/firebaseConfig';
import { isLikelyCardsocialOpaqueToken } from '@/services/cardsocialOpaqueToken';
import { clearPendingBunkerScan, loadPendingBunkerScan } from '@/services/bunkerPendingScan';
import { APP_LANGUAGE_STORAGE_KEY } from '@/services/language';
import { fetchPublicQrTokenPreview, fetchPublicUniversalCardByToken } from '@/services/qrApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Tras login: reanuda enlace universal (/u/…) o escaneo QR dinámico (scan con params).
 * Fase 4: si el portapapeles trae un token opaco válido (p. ej. copiado desde la web), abre el flujo.
 */
export function PendingBunkerRedeemGate() {
  const router = useRouter();
  const handledRef = useRef(false);
  const lastFailedClipboardTokenRef = useRef<string | null>(null);

  const tryResumeFromClipboard = useCallback(async (): Promise<boolean> => {
    const raw = await Clipboard.getStringAsync();
    const token = String(raw || '').trim();
    if (!isLikelyCardsocialOpaqueToken(token)) {
      return false;
    }
    if (lastFailedClipboardTokenRef.current === token) {
      return false;
    }

    let stored: string | null = null;
    try {
      stored = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    const locale = stored === 'es' ? 'es' : 'en';

    const uni = await fetchPublicUniversalCardByToken({ token, source: 'clipboard_bridge', locale });
    if (uni.ok) {
      lastFailedClipboardTokenRef.current = null;
      await Clipboard.setStringAsync('').catch(() => null);
      router.replace(`/u/${encodeURIComponent(token)}` as never);
      return true;
    }

    const dyn = await fetchPublicQrTokenPreview({ token, locale });
    if (dyn.ok) {
      lastFailedClipboardTokenRef.current = null;
      await Clipboard.setStringAsync('').catch(() => null);
      router.replace({
        pathname: '/scan',
        params: { resumeToken: token, resumeCardId: dyn.preview.cardId },
      } as never);
      return true;
    }

    lastFailedClipboardTokenRef.current = token;
    return false;
  }, [router]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user?.uid) {
        handledRef.current = false;
        lastFailedClipboardTokenRef.current = null;
        return;
      }
      if (handledRef.current) {
        return;
      }
      const pending = await loadPendingBunkerScan();
      if (pending) {
        handledRef.current = true;
        await clearPendingBunkerScan();
        if (pending.kind === 'universal') {
          router.replace(`/u/${encodeURIComponent(pending.token)}` as never);
          return;
        }
        if (pending.kind === 'dynamic_qr') {
          router.replace({
            pathname: '/scan',
            params: { resumeToken: pending.token, resumeCardId: pending.cardId },
          } as never);
        }
        return;
      }

      const fromClip = await tryResumeFromClipboard();
      if (fromClip) {
        handledRef.current = true;
      }
    });
    return () => unsub();
  }, [router, tryResumeFromClipboard]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }
      const user = auth.currentUser;
      if (!user?.uid) {
        return;
      }
      void (async () => {
        const raw = await Clipboard.getStringAsync();
        const token = String(raw || '').trim();
        if (!isLikelyCardsocialOpaqueToken(token)) {
          return;
        }
        await tryResumeFromClipboard();
      })();
    });
    return () => sub.remove();
  }, [tryResumeFromClipboard]);

  return null;
}
