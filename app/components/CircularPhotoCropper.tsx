/**
 * CircularPhotoCropper
 * ─────────────────────────────────────────────────────
 * Full-screen modal that lets the user pan + pinch-zoom
 * a raw photo into a circular crop window before it gets
 * uploaded as their profile picture.
 *
 * Props
 *  visible      – show/hide the modal
 *  uri          – raw photo URI (from ImagePicker, no editing)
 *  imageWidth   – original pixel width  (from ImagePicker result)
 *  imageHeight  – original pixel height (from ImagePicker result)
 *  onConfirm    – called with the cropped+resized square URI
 *  onChooseAgain– called when user wants to pick/take again
 *  onClose      – called on X-button press
 */

import { AuthSpinnerWell } from '@/components/AuthSpinnerWell';
import ActivityIndicator from '@/components/BrandedSpinner';
import { AUTH_GOLD } from '@/constants/authPremiumLook';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

// The circle crop window size — 80% of screen width, max 320
const CROP_SIZE = Math.min(SW * 0.82, 320);

// ─── Helpers ────────────────────────────────────────────
function getDistance(touches: { pageX: number; pageY: number }[]) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Component ──────────────────────────────────────────
interface CircularPhotoCropperProps {
  visible: boolean;
  uri: string;
  imageWidth: number;
  imageHeight: number;
  onConfirm: (croppedUri: string) => void;
  onChooseAgain: () => void;
  onClose: () => void;
}

