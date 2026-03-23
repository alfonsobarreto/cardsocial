import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getActiveUserId } from '@/services/authSession';
import { issueDynamicQrToken } from '@/services/qrApi';
import { useLanguage } from '@/services/language';

const DEFAULT_CARD_ID = 'default-social-card';
const DEFAULT_TTL_SEC = 60;

export default function ShareScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const [qrToken, setQrToken] = useState('');
  const [expiresAtMs, setExpiresAtMs] = useState(0);
  const [windowMs, setWindowMs] = useState(DEFAULT_TTL_SEC * 1000);
  const [remainingMs, setRemainingMs] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const [issuing, setIssuing] = useState(false);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const issueFreshQr = async () => {
    try {
      setIssuing(true);
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error(tr('No se pudo validar tu sesión activa para emitir el QR.', 'Could not validate your active session to issue the QR.'));
      }

      const issued = await issueDynamicQrToken({ ownerUid, cardId: DEFAULT_CARD_ID });
      const ttlSec = Number.isFinite(issued.ttlSec) && issued.ttlSec > 0 ? issued.ttlSec : DEFAULT_TTL_SEC;
      const parsedExpiresAt = Date.parse(String(issued.expiresAt || ''));
      const nextExpiresAt = Number.isFinite(parsedExpiresAt)
        ? parsedExpiresAt
        : Date.now() + ttlSec * 1000;
      const nextWindowMs = Math.max(1000, nextExpiresAt - Date.now());

      setQrToken(String(issued.token || ''));
      setExpiresAtMs(nextExpiresAt);
      setWindowMs(nextWindowMs);
    } catch (error: any) {
      Alert.alert(tr('Error de QR', 'QR Error'), error?.message || tr('No se pudo generar el QR dinámico.', 'Could not generate the dynamic QR.'));
    } finally {
      setIssuing(false);
    }
  };

  useEffect(() => {
    issueFreshQr();
  }, []);

  useEffect(() => {
    if (!expiresAtMs) {
      setRemainingMs(0);
      setRemainingSec(0);
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
      return;
    }

    const tick = () => {
      const remainingMs = Math.max(0, expiresAtMs - Date.now());
      setRemainingMs(remainingMs);
      const nextSec = Math.ceil(remainingMs / 1000);
      setRemainingSec(nextSec);

      if (remainingMs <= 0 && tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    };

    tick();
  tickerRef.current = setInterval(tick, 80);

    return () => {
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    };
  }, [expiresAtMs]);

  const qrPayload = useMemo(() => {
    if (!qrToken) {
      return '';
    }

    return JSON.stringify({
      kind: 'cardsocial-qr-v1',
      token: qrToken,
      exp: expiresAtMs,
    });
  }, [qrToken, expiresAtMs]);

  const progressPercent = useMemo(() => {
    return Math.max(0, Math.min(1, remainingMs / windowMs));
  }, [remainingMs, windowMs]);

  const qrExpired = useMemo(() => {
    return Boolean(qrPayload) && remainingMs <= 0;
  }, [qrPayload, remainingMs]);

  return (
    <LinearGradient colors={['#EAF7FF', '#CDEFFF', '#B8E7FF']} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{tr('QR Bancario Dinamico', 'Banking Dynamic QR')}</Text>
        <Text style={styles.subtitle}>{tr('Caduca en 60 segundos por seguridad', 'Expires in 60 seconds for security')}</Text>

        <View style={styles.countdownWrap}>
          <Text style={styles.countdownText}>{remainingSec}s</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent * 100}%` }]} />
          </View>
        </View>

        <View style={styles.qrContainer}>
          {issuing ? (
            <ActivityIndicator size="large" color="#0D4D8A" />
          ) : qrPayload ? (
            <View style={styles.qrLayer}>
              <QRCode
                value={qrPayload}
                size={220}
                color="#0D4D8A"
                backgroundColor="#FFFFFF"
                logo={require('../assets/images/CS Icon Logo.png')}
                logoSize={46}
                logoBackgroundColor="transparent"
                ecl="H"
              />

              {qrExpired ? (
                <View style={styles.expiredOverlay}>
                  <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
                  <TouchableOpacity style={styles.overlayRescueBtn} onPress={issueFreshQr} disabled={issuing}>
                    <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
                    <Text style={styles.overlayRescueBtnText}>{tr('Actualizar codigo', 'Refresh code')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.emptyQrText}>No hay QR disponible</Text>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.replace('/(tabs)/cards' as any)}>
            <Text style={styles.ghostBtnText}>{tr('Ir a Tarjetas', 'Go to Cards')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.primaryBtn} onPress={issueFreshQr} disabled={issuing}>
            <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>{tr('Regenerar', 'Regenerate')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.2)',
    padding: 18,
    alignItems: 'center',
  },
  title: {
    color: '#0D4D8A',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    color: '#3F7193',
    fontSize: 13,
  },
  countdownWrap: {
    marginTop: 14,
    width: '100%',
  },
  countdownText: {
    color: '#0A2540',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#EAF7FF',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0A2540',
  },
  qrContainer: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D6F2FF',
    padding: 16,
    minHeight: 252,
    minWidth: 252,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLayer: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayRescueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0A2540',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#CDEFFF',
  },
  overlayRescueBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyQrText: {
    color: '#3F7193',
    fontSize: 13,
  },
  actionsRow: {
    marginTop: 16,
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  ghostBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    alignItems: 'center',
  },
  ghostBtnText: {
    color: '#0D4D8A',
    fontWeight: '700',
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#0D4D8A',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
