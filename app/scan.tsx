import { BunkerClassificationModal } from '@/components/BunkerClassificationModal';
import type { MyCardsPayload } from '@/components/MyCards';
import { savePendingBunkerScan } from '@/services/bunkerPendingScan';
import { getActiveUserId } from '@/services/authSession';
import { businessFirestoreDocToMyCardsPayload } from '@/services/adaptBusinessCardMarketPremium';
import { readBusinessCardIdentityFields } from '@/services/businessCardService';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { myCardsPayloadFromQrPreview, myCardsPayloadFromUniversalCard } from '@/services/incomingCardPreviewPayload';
import {
  buildCanonicalIssuerIdentityFromPublicUniversalCard,
  buildCanonicalIssuerIdentityFromQrPreview,
} from '@/types/canonicalIssuerIdentity';
import { db } from '@/services/firebaseConfig';
import { fetchUserProfilePhotoUrl } from '@/services/userProfilePhoto';
import {
  fetchPublicBusinessCardPreview,
  fetchPublicQrTokenPreview,
  fetchPublicUniversalCardByToken,
  type PublicQrTokenPreview,
  type PublicUniversalCardPayload,
} from '@/services/qrApi';
import {
  normalizeQrScanPayload,
  parseBrandedBusinessQrUrl,
  parseDynamicAppQrJson,
  parsePermanentBusinessQr,
  parseUniversalWebQrUrl,
} from '@/services/parseCardsocialQrPayload';
import { doc, getDoc } from 'firebase/firestore';
import axios from 'axios';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ActivityIndicator from '@/components/BrandedSpinner';
import palette from './theme';

type ClassificationPayload = {
  token: string;
  issuerUid: string;
  sid: string | null;
  bId: string | null;
  issuerFullName: string;
};

type IncomingScanMode = 'dynamic_qr' | 'business_permanent' | 'universal';