const CircularPhotoCropper: React.FC<CircularPhotoCropperProps> = ({
  visible,
  uri,
  imageWidth,
  imageHeight,
  onConfirm,
  onChooseAgain,
  onClose,
}) => {
  const { t } = useTranslation();
  const modalFooterBottomPad = useModalFooterBottomPad();
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';

  // ── Theme ────────────────────────────────────────────
  const theme = {
    overlayBg:     isNight ? '#050505'                : '#F2F2F7',
    overlayDim:    isNight ? 'rgba(0,0,0,0.82)'      : 'rgba(0,0,0,0.5)',
    titleColor:    isNight ? '#FFFFFF'                : '#1C1C1E',
    hintColor:     isNight ? 'rgba(255,255,255,0.45)' : 'rgba(28,28,30,0.55)',
    cardBg:        isNight ? '#141414'                : '#FFFFFF',
    cardBorder:    isNight ? 'rgba(233,195,73,0.22)' : 'rgba(233,195,73,0.18)',
    ghostBorder:   isNight ? 'rgba(255,255,255,0.30)' : 'rgba(28,28,30,0.22)',
    ghostText:     isNight ? '#FFFFFF'                : '#1C1C1E',
    ringColor:     '#E9C349',
    closeBtnBg:    isNight ? 'rgba(255,255,255,0.14)' : 'rgba(28,28,30,0.08)',
    closeIconColor:isNight ? '#FFFFFF'                : '#1C1C1E',
  };

  // ── Animated state ───────────────────────────────────
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const panAnim    = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // Mutable refs so we can read values synchronously for crop calc
  const scaleRef   = useRef(1);
  const txRef      = useRef(0);
  const tyRef      = useRef(0);

  // Pinch tracking
  const pinchDistRef  = useRef(0);
  const pinchScaleRef = useRef(1);
  const isPinching    = useRef(false);

  const [isCropping, setIsCropping] = useState(false);

  // ── Computed display dimensions (cover at scale=1) ──
  const coverRatio  = Math.max(CROP_SIZE / imageWidth, CROP_SIZE / imageHeight);
  const displayW    = imageWidth  * coverRatio;
  const displayH    = imageHeight * coverRatio;

  // ── Reset when modal opens ────────────────────────────
  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(1);
      panAnim.setValue({ x: 0, y: 0 });
      scaleRef.current  = 1;
      txRef.current     = 0;
      tyRef.current     = 0;
    }
  }, [visible]);

  // Keep refs in sync
  useEffect(() => {
    const sid = scaleAnim.addListener(({ value }) => { scaleRef.current = value; });
    const pid = panAnim.addListener(({ x, y }) => { txRef.current = x; tyRef.current = y; });
    return () => {
      scaleAnim.removeListener(sid);
      panAnim.removeListener(pid);
    };
  }, []);

  // ── PanResponder ─────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          isPinching.current    = true;
          pinchDistRef.current  = getDistance(touches as any);
          pinchScaleRef.current = scaleRef.current;
        }
        panAnim.setOffset({ x: txRef.current, y: tyRef.current });
        panAnim.setValue({ x: 0, y: 0 });
      },

      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          isPinching.current = true;
          const dist = getDistance(touches as any);
          if (pinchDistRef.current > 0) {
            const newScale = Math.max(
              0.8,
              Math.min(6, pinchScaleRef.current * (dist / pinchDistRef.current))
            );
            scaleAnim.setValue(newScale);
          }
        } else if (!isPinching.current) {
          Animated.event(
            [null, { dx: panAnim.x, dy: panAnim.y }],
            { useNativeDriver: false }
          )(evt, gestureState);
        }
      },

      onPanResponderRelease: () => {
        isPinching.current   = false;
        pinchDistRef.current = 0;
        panAnim.flattenOffset();
      },

      onPanResponderTerminate: () => {
        isPinching.current   = false;
        pinchDistRef.current = 0;
        panAnim.flattenOffset();
      },
    })
  ).current;

  // ── Confirm: compute crop rect + manipulate ──────────
  const handleConfirm = async () => {
    setIsCropping(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const s  = scaleRef.current;
      const tx = txRef.current;
      const ty = tyRef.current;

      // The image is centered in the crop container.
      // At scale s and translate (tx, ty):
      //   image top-left on screen = (CROP_SIZE/2 + tx - displayW*s/2,
      //                               CROP_SIZE/2 + ty - displayH*s/2)
      //
      // The crop window top-left = (0, 0) in the crop container.
      // Converting to original image pixels:

      const imgTopLeftX = CROP_SIZE / 2 + tx - (displayW * s) / 2;
      const imgTopLeftY = CROP_SIZE / 2 + ty - (displayH * s) / 2;

      const pixelRatioX = imageWidth  / (displayW * s);
      const pixelRatioY = imageHeight / (displayH * s);

      const originX = Math.max(0, Math.round(-imgTopLeftX * pixelRatioX));
      const originY = Math.max(0, Math.round(-imgTopLeftY * pixelRatioY));

      const cropPixelW = Math.min(
        Math.round(CROP_SIZE * pixelRatioX),
        imageWidth  - originX
      );
      const cropPixelH = Math.min(
        Math.round(CROP_SIZE * pixelRatioY),
        imageHeight - originY
      );

      const result = await ImageManipulator.manipulateAsync(
        uri,
        [
          { crop: { originX, originY, width: cropPixelW, height: cropPixelH } },
          { resize: { width: 512, height: 512 } },
        ],
        { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG }
      );

      onConfirm(result.uri);
    } catch (err) {
      console.error('CircularPhotoCropper crop error:', err);
      // Fallback: pass the original URI
      onConfirm(uri);
    } finally {
      setIsCropping(false);
    }
  };

  // ── Render ───────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: theme.overlayBg }]}>
        {/* ── X close ──────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: theme.closeBtnBg }]}
          onPress={onClose}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons name="close" color={theme.closeIconColor} size={24} />
        </TouchableOpacity>

        {/* ── Title ────────────────────────────────────── */}
        <Text style={[styles.title, { color: theme.titleColor }]}>
          {t('crop_title')}
        </Text>
        <Text style={[styles.hint, { color: theme.hintColor }]}>
          {t('crop_hint')}
        </Text>

        {/* ── Crop circle ──────────────────────────────── */}
        <View style={styles.cropWrapper}>
          {/* Dark overlay surrounds the circle  */}
          <View style={[styles.dimOverlay, { backgroundColor: theme.overlayDim }]} pointerEvents="none" />

          {/* The circular clip window */}
          <View
            style={[
              styles.cropCircle,
              { borderColor: theme.ringColor },
            ]}
            {...panResponder.panHandlers}
          >
            <Animated.Image
              source={{ uri }}
              style={[
                styles.cropImage,
                {
                  width:  displayW,
                  height: displayH,
                  transform: [
                    { scale: scaleAnim },
                    { translateX: panAnim.x },
                    { translateY: panAnim.y },
                  ],
                },
              ]}
              resizeMode="cover"
            />
          </View>
        </View>

        {/* ── Bottom card ──────────────────────────────── */}
        <View
          style={[
            styles.bottomCard,
            {
              backgroundColor: theme.cardBg,
              borderTopColor: theme.cardBorder,
              paddingBottom: Math.max(Platform.OS === 'ios' ? 40 : 28, modalFooterBottomPad),
            },
          ]}
        >
          <View style={styles.actionsRow}>
            {/* Ghost: choose again */}
            <TouchableOpacity
              style={[styles.ghostBtn, { borderColor: theme.ghostBorder }]}
              onPress={onChooseAgain}
              activeOpacity={0.8}
              disabled={isCropping}
            >
              <Text style={[styles.ghostBtnText, { color: theme.ghostText }]}>
                {t('preview_choose_again')}
              </Text>
            </TouchableOpacity>

            {/* Gold: confirm */}
            <TouchableOpacity
              style={[styles.acceptBtn, isCropping && styles.acceptBtnDisabled]}
              onPress={handleConfirm}
              activeOpacity={0.85}
              disabled={isCropping}
            >
              {isCropping ? (
                <AuthSpinnerWell wellBg="#FFFFFF" wellBorder={`${AUTH_GOLD}44`} preset="cropperCta">
                  <ActivityIndicator color={AUTH_GOLD} size="small" />
                </AuthSpinnerWell>
              ) : (
                <>
                  <MaterialCommunityIcons name="check-circle" color="#0A1A2F" size={18} />
                  <Text style={styles.acceptBtnText}>{t('crop_confirm')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default CircularPhotoCropper;

// ─── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    right: 20,
    zIndex: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 32,
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  },

  // ── Crop area ─────────────────────────────────────────
  cropWrapper: {
    width: CROP_SIZE,
    height: CROP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CROP_SIZE / 2,
    zIndex: 0,
  },
  cropCircle: {
    width: CROP_SIZE,
    height: CROP_SIZE,
    borderRadius: CROP_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cropImage: {
    // width/height set dynamically in render
  },

  // ── Bottom card ───────────────────────────────────────
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    paddingHorizontal: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
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
    backgroundColor: '#E9C349',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowColor: '#E9C349',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  acceptBtnDisabled: {
    opacity: 0.65,
  },
  acceptBtnText: {
    color: '#0C0C0C',
    fontSize: 14,
    fontWeight: '800',
  },
});
