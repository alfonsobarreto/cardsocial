import React, { useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { consumeDynamicQrToken } from '@/services/qrApi';
import { getActiveUserId } from '@/services/authSession';
import { useLanguage } from '@/services/language';
import ActivityIndicator from '@/components/BrandedSpinner';

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
    // If it is not JSON, we try plain token fallback below.
  }

  return null;
}

export default function ScanScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);

  const canScan = useMemo(() => {
    return !processing && !scanLocked;
  }, [processing, scanLocked]);

  const handleScanned = async (data: string) => {
    if (!canScan) {
      return;
    }

    const parsed = parseQrToken(data);
    if (!parsed?.token || !parsed?.cardId) {
      Alert.alert(tr('QR inválido', 'Invalid QR'), tr('Este QR no pertenece a Card-Social o está corrupto.', 'This QR does not belong to Card-Social or is corrupted.'));
      return;
    }

    if (parsed.exp && parsed.exp < Date.now()) {
      Alert.alert(
        tr('QR expirado', 'QR expired'),
        tr('Este QR ya expiró. Pide al contacto generar uno nuevo.', 'This QR has expired. Ask your contact to generate a new one.')
      );
      return;
    }

    setScanLocked(true);
    setProcessing(true);

    try {
      const receiverUid = await getActiveUserId();
      if (!receiverUid) {
        throw new Error(tr('No se pudo validar tu sesión actual.', 'Could not validate your current session.'));
      }

      const result = await consumeDynamicQrToken({
        receiverUid,
        token: parsed.token,
      });

      if (!result.shareGranted) {
        throw new Error(tr('No se pudo crear el permiso de acceso a la tarjeta.', 'Could not create card access permission.'));
      }

      if (String(result.cardId || '').trim() !== parsed.cardId) {
        throw new Error(
          tr(
            'No se pudo validar el acceso de la tarjeta escaneada.',
            'Could not validate access for the scanned card.'
          )
        );
      }

      Alert.alert(tr('Tarjeta agregada', 'Card added'), tr('Conexión segura creada correctamente.', 'Secure connection created successfully.'), [
        {
          text: 'OK',
          onPress: () => {
            router.replace('/(tabs)/contacts');
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert(tr('No se pudo escanear', 'Could not scan'), error?.message || tr('El token expiró o ya fue usado.', 'Token expired or already used.'));
      setScanLocked(false);
    } finally {
      setProcessing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color="#1EA7FF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <LinearGradient colors={['#EAF7FF', '#CDEFFF']} style={styles.centerScreen}>
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

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={canScan ? ({ data }) => handleScanned(data) : undefined}
      />

      <LinearGradient colors={['rgba(10,37,64,0.74)', 'rgba(10,37,64,0.35)', 'rgba(10,37,64,0.74)']} style={styles.overlay}>
        <View style={styles.topPanel}>
          <Text style={styles.overlayTitle}>{tr('Escanear Nueva Tarjeta', 'Scan New Card')}</Text>
          <Text style={styles.overlaySubtitle}>{tr('Apunta el QR dentro del marco', 'Point the QR within the frame')}</Text>
        </View>

        <View style={styles.frameWrap}>
          <View style={styles.scanFrame} />
        </View>

        <View style={styles.bottomPanel}>
          {processing ? <ActivityIndicator size="small" color="#1EA7FF" /> : null}
          <TouchableOpacity style={styles.secondaryBtnGlass} onPress={() => router.back()}>
            <Text style={styles.secondaryBtnGlassText}>{tr('Cancelar', 'Cancel')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#03101E',
  },
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 12,
    color: '#0A2540',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: '#2A668F',
    fontSize: 14,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#0A2540',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#A8DAF8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: {
    color: '#0D4D8A',
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
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  overlaySubtitle: {
    marginTop: 6,
    color: '#C9ECFF',
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
    borderColor: '#1EA7FF',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bottomPanel: {
    alignItems: 'center',
    gap: 12,
  },
  secondaryBtnGlass: {
    borderWidth: 1,
    borderColor: 'rgba(199,236,255,0.8)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  secondaryBtnGlassText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
