import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

type ParsedPayload = {
  token: string;
};

function parseQrToken(data: string): ParsedPayload | null {
  const raw = String(data || '').trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const token = String(parsed?.token || '').trim();
    if (token) {
      return { token };
    }
  } catch {
    // If it is not JSON, we try plain token fallback below.
  }

  if (/^[a-f0-9]{48}$/i.test(raw)) {
    return { token: raw };
  }

  return null;
}

export default function ScanScreen() {
  const router = useRouter();
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
    if (!parsed?.token) {
      Alert.alert('QR inválido', 'Este QR no pertenece a Card-Social o está corrupto.');
      return;
    }

    setScanLocked(true);
    setProcessing(true);

    try {
      const receiverUid = await getActiveUserId();
      if (!receiverUid) {
        throw new Error('No se pudo validar tu sesión actual.');
      }

      const result = await consumeDynamicQrToken({
        receiverUid,
        token: parsed.token,
      });

      if (!result.shareGranted) {
        throw new Error('No se pudo crear el permiso de acceso a la tarjeta.');
      }

      Alert.alert('Tarjeta agregada', 'Conexión segura creada correctamente.', [
        {
          text: 'OK',
          onPress: () => {
            router.replace('/(tabs)/contacts');
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert('No se pudo escanear', error?.message || 'El token expiró o ya fue usado.');
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
        <Text style={styles.title}>Permiso de cámara requerido</Text>
        <Text style={styles.subtitle}>Necesitamos acceso para escanear tu nueva tarjeta.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Permitir cámara</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Volver</Text>
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
          <Text style={styles.overlayTitle}>Escanear Nueva Tarjeta</Text>
          <Text style={styles.overlaySubtitle}>Apunta el QR dentro del marco</Text>
        </View>

        <View style={styles.frameWrap}>
          <View style={styles.scanFrame} />
        </View>

        <View style={styles.bottomPanel}>
          {processing ? <ActivityIndicator size="small" color="#1EA7FF" /> : null}
          <TouchableOpacity style={styles.secondaryBtnGlass} onPress={() => router.back()}>
            <Text style={styles.secondaryBtnGlassText}>Cancelar</Text>
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
