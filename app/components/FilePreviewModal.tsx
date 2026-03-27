import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dimensions,
    Image,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';

  // ── Theme tokens ────────────────────────────────────────
  const theme = {
    overlayBg:       isNight ? '#0A1A2F'                   : '#EAF7FF',
    previewAreaBg:   isNight ? '#0A1A2F'                   : '#D0EBF5',
    bottomCardBg:    isNight ? '#0A1A2F'                   : '#FFFFFF',
    bottomCardBorder:isNight ? 'rgba(212,175,55,0.22)'     : 'rgba(0,150,200,0.18)',
    closeBtnBg:      isNight ? 'rgba(255,255,255,0.18)'    : 'rgba(0,45,75,0.14)',
    closeIconColor:  isNight ? '#FFFFFF'                   : '#002D4B',
    pdfFileNameColor:isNight ? '#FFFFFF'                   : '#002D4B',
    pdfSnippetBg:    isNight ? 'rgba(255,255,255,0.08)'    : 'rgba(0,45,75,0.07)',
    pdfSnippetText:  isNight ? 'rgba(255,255,255,0.55)'    : 'rgba(0,45,75,0.55)',
    pdfSnippetDash:  isNight ? 'rgba(255,255,255,0.12)'    : 'rgba(0,45,75,0.12)',
    titleColor:      isNight ? '#FFFFFF'                   : '#002D4B',
    subtitleColor:   isNight ? 'rgba(255,255,255,0.50)'    : 'rgba(0,45,75,0.50)',
    ghostBorder:     isNight ? 'rgba(255,255,255,0.30)'    : 'rgba(0,45,75,0.30)',
    ghostText:       isNight ? '#FFFFFF'                   : '#002D4B',
  };

  const isPdf =
    asset?.mimeType?.includes('pdf') ||
    asset?.uri?.toLowerCase().endsWith('.pdf') ||
    false;

  const fileName = asset?.name || 'Archivo';

  const handleAccept = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      <View style={[styles.overlay, { backgroundColor: theme.overlayBg }]}>
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
          {isPdf ? (
            /* PDF visual — icon + filename */
            <View style={styles.pdfContainer}>
              <MaterialCommunityIcons
                name="file-pdf-box"
                color="#D4AF37"
                size={96}
              />
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
          ) : (
            /* Image preview */
            <Image
              source={{ uri: asset?.uri || '' }}
              style={styles.imagePreview}
              resizeMode="cover"
            />
          )}
        </View>

        {/* ── Bottom card ──────────────────────────────────── */}
        <View style={[
          styles.bottomCard,
          { backgroundColor: theme.bottomCardBg, borderTopColor: theme.bottomCardBorder },
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
              style={styles.acceptBtn}
              onPress={handleAccept}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="shield-check"
                color="#0A1A2F"
                size={18}
              />
              <Text style={styles.acceptBtnText}>{t('preview_accept')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default FilePreviewModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
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
  imagePreview: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.62,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
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
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  acceptBtnText: {
    color: '#0A1A2F',
    fontSize: 14,
    fontWeight: '800',
  },
});
