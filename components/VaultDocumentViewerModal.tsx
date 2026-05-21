import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { resolveVaultMediaUrlForApp } from '@/services/resolveVaultMediaUrl';
import { presentDetectedQrFromT, scanQrFromImageUri } from '@/services/vaultImageQrScan';
import { useCoreT, type CoreLocaleKey } from '@/services/coreI18n';
import { isVaultDocumentImage, isVaultDocumentPdf } from '@/services/vaultMimeGuards';

let PdfComponent: any = null;
try {
  PdfComponent = require('react-native-pdf').default;
} catch {
  PdfComponent = null;
}

const styles = StyleSheet.create({
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.86)',
  },
  viewerTopBar: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 50,
  },
  viewerDownloadButton: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: '#E9C349',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewerDownloadText: {
    color: '#0A2540',
    fontSize: 12,
    fontWeight: '800',
  },
  viewerCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  viewerBody: {
    marginTop: 14,
    alignSelf: 'stretch',
  },
  viewerZoomContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
    minHeight: 340,
  },
  viewerPdfWrapper: {
    backgroundColor: '#0E2236',
  },
  viewerPdf: {
    backgroundColor: '#0E2236',
  },
  viewerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  viewerFallbackText: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  qrScanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    gap: 12,
  },
  qrScanLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 20,
    textAlign: 'center',
  },
});

type Props = {
  visible: boolean;
  item: MirrorVaultItem | null;
  onClose: () => void;
  fallbackMutedColor: string;
};

