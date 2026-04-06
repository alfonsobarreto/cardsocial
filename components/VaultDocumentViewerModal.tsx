import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import React, { useState } from 'react';
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
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';

let PdfComponent: any = null;
try {
  PdfComponent = require('react-native-pdf').default;
} catch {
  PdfComponent = null;
}

function isImageValue(value: string) {
  return (
    /\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(value) ||
    (value.startsWith('file://') && !value.toLowerCase().endsWith('.pdf'))
  );
}

function isPdfValue(value: string) {
  return /\.pdf(\?|$)/i.test(value);
}

const styles = StyleSheet.create({
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.86)',
  },
  viewerTopBar: {
    marginTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 4,
  },
  viewerDownloadButton: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: '#D4AF37',
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
    flex: 1,
    marginTop: 14,
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
    flex: 1,
  },
  viewerPdf: {
    flex: 1,
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
});

type Props = {
  visible: boolean;
  item: MirrorVaultItem | null;
  onClose: () => void;
  tr: (es: string, en: string) => string;
  fallbackMutedColor: string;
};

export function VaultDocumentViewerModal({ visible, item, onClose, tr, fallbackMutedColor }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!item?.value) {
      return;
    }
    try {
      setDownloading(true);
      const fileNameSafe = `${item.title || 'archivo'}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '_');
      const extension = isPdfValue(item.value) ? 'pdf' : 'jpg';
      const targetUri = `${FileSystem.cacheDirectory}${fileNameSafe}.${extension}`;

      await FileSystem.downloadAsync(item.value, targetUri);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(targetUri, {
          mimeType: isPdfValue(item.value) ? 'application/pdf' : 'image/jpeg',
          dialogTitle: tr('Guardar archivo de Card-Social', 'Save Card-Social file'),
        });
      }

      Toast.show({
        type: 'success',
        text1: tr('📥 Descarga lista', '📥 Download ready'),
        text2: tr('Archivo preparado en tu dispositivo', 'File ready on your device'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: tr('❌ No se pudo descargar', '❌ Download failed'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleLongPress = () => {
    if (!item) return;
    Alert.alert(
      tr('Guardar archivo', 'Save file'),
      tr(
        'Mantén la privacidad: el archivo se exportará desde el visor seguro.',
        'Keep privacy: the file will be exported from the secure viewer.',
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        { text: tr('Guardar', 'Save'), onPress: () => void handleDownload() },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerOverlay}>
        <View style={styles.viewerTopBar}>
          <TouchableOpacity style={styles.viewerDownloadButton} onPress={() => void handleDownload()} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator size="small" color="#0A2540" />
            ) : (
              <MaterialCommunityIcons name="download" color="#0A2540" size={18} />
            )}
            <Text style={styles.viewerDownloadText}>{tr('Descargar', 'Download')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.viewerCloseButton} onPress={onClose}>
            <MaterialCommunityIcons name="close" color="#002D4B" size={28} />
          </TouchableOpacity>
        </View>

        <View style={styles.viewerBody}>
          {item ? (
            isImageValue(item.value) ? (
              <TouchableWithoutFeedback onLongPress={handleLongPress} delayLongPress={550}>
                <ScrollView
                  maximumZoomScale={6}
                  minimumZoomScale={1}
                  contentContainerStyle={styles.viewerZoomContainer}
                  centerContent
                  bounces={false}
                  overScrollMode="never"
                  bouncesZoom
                >
                  <ExpoImage
                    source={{ uri: item.value }}
                    style={styles.viewerImage}
                    contentFit="contain"
                    cachePolicy="disk"
                    transition={200}
                    accessibilityLabel={tr('Documento imagen', 'Document image')}
                  />
                </ScrollView>
              </TouchableWithoutFeedback>
            ) : isPdfValue(item.value) ? (
              PdfComponent ? (
                <TouchableWithoutFeedback onLongPress={handleLongPress} delayLongPress={550}>
                  <View style={styles.viewerPdfWrapper}>
                    <PdfComponent
                      source={{ uri: item.value }}
                      style={styles.viewerPdf}
                      minScale={1}
                      maxScale={3}
                      trustAllCerts={false}
                    />
                  </View>
                </TouchableWithoutFeedback>
              ) : (
                <View style={styles.viewerFallback}>
                  <MaterialCommunityIcons name="file-pdf-box" color="#C5A065" size={54} />
                  <Text style={[styles.viewerFallbackText, { color: fallbackMutedColor }]}>
                    {tr(
                      'La previsualizacion PDF no esta disponible en Expo Go. Usa un development build para verla.',
                      'PDF preview is not available in Expo Go. Use a development build to view it.',
                    )}
                  </Text>
                </View>
              )
            ) : (
              <View style={styles.viewerFallback}>
                <MaterialCommunityIcons name="file-alert-outline" color="#C5A065" size={54} />
                <Text style={[styles.viewerFallbackText, { color: fallbackMutedColor }]}>
                  {tr('No se pudo previsualizar este archivo.', 'Could not preview this file.')}
                </Text>
              </View>
            )
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
