import { getActiveUserId } from '@/services/authSession';
import { savePendingBunkerScan } from '@/services/bunkerPendingScan';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

/**
 * Universal Link / App Link: `https://cardsocial.me/b/{bId}?uid=…`
 * Reutiliza el mismo flujo que el escáner in-app (pending → signin, o scan + clasificación).
 */
export default function PublicBusinessDeepLinkScreen() {
  const { bId: bIdParam, uid: uidParam, owner: ownerParam } = useLocalSearchParams<{
    bId: string | string[];
    uid?: string | string[];
    owner?: string | string[];
  }>();
  const router = useRouter();
  const { language } = useLanguage();
  const tr = useCallback((es: string, en: string) => coreTrEsEn(es, en, language), [language]);

  const bId = String(Array.isArray(bIdParam) ? bIdParam[0] : bIdParam || '').trim();
  const rawIssuer = uidParam ?? ownerParam;
  const issuerUid = String(Array.isArray(rawIssuer) ? rawIssuer[0] : rawIssuer || '').trim();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!bId || !issuerUid) {
        if (!cancelled) {
          setError(
            tr(
              'Falta el identificador en el enlace. Usa el enlace completo (incluye ?uid=…).',
              'The link is incomplete. Use the full link (including ?uid=…).',
            ),
          );
        }
        return;
      }
      const receiver = await getActiveUserId();
      if (cancelled) {
        return;
      }
      if (!receiver) {
        await savePendingBunkerScan({ kind: 'business_permanent', uid: issuerUid, bId });
        router.replace('/signin');
        return;
      }
      router.replace({
        pathname: '/scan',
        params: { resumeIssuerUid: issuerUid, resumeBId: bId },
      } as never);
    })();
    return () => {
      cancelled = true;
    };
  }, [bId, issuerUid, router, tr]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#d4af37" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 },
  err: { color: '#d4af37', textAlign: 'center', fontSize: 15 },
});
