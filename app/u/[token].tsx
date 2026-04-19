import { BunkerClassificationModal } from '@/components/BunkerClassificationModal';
import { clearPendingBunkerScan, savePendingBunkerScan } from '@/services/bunkerPendingScan';
import { getActiveUserId } from '@/services/authSession';
import { trEsEn, useLanguage } from '@/services/language';
import { myCardsPayloadFromUniversalCard } from '@/services/incomingCardPreviewPayload';
import { fetchPublicUniversalCardByToken, type PublicUniversalCardPayload } from '@/services/qrApi';
import { buildCanonicalIssuerIdentityFromPublicUniversalCard } from '@/types/canonicalIssuerIdentity';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function UniversalTokenScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token: string | string[] }>();
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const router = useRouter();
  const { language } = useLanguage();

  const tr = useCallback((es: string, en: string) => trEsEn(es, en, language), [language]);
  const locale = language;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<PublicUniversalCardPayload | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [receiverUid, setReceiverUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = String(token || '').trim();
    if (!t) {
      setError(tr('Token no válido.', 'Invalid token.'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const uid = await getActiveUserId();
    setReceiverUid(uid);
    const res = await fetchPublicUniversalCardByToken({ token: t, source: 'qr_scan', locale });
    if (!res.ok) {
      setError(
        res.expired
          ? tr('Acceso expirado.', 'Access expired.')
          : res.error?.trim() ||
              tr('No se pudo cargar la tarjeta.', 'Could not load the card.'),
      );
      setLoading(false);
      return;
    }
    setCard(res.card);
    setLoading(false);

    if (!uid) {
      await savePendingBunkerScan({ kind: 'universal', token: t });
      router.replace('/signin');
      return;
    }
    setModalVisible(true);
  }, [locale, router, token, tr]);

  useEffect(() => {
    void load();
  }, [load]);

  const unknownErr = useMemo(() => tr('Error desconocido.', 'Unknown error.'), [tr]);

  const handleSuccess = useCallback(() => {
    void clearPendingBunkerScan();
    router.replace('/(tabs)/contacts');
  }, [router]);

  const previewPayload = useMemo(
    () => (card ? myCardsPayloadFromUniversalCard(card, tr) : null),
    [card, tr],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  if (error || !card) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{error || unknownErr}</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <BunkerClassificationModal
        visible={modalVisible && Boolean(receiverUid)}
        mode="universal"
        token={String(token || '').trim()}
        issuerUid={card.uid}
        sid={card.sid}
        bId={card.bId}
        issuerFullName={buildCanonicalIssuerIdentityFromPublicUniversalCard(card).userFullName}
        receiverUid={receiverUid || ''}
        previewPayload={previewPayload}
        onClose={() => {
          setModalVisible(false);
          router.back();
        }}
        onSuccess={handleSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 },
  err: { color: '#d4af37', textAlign: 'center', fontSize: 15 },
});
