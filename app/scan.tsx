import { BunkerClassificationModal } from '@/components/BunkerClassificationModal';
import { savePendingBunkerScan } from '@/services/bunkerPendingScan';
import { getActiveUserId } from '@/services/authSession';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { fetchPublicQrTokenPreview } from '@/services/qrApi';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ActivityIndicator from '@/components/BrandedSpinner';
import palette from './theme';

type ParsedPayload = {
  token: string;
  cardId: string | null;
  exp: number | null;
};

function parseQrToken(data: string): ParsedPayload | null {
  const raw = String(data || '').trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const kind = String(parsed?.kind || '').trim().toLowerCase();
    const token = String(parsed?.token || '').trim();
    const cardId = String(parsed?.cardId || '').trim();
    const expRaw = Number(parsed?.exp);
    const exp = Number.isFinite(expRaw) ? expRaw : null;
    if (token && kind === 'cardsocial-qr-v1' && cardId) {
      return { token, cardId, exp };
    }
  } catch {
    /* plain token not supported for dynamic QR */
  }

  return null;
}

type ClassificationPayload = {
  token: string;
  ownerUid: string;
  cardId: string;
  issuerFullName: string;
};

export default function ScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resumeToken?: string; resumeCardId?: string }>();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = palette[isDark ? 'dark' : 'light'];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: shell.backgroundSolid,
        },
        centerScreen: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
        },
        title: {
          marginTop: 12,
          color: shell.textPrimary,
          fontSize: 20,
          fontWeight: '700',
          textAlign: 'center',
        },
        subtitle: {
          marginTop: 8,
          color: shell.textSecondary,
          fontSize: 14,
          textAlign: 'center',
        },
        primaryBtn: {
          marginTop: 16,
          backgroundColor: shell.ctaPrimary,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 11,
        },
        primaryBtnText: {
          color: shell.btnPrimaryText,
          fontWeight: '700',
        },
        secondaryBtn: {
          marginTop: 10,
          borderWidth: 1,
          borderColor: shell.border,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 11,
          backgroundColor: shell.surface,
        },
        secondaryBtnText: {
          color: shell.ctaPrimary,
          fontWeight: '700',
        },
        overlay: {
          flex: 1,
          justifyContent: 'space-between',
          paddingTop: 70,
          paddingBottom: 36,
          paddingHorizontal: 20,
        },
        topPanel: {
          alignItems: 'center',
        },
        overlayTitle: {
          color: shell.fabText,
          fontSize: 22,
          fontWeight: '700',
        },
        overlaySubtitle: {
          marginTop: 6,
          color: 'rgba(255,255,255,0.82)',
          fontSize: 13,
        },
        frameWrap: {
          alignItems: 'center',
        },
        scanFrame: {
          width: 260,
          height: 260,
          borderRadius: 20,
          borderWidth: 3,
          borderColor: shell.refreshAccent,
          backgroundColor: 'rgba(255,255,255,0.06)',
        },
        bottomPanel: {
          alignItems: 'center',
          gap: 12,
        },
        secondaryBtnGlass: {
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.45)',
          borderRadius: 12,
          paddingHorizontal: 20,
          paddingVertical: 10,
          backgroundColor: 'rgba(255,255,255,0.14)',
        },
        secondaryBtnGlassText: {
          color: shell.fabText,
          fontWeight: '700',
        },
      }),
    [shell],
  );

  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [receiverUid, setReceiverUid] = useState<string | null>(null);
  const [classification, setClassification] = useState<ClassificationPayload | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const resumeHandledRef = useRef(false);

  const canScan = useMemo(() => {
    return !processing && !scanLocked && !modalVisible;
  }, [processing, scanLocked, modalVisible]);

  const openClassification = useCallback(
    async (token: string) => {
      setProcessing(true);
      const locale = language === 'es' ? 'es' : 'en';
      try {
        const preview = await fetchPublicQrTokenPreview({ token, locale });
        if (!preview.ok) {
          Alert.alert(
            tr('QR no disponible', 'QR unavailable'),
            preview.expired
              ? tr('El token expiró o ya fue usado.', 'The token expired or was already used.')
              : tr('No se pudo cargar la vista previa.', 'Could not load preview.'),
          );
          setScanLocked(false);
          return;
        }
        const p = preview.preview;
        setClassification({
          token: p.token,
          ownerUid: p.ownerUid,
          cardId: p.cardId,
          issuerFullName: p.ownerDisplayName,
        });
        setModalVisible(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : tr('Error de red.', 'Network error.');
        Alert.alert(tr('No se pudo escanear', 'Could not scan'), msg);
        setScanLocked(false);
      } finally {
        setProcessing(false);
      }
    },
    [tr, language],
  );

  const handleScanned = async (data: string) => {
    if (!canScan) {
      return;
    }

    const parsed = parseQrToken(data);
    if (!parsed?.token) {
      Alert.alert(
        tr('QR inválido', 'Invalid QR'),
        tr('Este QR no pertenece a Card-Social o está corrupto.', 'This QR does not belong to Card-Social or is corrupted.'),
      );
      return;
    }
    const scannedCardId = parsed.cardId;
    if (!scannedCardId) {
      Alert.alert(
        tr('QR inválido', 'Invalid QR'),
        tr('Este QR no pertenece a Card-Social o está corrupto.', 'This QR does not belong to Card-Social or is corrupted.'),
      );
      return;
    }

    if (parsed.exp && parsed.exp < Date.now()) {
      Alert.alert(
        tr('QR expirado', 'QR expired'),
        tr('Este QR ya expiró. Pide al contacto generar uno nuevo.', 'This QR has expired. Ask your contact to generate a new one.'),
      );
      return;
    }

    setScanLocked(true);

    const uid = await getActiveUserId();
    setReceiverUid(uid);
    if (!uid) {
      await savePendingBunkerScan({
        kind: 'dynamic_qr',
        token: parsed.token,
        cardId: scannedCardId,
      });
      router.replace('/signin');
      return;
    }

    await openClassification(parsed.token);
  };

  useEffect(() => {
    const rt = params.resumeToken != null ? String(params.resumeToken).trim() : '';
    const rc = params.resumeCardId != null ? String(params.resumeCardId).trim() : '';
    if (!rt || !rc) {
      resumeHandledRef.current = false;
      return;
    }
    if (resumeHandledRef.current) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid || cancelled) {
        return;
      }
      resumeHandledRef.current = true;
      setReceiverUid(uid);
      setScanLocked(true);
      await openClassification(rt);
    })();
    return () => {
      cancelled = true;
    };
  }, [openClassification, params.resumeCardId, params.resumeToken]);

  if (!permission) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={shell.refreshAccent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <LinearGradient colors={[...shell.tabShellGradient]} style={styles.centerScreen}>
        <Text style={styles.title}>{tr('Permiso de cámara requerido', 'Camera permission required')}</Text>
        <Text style={styles.subtitle}>{tr('Necesitamos acceso para escanear tu nueva tarjeta.', 'We need access to scan your new card.')}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>{tr('Permitir cámara', 'Allow camera')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>{tr('Volver', 'Back')}</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const overlayGradient = isDark
    ? (['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.72)'] as const)
    : (['rgba(28,28,30,0.55)', 'rgba(28,28,30,0.22)', 'rgba(28,28,30,0.55)'] as const);

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={canScan ? ({ data }) => void handleScanned(data) : undefined}
      />

      <LinearGradient colors={[...overlayGradient]} style={styles.overlay}>
        <View style={styles.topPanel}>
          <Text style={styles.overlayTitle}>{tr('Escanear Nueva Tarjeta', 'Scan New Card')}</Text>
          <Text style={styles.overlaySubtitle}>{tr('Apunta el QR dentro del marco', 'Point the QR within the frame')}</Text>
        </View>

        <View style={styles.frameWrap}>
          <View style={styles.scanFrame} />
        </View>

        <View style={styles.bottomPanel}>
          {processing ? <ActivityIndicator size="small" color={shell.refreshAccent} /> : null}
          <TouchableOpacity style={styles.secondaryBtnGlass} onPress={() => router.back()}>
            <Text style={styles.secondaryBtnGlassText}>{tr('Cancelar', 'Cancel')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {classification && receiverUid ? (
        <BunkerClassificationModal
          visible={modalVisible}
          mode="dynamic_qr"
          token={classification.token}
          ownerUid={classification.ownerUid}
          cardId={classification.cardId}
          issuerFullName={classification.issuerFullName}
          receiverUid={receiverUid}
          onClose={() => {
            setModalVisible(false);
            setClassification(null);
            setScanLocked(false);
          }}
          onSuccess={() => {
            setModalVisible(false);
            setClassification(null);
            setScanLocked(false);
            router.replace('/(tabs)/contacts');
          }}
        />
      ) : null}
    </View>
  );
}