export function VaultDocumentViewerModal({ visible, item, onClose, fallbackMutedColor }: Props) {
  const t = useCoreT();
  const [downloading, setDownloading] = useState(false);
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);
  const [qrAnalyzing, setQrAnalyzing] = useState(false);
  const qrScanGenRef = useRef(0);
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  /** Misma reescritura que avatares: Mongo puede tener LAN u host viejo; el GET público es …/api/qr/vault-proxy/file/:id. */
  const displayUri = useMemo(() => {
    if (!item?.value) {
      return '';
    }
    return resolveVaultMediaUrlForApp(item.value) ?? item.value;
  }, [item?.value]);

  /** Altura aproximada de la franja superior (safe area + botones) para dar alto fijo al PDF. */
  const topBarReserve = useMemo(() => Math.max(insets.top, Platform.OS === 'ios' ? 47 : 24) + 56 + 20, [insets.top]);

  const pdfSize = useMemo(() => {
    const h = Math.max(280, winH - topBarReserve);
    return { width: winW, height: h };
  }, [winW, winH, topBarReserve]);

  const onPdfError = useCallback(() => {
    setPdfLoadFailed(true);
  }, []);

  useEffect(() => {
    setPdfLoadFailed(false);
  }, [displayUri]);

  useEffect(() => {
    if (!visible) {
      setQrAnalyzing(false);
      qrScanGenRef.current += 1;
    }
  }, [visible]);

  const handleDownload = async () => {
    if (!item?.value || !displayUri) {
      return;
    }
    const mimeHint = item.vaultMimeType;
    try {
      setDownloading(true);
      const fileNameSafe = `${item.title || 'archivo'}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '_');
      const extension = isVaultDocumentPdf(item.value, mimeHint) ? 'pdf' : 'jpg';
      const targetUri = `${FileSystem.cacheDirectory}${fileNameSafe}.${extension}`;

      await FileSystem.downloadAsync(displayUri, targetUri);

      const canShare = await Sharing.isAvailableAsync();
      const shareMime =
        (mimeHint && mimeHint.includes('/')) ? mimeHint : isVaultDocumentPdf(item.value, mimeHint) ? 'application/pdf' : 'image/jpeg';
      if (canShare) {
        await Sharing.shareAsync(targetUri, {
          mimeType: shareMime,
          dialogTitle: t('vault_share_dialog_title'),
        });
      }

      Toast.show({
        type: 'success',
        text1: t('vault_toast_download_title'),
        text2: t('vault_toast_download_body'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('vault_toast_download_fail'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleLongPressPdf = () => {
    if (!item) return;
    Alert.alert(
      t('vault_save_long_title'),
      t('vault_save_long_body'),
      [
        { text: t('qr_cancel'), style: 'cancel' },
        { text: t('vault_save_action'), onPress: () => void handleDownload() },
      ],
    );
  };

  const handleLongPressImageQr = useCallback(async () => {
    if (!item || !displayUri || !isVaultDocumentImage(item.value, item.vaultMimeType)) {
      return;
    }
    const session = ++qrScanGenRef.current;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      /* noop */
    }
    setQrAnalyzing(true);
    try {
      const payload = await scanQrFromImageUri(displayUri);
      if (session !== qrScanGenRef.current) {
        return;
      }
      if (payload) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          /* noop */
        }
        presentDetectedQrFromT(payload, (k) => t(k as CoreLocaleKey), () => {
          Toast.show({
            type: 'success',
            text1: t('vault_copied'),
            position: 'bottom',
            visibilityTime: 1800,
            autoHide: true,
          });
        });
      } else {
        try {
          await Haptics.selectionAsync();
        } catch {
          /* noop */
        }
        Toast.show({
          type: 'info',
          text1: t('vault_no_qr'),
          text2: t('vault_no_qr_body'),
          position: 'bottom',
          visibilityTime: 2200,
          autoHide: true,
        });
      }
    } catch {
      if (session === qrScanGenRef.current) {
        Toast.show({
          type: 'info',
          text1: t('vault_no_qr'),
          text2: t('vault_no_qr_analyze'),
          position: 'bottom',
          visibilityTime: 2200,
          autoHide: true,
        });
      }
    } finally {
      if (session === qrScanGenRef.current) {
        setQrAnalyzing(false);
      }
    }
  }, [displayUri, item, t]);

  const showPdf =
    Boolean(item) &&
    isVaultDocumentPdf(item!.value, item!.vaultMimeType) &&
    !isVaultDocumentImage(item!.value, item!.vaultMimeType) &&
    Boolean(displayUri);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      // iOS: sin esto, un segundo Modal puede quedar bajo el modal del editor / preview
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
    >
      <View style={[styles.viewerOverlay, { width: winW, minHeight: winH }]}>
        {qrAnalyzing ? (
          <View style={styles.qrScanOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color="#F2CA50" />
            <Text style={styles.qrScanLabel}>
              {t('vault_analyzing')}
            </Text>
          </View>
        ) : null}
        <View style={[styles.viewerTopBar, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 8 : 4) }]}>
          <TouchableOpacity style={styles.viewerDownloadButton} onPress={() => void handleDownload()} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator size="small" color="#0A2540" />
            ) : (
              <MaterialCommunityIcons name="download" color="#0A2540" size={18} />
            )}
            <Text style={styles.viewerDownloadText}>{t('common_download')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.viewerCloseButton} onPress={onClose}>
            <MaterialCommunityIcons name="close" color="#002D4B" size={28} />
          </TouchableOpacity>
        </View>

        <View style={[styles.viewerBody, { height: pdfSize.height, minHeight: 280 }]}>
          {item ? (
            isVaultDocumentImage(item.value, item.vaultMimeType) ? (
              <TouchableWithoutFeedback onLongPress={() => void handleLongPressImageQr()} delayLongPress={1800}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  scrollEventThrottle={16}
                  maximumZoomScale={6}
                  minimumZoomScale={1}
                  contentContainerStyle={styles.viewerZoomContainer}
                  centerContent
                  bounces={false}
                  overScrollMode="never"
                  bouncesZoom
                  style={{ width: winW, height: pdfSize.height }}
                >
                  <ExpoImage
                    source={{ uri: displayUri }}
                    style={[styles.viewerImage, { width: winW, minHeight: pdfSize.height * 0.85 }]}
                    contentFit="contain"
                    cachePolicy="disk"
                    transition={200}
                    accessibilityLabel={t('vault_doc_image_a11y')}
                  />
                </ScrollView>
              </TouchableWithoutFeedback>
            ) : showPdf ? (
              PdfComponent ? (
                pdfLoadFailed ? (
                  <View style={[styles.viewerFallback, { minHeight: pdfSize.height }]}>
                    <MaterialCommunityIcons name="file-pdf-box" color="#C5A065" size={54} />
                    <Text style={[styles.viewerFallbackText, { color: fallbackMutedColor }]}>
                      {t('vault_pdf_load_fail')}
                    </Text>
                  </View>
                ) : (
                  <TouchableWithoutFeedback onLongPress={handleLongPressPdf} delayLongPress={550}>
                    <View style={[styles.viewerPdfWrapper, pdfSize]}>
                      <PdfComponent
                        source={{ uri: displayUri }}
                        style={[styles.viewerPdf, pdfSize]}
                        minScale={1}
                        maxScale={3}
                        trustAllCerts
                        onError={onPdfError}
                        onLoadComplete={() => setPdfLoadFailed(false)}
                      />
                    </View>
                  </TouchableWithoutFeedback>
                )
              ) : (
                <View style={[styles.viewerFallback, { minHeight: pdfSize.height }]}>
                  <MaterialCommunityIcons name="file-pdf-box" color="#C5A065" size={54} />
                  <Text style={[styles.viewerFallbackText, { color: fallbackMutedColor }]}>
                    {t('vault_pdf_expo_go')}
                  </Text>
                </View>
              )
            ) : (
              <View style={styles.viewerFallback}>
                <MaterialCommunityIcons name="file-alert-outline" color="#C5A065" size={54} />
                <Text style={[styles.viewerFallbackText, { color: fallbackMutedColor }]}>
                  {t('vault_preview_fail')}
                </Text>
              </View>
            )
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