export default function ScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    resumeToken?: string;
    resumeIssuerUid?: string;
    resumeBId?: string;
  }>();
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
          ...StyleSheet.absoluteFillObject,
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
  const [qrPreview, setQrPreview] = useState<PublicQrTokenPreview | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [incomingScanMode, setIncomingScanMode] = useState<IncomingScanMode>('dynamic_qr');
  /** Vista previa Firestore (`businessCards`) si el API público Mongo no tiene la tarjeta. */
  const [incomingPreviewOverride, setIncomingPreviewOverride] = useState<MyCardsPayload | null>(null);
  /** QR web24h escaneado in-app: payload público del token (misma API que `/u/[token]`). */
  const [universalCard, setUniversalCard] = useState<PublicUniversalCardPayload | null>(null);
  /** QR dinámico (smart): avatar del emisor desde `users/{uid}.userAvatarUrl`, no el snapshot del token. */
  const [issuerProfileAvatarUrl, setIssuerProfileAvatarUrl] = useState<string | null>(null);
  const resumeHandledRef = useRef(false);

  const canScan = useMemo(() => {
    return !processing && !scanLocked && !modalVisible;
  }, [processing, scanLocked, modalVisible]);

  const resetScanUi = useCallback(() => {
    setProcessing(false);
    setScanLocked(false);
    setModalVisible(false);
    setClassification(null);
    setQrPreview(null);
    setIncomingScanMode('dynamic_qr');
    setIncomingPreviewOverride(null);
    setUniversalCard(null);
    setIssuerProfileAvatarUrl(null);
  }, []);

  const openClassification = useCallback(
    async (token: string) => {
      setUniversalCard(null);
      setIncomingScanMode('dynamic_qr');
      setIncomingPreviewOverride(null);
      setProcessing(true);
      const locale = language;
      const okLabel = tr('Aceptar', 'OK');
      try {
        const preview = await fetchPublicQrTokenPreview({ token, locale });
        if (!preview.ok) {
          Alert.alert(
            tr('QR no disponible', 'QR unavailable'),
            preview.expired
              ? tr('El token expiró o ya fue usado.', 'The token expired or was already used.')
              : tr('No se pudo cargar la vista previa.', 'Could not load preview.'),
            [{ text: okLabel, onPress: resetScanUi }],
          );
          setScanLocked(false);
          return;
        }
        const p = preview.preview;
        setQrPreview(p);
        setClassification({
          token: p.token,
          issuerUid: p.uid,
          sid: p.sid,
          bId: p.bId,
          issuerFullName: buildCanonicalIssuerIdentityFromQrPreview(p).userFullName,
        });
        setModalVisible(true);
      } catch (e: unknown) {
        if (__DEV__) {
          if (axios.isAxiosError(e)) {
            console.error('[Scan openClassification] axios', e.message, e.code, e.response?.data ?? e.response?.status);
          } else {
            console.error('[Scan openClassification]', e instanceof Error ? e.message : e);
          }
        }
        const msg = e instanceof Error ? e.message : tr('Error de red.', 'Network error.');
        Alert.alert(tr('No se pudo escanear', 'Could not scan'), msg, [{ text: okLabel, onPress: resetScanUi }]);
        setScanLocked(false);
      } finally {
        setProcessing(false);
      }
    },
    [tr, language, resetScanUi],
  );

  const openUniversalClassification = useCallback(
    async (opaqueToken: string) => {
      setClassification(null);
      setModalVisible(false);
      setUniversalCard(null);
      setQrPreview(null);
      setIncomingPreviewOverride(null);
      setIncomingScanMode('universal');
      setProcessing(true);
      const locale = language;
      const okLabel = tr('Aceptar', 'OK');
      try {
        const res = await fetchPublicUniversalCardByToken({
          token: opaqueToken,
          source: 'qr_scan',
          locale,
        });
        if (!res.ok) {
          Alert.alert(
            tr('QR no disponible', 'QR unavailable'),
            res.expired
              ? tr('El enlace expiró o ya no es válido.', 'This link expired or is no longer valid.')
              : tr('No se pudo cargar la vista previa.', 'Could not load preview.'),
            [{ text: okLabel, onPress: resetScanUi }],
          );
          setScanLocked(false);
          return;
        }
        const card = res.card;
        setUniversalCard(card);
        setClassification({
          token: opaqueToken,
          issuerUid: card.uid,
          sid: card.sid,
          bId: card.bId,
          issuerFullName: String(card.ownerDisplayName || '').trim(),
        });
        setModalVisible(true);
      } catch (e: unknown) {
        if (__DEV__) {
          if (axios.isAxiosError(e)) {
            console.error('[Scan openUniversalClassification] axios', e.message, e.code, e.response?.data ?? e.response?.status);
          } else {
            console.error('[Scan openUniversalClassification]', e instanceof Error ? e.message : e);
          }
        }
        const msg = e instanceof Error ? e.message : tr('Error de red.', 'Network error.');
        Alert.alert(tr('No se pudo escanear', 'Could not scan'), msg, [{ text: okLabel, onPress: resetScanUi }]);
        setScanLocked(false);
      } finally {
        setProcessing(false);
      }
    },
    [tr, language, resetScanUi],
  );

  const openBusinessClassification = useCallback(
    async (issuerUid: string, bId: string) => {
      setUniversalCard(null);
      setIncomingScanMode('business_permanent');
      setIncomingPreviewOverride(null);
      setProcessing(true);
      const locale = language;
      const okLabel = tr('Aceptar', 'OK');
      try {
        const preview = await fetchPublicBusinessCardPreview({ uid: issuerUid, bId, locale });
        if (!preview.ok) {
          const bSnap = await getDoc(doc(db, 'businessCards', bId));
          if (bSnap.exists()) {
            const raw = bSnap.data() as Record<string, unknown>;
            if (String(raw?.uid || '').trim() === issuerUid) {
              const payload = businessFirestoreDocToMyCardsPayload(raw, bId, tr);
              setIncomingPreviewOverride(payload);
              const far = new Date();
              far.setFullYear(far.getFullYear() + 10);
              const idn = readBusinessCardIdentityFields(raw);
              const issuer =
                String(idn.bcContactName || idn.bcName || '').trim() ||
                String(payload.cardName || '').trim();
              setQrPreview({
                uid: issuerUid,
                sid: null,
                bId,
                token: '',
                expiresAt: far.toISOString(),
                ownerDisplayName: issuer,
                cardName: payload.cardName,
                ownerNickname: null,
                /** Campo de tarjeta en Mongo (`smart_cards.ownerPhotoUrl`), p. ej. logo; no es `userAvatarUrl` de persona. */
                ownerPhotoUrl: payload.avatarUrl,
                ownerOccupation: null,
                /**
                 * Fallback Firestore: sin perfil Mongo; identidad persona en null.
                 * VoIP puede usar `ownerPhotoUrl` solo como imagen de tarjeta si aplica.
                 */
                userFullName: null,
                userNickName: null,
                userAvatarUrl: null,
                themeId: payload.themeId,
                layout: payload.layout,
                wallpaperUrl: payload.wallpaperUrl,
                enableParallax: payload.enableParallax,
                holdersCount: payload.holdersCount,
                ratingAvg: payload.ratingAvg,
                totalRatings: payload.totalRatings,
                slots: [],
              });
              setClassification({
                token: '',
                issuerUid,
                sid: null,
                bId,
                issuerFullName: issuer,
              });
              setModalVisible(true);
              return;
            }
          }
          Alert.alert(
            tr('QR no disponible', 'QR unavailable'),
            tr('No se pudo cargar la vista previa.', 'Could not load preview.'),
            [{ text: okLabel, onPress: resetScanUi }],
          );
          setScanLocked(false);
          return;
        }
        const p = preview.preview;
        setQrPreview(p);
        setClassification({
          token: '',
          issuerUid: p.uid,
          sid: p.sid,
          bId: p.bId,
          issuerFullName: buildCanonicalIssuerIdentityFromQrPreview(p).userFullName,
        });
        setModalVisible(true);
      } catch (e: unknown) {
        if (__DEV__) {
          if (axios.isAxiosError(e)) {
            console.error('[Scan openBusinessClassification] axios', e.message, e.code, e.response?.data ?? e.response?.status);
          } else {
            console.error('[Scan openBusinessClassification]', e instanceof Error ? e.message : e);
          }
        }
        const msg = e instanceof Error ? e.message : tr('Error de red.', 'Network error.');
        Alert.alert(tr('No se pudo escanear', 'Could not scan'), msg, [{ text: okLabel, onPress: resetScanUi }]);
        setScanLocked(false);
      } finally {
        setProcessing(false);
      }
    },
    [tr, language, resetScanUi],
  );

  const handleScanned = async (data: string) => {
    if (!canScan) {
      return;
    }

    const okLabel = tr('Aceptar', 'OK');
    const invalidButtons = [{ text: okLabel, onPress: resetScanUi }];
    const normalized = normalizeQrScanPayload(data);

    const business = parsePermanentBusinessQr(normalized) || parseBrandedBusinessQrUrl(normalized);
    if (business) {
      setScanLocked(true);
      const uid = await getActiveUserId();
      setReceiverUid(uid);
      if (!uid) {
        await savePendingBunkerScan({
          kind: 'business_permanent',
          uid: business.uid,
          bId: business.bId,
        });
        router.replace('/signin');
        return;
      }
      await openBusinessClassification(business.uid, business.bId);
      return;
    }

    const dyn = parseDynamicAppQrJson(normalized);
    if (!dyn || dyn.kind !== 'dynamic_app' || !dyn.token) {
      const uni = parseUniversalWebQrUrl(normalized);
      if (uni?.token) {
        setScanLocked(true);
        const uid = await getActiveUserId();
        setReceiverUid(uid);
        if (!uid) {
          await savePendingBunkerScan({ kind: 'universal', token: uni.token });
          router.replace('/signin');
          return;
        }
        await openUniversalClassification(uni.token);
        return;
      }
      Alert.alert(
        tr('QR inválido', 'Invalid QR'),
        tr('Este QR no pertenece a Card-Social o está corrupto.', 'This QR does not belong to Card-Social or is corrupted.'),
        invalidButtons,
      );
      return;
    }

    if (dyn.exp && dyn.exp < Date.now()) {
      Alert.alert(
        tr('QR expirado', 'QR expired'),
        tr('Este QR ya expiró. Pide al contacto generar uno nuevo.', 'This QR has expired. Ask your contact to generate a new one.'),
        invalidButtons,
      );
      return;
    }

    setScanLocked(true);

    const uid = await getActiveUserId();
    setReceiverUid(uid);
    if (!uid) {
      await savePendingBunkerScan({
        kind: 'dynamic_qr',
        token: dyn.token,
      });
      router.replace('/signin');
      return;
    }

    await openClassification(dyn.token);
  };

  useEffect(() => {
    const rt = params.resumeToken != null ? String(params.resumeToken).trim() : '';
    const rb = params.resumeBId != null ? String(params.resumeBId).trim() : '';
    const ri = params.resumeIssuerUid != null ? String(params.resumeIssuerUid).trim() : '';

    const businessResume = Boolean(ri && rb);
    const dynamicResume = Boolean(rt);

    if (!businessResume && !dynamicResume) {
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
      if (businessResume) {
        await openBusinessClassification(ri, rb);
      } else {
        await openClassification(rt);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    openBusinessClassification,
    openClassification,
    params.resumeBId,
    params.resumeIssuerUid,
    params.resumeToken,
  ]);

  useEffect(() => {
    if (incomingPreviewOverride) {
      setIssuerProfileAvatarUrl(null);
      return;
    }
    const uid =
      incomingScanMode === 'universal' && universalCard
        ? String(universalCard.uid || '').trim()
        : incomingScanMode === 'dynamic_qr' && qrPreview
          ? String(qrPreview.uid || '').trim()
          : '';
    if (!uid) {
      setIssuerProfileAvatarUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const url = await fetchUserProfilePhotoUrl(uid);
      if (!cancelled) setIssuerProfileAvatarUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [incomingPreviewOverride, incomingScanMode, qrPreview?.uid, universalCard?.uid]);

  const scanPreviewPayload = useMemo(() => {
    if (incomingPreviewOverride) {
      return incomingPreviewOverride;
    }
    if (incomingScanMode === 'universal' && universalCard) {
      const base = myCardsPayloadFromUniversalCard(universalCard, tr);
      return { ...base, avatarUrl: issuerProfileAvatarUrl ?? base.avatarUrl };
    }
    if (!qrPreview) {
      return null;
    }
    const base = myCardsPayloadFromQrPreview(qrPreview, tr);
    if (incomingScanMode === 'business_permanent') {
      return { ...base, noAvatarIcon: 'storefront-outline' as const };
    }
    return { ...base, avatarUrl: issuerProfileAvatarUrl ?? base.avatarUrl };
  }, [incomingPreviewOverride, incomingScanMode, universalCard, qrPreview, tr, issuerProfileAvatarUrl]);

  /** Android: no montar CameraView hasta granted === true; siempre ofrecer botón explícito si no hay permiso. */
  if (permission?.granted !== true) {
    const deniedPermanent = permission != null && !permission.granted && permission.canAskAgain === false;
    return (
      <LinearGradient colors={[...shell.tabShellGradient]} style={styles.centerScreen}>
        {permission == null ? <ActivityIndicator size="large" color={shell.refreshAccent} /> : null}
        <Text style={styles.title}>{tr('Permiso de cámara requerido', 'Camera permission required')}</Text>
        <Text style={styles.subtitle}>
          {deniedPermanent
            ? tr(
                'La cámara está desactivada para Card-Social. Actívala en Ajustes del sistema.',
                'Camera is turned off for Card-Social. Enable it in system Settings.',
              )
            : tr('Necesitamos acceso para escanear tu nueva tarjeta.', 'We need access to scan your new card.')}
        </Text>
        {deniedPermanent ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => void Linking.openSettings()}>
            <Text style={styles.primaryBtnText}>{tr('Abrir ajustes', 'Open Settings')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => void requestPermission()}>
            <Text style={styles.primaryBtnText}>{tr('Permitir cámara', 'Allow camera')}</Text>
          </TouchableOpacity>
        )}
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
        style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={
          canScan
            ? (result: BarcodeScanningResult) => {
                const data = typeof result.data === 'string' ? result.data : String(result.raw ?? '');
                if (data) void handleScanned(data);
              }
            : undefined
        }
      />

      <LinearGradient colors={[...overlayGradient]} style={[styles.overlay, { zIndex: 1, elevation: 8 }]} pointerEvents="box-none">
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

      {classification && receiverUid && (qrPreview || universalCard) ? (
        <BunkerClassificationModal
          visible={modalVisible}
          mode={incomingScanMode}
          token={classification.token}
          issuerUid={classification.issuerUid}
          sid={classification.sid}
          bId={classification.bId}
          issuerFullName={classification.issuerFullName}
          receiverUid={receiverUid}
          previewPayload={scanPreviewPayload}
          onClose={() => {
            setModalVisible(false);
            setClassification(null);
            setQrPreview(null);
            setUniversalCard(null);
            setScanLocked(false);
            setIncomingScanMode('dynamic_qr');
            setIncomingPreviewOverride(null);
            setIssuerProfileAvatarUrl(null);
          }}
          onSuccess={() => {
            setModalVisible(false);
            setClassification(null);
            setQrPreview(null);
            setUniversalCard(null);
            setScanLocked(false);
            setIncomingScanMode('dynamic_qr');
            setIncomingPreviewOverride(null);
            setIssuerProfileAvatarUrl(null);
            router.replace('/(tabs)/contacts');
          }}
        />
      ) : null}
    </View>
  );
}
