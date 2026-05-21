import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { presentDetectedQrFromT, scanQrFromImageUri } from '@/services/vaultImageQrScan';
import { useLookMode } from '@/services/lookMode';
import palette from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

let PdfComponent: any = null;
try {
  PdfComponent = require('react-native-pdf').default;
} catch {
  PdfComponent = null;
}

export type PendingAsset = {
  uri: string;
  name: string;
  mimeType: string;
  source: 'camera' | 'gallery' | 'document';
};

interface FilePreviewModalProps {
  visible: boolean;
  asset: PendingAsset | null;
  onAccept: () => void;
  onChooseAgain: () => void;
  onClose: () => void;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  visible,
  asset,
  onAccept,
  onChooseAgain,
  onClose,
}) => {
  const { t } = useTranslation();
  const [qrAnalyzing, setQrAnalyzing] = useState(false);
  const qrGenRef = useRef(0);
  const modalFooterBottomPad = useModalFooterBottomPad();
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = palette[isNight ? 'dark' : 'light'];

  const theme = {
    overlayBg: shell.backgroundSolid,
    previewAreaBg: shell.surface,
    bottomCardBg: shell.modalBg,
    bottomCardBorder: shell.border,
    closeBtnBg: isNight ? 'rgba(255,255,255,0.14)' : 'rgba(28,28,30,0.1)',
    closeIconColor: shell.textPrimary,
    pdfFileNameColor: shell.textPrimary,
    pdfSnippetBg: shell.gridCardBg,
    pdfSnippetText: shell.textSecondary,
    pdfSnippetDash: shell.divider,
    titleColor: shell.textPrimary,
    subtitleColor: shell.textSecondary,
    ghostBorder: shell.border,
    ghostText: shell.textPrimary,
    acceptIconColor: shell.emptyCtaText,
    accentPdfIcon: shell.ctaAccent,
  };

  const isPdf =
    asset?.mimeType?.includes('pdf') ||
    asset?.uri?.toLowerCase().endsWith('.pdf') ||
    false;

  const fileName = asset?.name || 'Archivo';
  const hasAssetUri = Boolean(asset?.uri);

  useEffect(() => {
    if (!visible) {
      setQrAnalyzing(false);
      qrGenRef.current += 1;
    }
  }, [visible]);

  const handleLongPressImageQr = useCallback(async () => {
    if (!asset?.uri || isPdf) {
      return;
    }
    const uri = asset.uri;
    const session = ++qrGenRef.current;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      /* web / sin hápticos */
    }
    setQrAnalyzing(true);
    try {
      const payload = await scanQrFromImageUri(uri);
      if (session !== qrGenRef.current) {
        return;
      }
      if (payload) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          /* noop */
        }
        presentDetectedQrFromT(payload, t, () => {
          Toast.show({
            type: 'success',
            text1: t('preview_copied'),
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
          text1: t('preview_qr_none_title'),
          text2: t('preview_qr_none_body'),
          position: 'bottom',
          visibilityTime: 2200,
          autoHide: true,
        });
      }
    } catch {
      if (session === qrGenRef.current) {
        Toast.show({
          type: 'info',
          text1: t('preview_qr_none_title'),
          text2: t('preview_qr_analyze_error'),
          position: 'bottom',
          visibilityTime: 2200,
          autoHide: true,
        });
      }
    } finally {
      if (session === qrGenRef.current) {
        setQrAnalyzing(false);
      }
    }
  }, [asset?.uri, isPdf, t]);

  const handleAccept = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onAccept();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.overlay, { backgroundColor: theme.overlayBg }]}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.contentWrap}>
              {/* ── X close ─────────────────────────────────────── */}
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: theme.closeBtnBg }]}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.75}
              >
                <MaterialCommunityIcons name="close" color={theme.closeIconColor} size={26} />
              </TouchableOpacity>

              {/* ── Preview area ─────────────────────────────────── */}
              <View style={[styles.previewArea, { backgroundColor: theme.previewAreaBg }]}>
                {qrAnalyzing ? (
                  <View style={styles.qrScanOverlay} pointerEvents="auto">
                    <ActivityIndicator size="large" color={shell.ctaAccent} />
                    <Text style={styles.qrScanLabel}>{t('preview_qr_analyzing')}</Text>
                  </View>
                ) : null}
                {isPdf ? (
                  hasAssetUri && PdfComponent ? (
                    <View style={styles.pdfPreviewWrap}>
                      <PdfComponent
                        source={{ uri: asset!.uri }}
                        style={styles.pdfPreview}
                        minScale={1}
                        maxScale={3}
                        trustAllCerts={false}
                      />
                    </View>
                  ) : (
                    <View style={styles.pdfContainer}>
                      <MaterialCommunityIcons name="file-pdf-box" color={theme.accentPdfIcon} size={96} />
                      <Text style={[styles.pdfFileName, { color: theme.pdfFileNameColor }]} numberOfLines={3}>
                        {fileName}
                      </Text>
                      <View style={[styles.pdfSnippet, { backgroundColor: theme.pdfSnippetBg }]}>
                        <Text style={[styles.pdfSnippetLine, { color: theme.pdfSnippetText }]}>
                          {fileName.replace('.pdf', '')} — {t('preview_pdf_ready')}
                        </Text>
                        <View style={[styles.pdfSnippetDash, { backgroundColor: theme.pdfSnippetDash }]} />
                        <View style={[styles.pdfSnippetDash, { backgroundColor: theme.pdfSnippetDash }]} />
                      </View>
                    </View>
                  )
                ) : (
                  /* Image preview with zoom */
                  hasAssetUri ? (
                    <TouchableWithoutFeedback onLongPress={() => void handleLongPressImageQr()} delayLongPress={1800}>
                      <ScrollView
                        style={styles.imageScroll}
                        contentContainerStyle={styles.imageScrollContent}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        scrollEventThrottle={16}
                        maximumZoomScale={6}
                        minimumZoomScale={1}
                        bounces={false}
                        bouncesZoom
                        overScrollMode="never"
                        centerContent
                      >
                        <Image
                          source={{ uri: asset!.uri }}
                          style={styles.imagePreview}
                          resizeMode="cover"
                        />
                      </ScrollView>
                    </TouchableWithoutFeedback>
                  ) : (
                    <View style={styles.pdfContainer}>
                      <MaterialCommunityIcons name="file-alert-outline" color={theme.accentPdfIcon} size={88} />
                      <Text style={[styles.pdfFileName, { color: theme.pdfFileNameColor }]}>
                        {t('preview_file_not_available')}
                      </Text>
                    </View>
                  )
                )}
              </View>

              {/* ── Bottom card ──────────────────────────────────── */}
              <View style={[
                styles.bottomCard,
                {
                  backgroundColor: theme.bottomCardBg,
                  borderTopColor: theme.bottomCardBorder,
                  paddingBottom: Math.max(Platform.OS === 'ios' ? 42 : 28, modalFooterBottomPad),
                },
              ]}>
                <Text style={[styles.confirmTitle, { color: theme.titleColor }]}>
                  {isPdf ? fileName : t('preview_confirm_title_image')}
                </Text>
                <Text style={[styles.confirmSubtitle, { color: theme.subtitleColor }]}>
                  {t('preview_confirm_subtitle')}
                </Text>

                <View style={styles.actionsRow}>
                  {/* Ghost button */}
                  <TouchableOpacity
                    style={[styles.ghostBtn, { borderColor: theme.ghostBorder }]}
                    onPress={onChooseAgain}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.ghostBtnText, { color: theme.ghostText }]}>
                      {t('preview_choose_again')}
                    </Text>
                  </TouchableOpacity>

                  {/* Gold accept button */}
                  <TouchableOpacity
                    style={[styles.acceptBtn, { backgroundColor: shell.ctaAccent, shadowColor: shell.ctaAccent }]}
                    onPress={handleAccept}
                    activeOpacity={0.85}
                    disabled={!hasAssetUri}
                  >
                    <MaterialCommunityIcons name="shield-check" color={theme.acceptIconColor} size={18} />
                    <Text style={[styles.acceptBtnText, { color: shell.emptyCtaText }]}>{t('preview_accept')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default FilePreviewModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  contentWrap: {
    flex: 1,
  },

  // ── Close button ──────────────────────────────────────────
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    right: 20,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Preview area — 62% of screen ─────────────────────────
  previewArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.62,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrScanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
    gap: 12,
  },
  qrScanLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  imagePreview: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.62,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  imageScroll: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.62,
  },
  imageScrollContent: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.62,
  },
  pdfContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  pdfFileName: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  pdfSnippet: {
    marginTop: 16,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: SCREEN_WIDTH * 0.72,
    gap: 8,
  },
  pdfSnippetLine: {
    fontSize: 11,
    fontWeight: '500',
  },
  pdfSnippetDash: {
    height: 2,
    borderRadius: 1,
  },
  pdfPreviewWrap: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.62,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: 'hidden',
  },
  pdfPreview: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.62,
  },

  // ── Bottom card ───────────────────────────────────────────
  bottomCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 42 : 28,
    paddingHorizontal: 24,
    marginTop: SCREEN_HEIGHT * 0.62 - 24,
    gap: 6,
    borderTopWidth: 1,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  confirmSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  ghostBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  acceptBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  acceptBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
