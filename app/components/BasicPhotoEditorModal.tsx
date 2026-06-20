/**
 * BasicPhotoEditorModal — editor unificado (rotar, espejo H/V, crop o revisión).
 * Modos: circle | square | rect | none (revisión + zoom).
 */

import LuxCtaButton from '@/components/LuxCtaButton';
import palette from '@/app/theme';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import type { BasicPhotoEditorMode } from '@/services/photoEditorPresets';
import { useCoreT } from '@/services/coreI18n';
import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';

export type { BasicPhotoEditorMode };

export type BasicPhotoEditorModalProps = {
  visible: boolean;
  uri: string;
  imageWidth: number;
  imageHeight: number;
  mode: BasicPhotoEditorMode;
  onConfirm: (editedUri: string) => void;
  onChooseAgain: () => void;
  onClose: () => void;
};

function getDistance(touches: { pageX: number; pageY: number }[]) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function cropWindowRadius(cropShape: BasicPhotoEditorMode['cropShape']): number {
  if (cropShape === 'circle') return 9999;
  return 14;
}

function computeCropWindow(
  cropShape: BasicPhotoEditorMode['cropShape'],
  screenW: number,
  screenH: number,
): { cropW: number; cropH: number } {
  const maxSquare = Math.min(screenW * 0.88, 360);
  if (cropShape === 'rect') {
    const cropW = Math.min(screenW * 0.88, 400);
    const cropH = Math.min(screenH * 0.42, cropW * 0.75, 320);
    return { cropW, cropH: Math.max(180, cropH) };
  }
  return { cropW: maxSquare, cropH: maxSquare };
}

export default function BasicPhotoEditorModal({
  visible,
  uri,
  imageWidth,
  imageHeight,
  mode,
  onConfirm,
  onChooseAgain,
  onClose,
}: BasicPhotoEditorModalProps) {
  const tcx = useCoreT();
  const modalFooterBottomPad = useModalFooterBottomPad();
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = palette[isNight ? 'dark' : 'light'];
  const { width: screenW, height: screenH } = useWindowDimensions();

  const previewH = screenH * 0.58;
  const { cropW, cropH } = useMemo(
    () => computeCropWindow(mode.cropShape, screenW, screenH),
    [mode.cropShape, screenW, screenH],
  );

  const [workingUri, setWorkingUri] = useState(uri);
  const [workingW, setWorkingW] = useState(Math.max(1, imageWidth));
  const [workingH, setWorkingH] = useState(Math.max(1, imageHeight));
  const [isExporting, setIsExporting] = useState(false);
  const [transformBusy, setTransformBusy] = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const panAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cropFadeAnim = useRef(new Animated.Value(0)).current;
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const pinchDistRef = useRef(0);
  const pinchScaleRef = useRef(1);
  const isPinching = useRef(false);
  const isReviewRef = useRef(mode.cropShape === 'none');

  const isReview = mode.cropShape === 'none';
  isReviewRef.current = isReview;

  const outputSize = mode.cropShape === 'square' || mode.cropShape === 'circle' ? (mode.outputSize ?? 512) : undefined;
  const outputMaxLongEdge = mode.cropShape === 'rect' ? (mode.outputMaxLongEdge ?? 2000) : undefined;

  const resetPanZoom = useCallback(() => {
    scaleAnim.setValue(1);
    panAnim.setValue({ x: 0, y: 0 });
    scaleRef.current = 1;
    txRef.current = 0;
    tyRef.current = 0;
  }, [panAnim, scaleAnim]);

  useEffect(() => {
    if (visible) {
      setWorkingUri(uri);
      setWorkingW(Math.max(1, imageWidth));
      setWorkingH(Math.max(1, imageHeight));
      resetPanZoom();
      cropFadeAnim.setValue(0);
      Animated.timing(cropFadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, uri, imageWidth, imageHeight, resetPanZoom, cropFadeAnim]);

  useEffect(() => {
    const sid = scaleAnim.addListener(({ value }) => {
      scaleRef.current = value;
    });
    const pid = panAnim.addListener(({ x, y }) => {
      txRef.current = x;
      tyRef.current = y;
    });
    return () => {
      scaleAnim.removeListener(sid);
      panAnim.removeListener(pid);
    };
  }, [panAnim, scaleAnim]);

  const coverRatio = Math.max(cropW / workingW, cropH / workingH);
  const displayW = workingW * coverRatio;
  const displayH = workingH * coverRatio;

  const applyTransform = useCallback(
    async (actions: ImageManipulator.Action[]) => {
      if (transformBusy || !workingUri) return;
      setTransformBusy(true);
      try {
        Haptics.selectionAsync();
        const result = await ImageManipulator.manipulateAsync(workingUri, actions, {
          compress: 0.95,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        setWorkingUri(result.uri);
        setWorkingW(result.width ?? workingW);
        setWorkingH(result.height ?? workingH);
        resetPanZoom();
      } catch (err) {
        console.error('[BasicPhotoEditorModal] transform error:', err);
      } finally {
        setTransformBusy(false);
      }
    },
    [resetPanZoom, transformBusy, workingH, workingUri, workingW],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isReviewRef.current,
        onMoveShouldSetPanResponder: () => !isReviewRef.current,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            isPinching.current = true;
            pinchDistRef.current = getDistance(touches as { pageX: number; pageY: number }[]);
            pinchScaleRef.current = scaleRef.current;
          }
          panAnim.setOffset({ x: txRef.current, y: tyRef.current });
          panAnim.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            isPinching.current = true;
            const dist = getDistance(touches as { pageX: number; pageY: number }[]);
            if (pinchDistRef.current > 0) {
              const newScale = Math.max(0.5, Math.min(6, pinchScaleRef.current * (dist / pinchDistRef.current)));
              scaleAnim.setValue(newScale);
            }
          } else if (!isPinching.current) {
            Animated.event([null, { dx: panAnim.x, dy: panAnim.y }], { useNativeDriver: false })(
              evt,
              gestureState,
            );
          }
        },
        onPanResponderRelease: () => {
          isPinching.current = false;
          pinchDistRef.current = 0;
          panAnim.flattenOffset();
        },
        onPanResponderTerminate: () => {
          isPinching.current = false;
          pinchDistRef.current = 0;
          panAnim.flattenOffset();
        },
      }),
    [panAnim, scaleAnim],
  );

  const handleConfirm = async () => {
    setIsExporting(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (isReview) {
        onConfirm(workingUri);
        return;
      }

      const s = scaleRef.current;
      const tx = txRef.current;
      const ty = tyRef.current;
      const imgTopLeftX = cropW / 2 + tx - (displayW * s) / 2;
      const imgTopLeftY = cropH / 2 + ty - (displayH * s) / 2;
      const pixelRatioX = workingW / (displayW * s);
      const pixelRatioY = workingH / (displayH * s);
      const originX = Math.max(0, Math.round(-imgTopLeftX * pixelRatioX));
      const originY = Math.max(0, Math.round(-imgTopLeftY * pixelRatioY));
      const cropPixelW = Math.min(Math.round(cropW * pixelRatioX), workingW - originX);
      const cropPixelH = Math.min(Math.round(cropH * pixelRatioY), workingH - originY);

      const actions: ImageManipulator.Action[] = [
        { crop: { originX, originY, width: cropPixelW, height: cropPixelH } },
      ];

      if (mode.cropShape === 'rect' && outputMaxLongEdge) {
        const longEdge = Math.max(cropPixelW, cropPixelH);
        if (longEdge > outputMaxLongEdge) {
          if (cropPixelW >= cropPixelH) {
            actions.push({ resize: { width: outputMaxLongEdge } });
          } else {
            actions.push({ resize: { height: outputMaxLongEdge } });
          }
        }
      } else if (outputSize) {
        actions.push({ resize: { width: outputSize, height: outputSize } });
      }

      const result = await ImageManipulator.manipulateAsync(workingUri, actions, {
        compress: 0.88,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      onConfirm(result.uri);
    } catch (err) {
      console.error('[BasicPhotoEditorModal] export error:', err);
      onConfirm(workingUri);
    } finally {
      setIsExporting(false);
    }
  };

  const title = isReview ? tcx('photo_editor_review_title') : tcx('photo_editor_crop_title');
  const hint = isReview ? tcx('photo_editor_review_hint') : tcx('photo_editor_crop_hint');
  const confirmLabel = isReview ? tcx('photo_editor_use_photo') : tcx('photo_editor_crop_confirm');
  const windowRadius = cropWindowRadius(mode.cropShape);
  const busy = isExporting || transformBusy;
  const closeBtnBg = isNight ? 'rgba(255,255,255,0.14)' : 'rgba(28,28,30,0.1)';

  const toolbar = useMemo(
    () => (
      <View style={styles.toolbar}>
        {(
          [
            { key: 'left', icon: 'rotate-left' as const, label: tcx('photo_editor_rotate_left'), action: () => applyTransform([{ rotate: -90 }]) },
            { key: 'right', icon: 'rotate-right' as const, label: tcx('photo_editor_rotate_right'), action: () => applyTransform([{ rotate: 90 }]) },
            { key: 'h', icon: 'flip-horizontal' as const, label: tcx('photo_editor_mirror_h'), action: () => applyTransform([{ flip: ImageManipulator.FlipType.Horizontal }]) },
            { key: 'v', icon: 'flip-vertical' as const, label: tcx('photo_editor_mirror_v'), action: () => applyTransform([{ flip: ImageManipulator.FlipType.Vertical }]) },
          ] as const
        ).map((tool) => (
          <TouchableOpacity
            key={tool.key}
            style={[styles.toolBtn, { backgroundColor: shell.surface, borderColor: shell.border }]}
            onPress={() => void tool.action()}
            disabled={busy}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name={tool.icon} size={18} color={shell.ctaAccent} />
            <Text style={[styles.toolBtnText, { color: shell.textSecondary }]} numberOfLines={1}>
              {tool.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    ),
    [applyTransform, busy, shell, tcx],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.overlay, { backgroundColor: shell.overlayScrim }]}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: shell.backgroundSolid, maxHeight: screenH * 0.94 }]}>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: closeBtnBg }]}
                onPress={onClose}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="close" color={shell.textPrimary} size={22} />
              </TouchableOpacity>

              <View style={[styles.previewArea, { backgroundColor: shell.surface, minHeight: previewH }]}>
                {toolbar}
                {isReview ? (
                  <ScrollView
                    style={[styles.reviewScroll, { width: screenW, maxHeight: previewH - 100 }]}
                    contentContainerStyle={styles.reviewScrollContent}
                    maximumZoomScale={6}
                    minimumZoomScale={0.5}
                    centerContent
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                  >
                    <Animated.Image
                      source={{ uri: workingUri }}
                      style={[
                        styles.reviewImage,
                        {
                          opacity: cropFadeAnim,
                          width: screenW - 48,
                          height: Math.min(previewH - 120, screenW * 0.72),
                        },
                      ]}
                      resizeMode="contain"
                    />
                  </ScrollView>
                ) : (
                  <Animated.View style={[styles.cropWrapper, { opacity: cropFadeAnim, width: cropW, height: cropH }]}>
                    <View
                      style={[
                        styles.cropWindow,
                        {
                          width: cropW,
                          height: cropH,
                          borderColor: shell.ctaAccent,
                          borderRadius: mode.cropShape === 'circle' ? cropW / 2 : windowRadius,
                        },
                      ]}
                      {...panResponder.panHandlers}
                    >
                      <Animated.Image
                        source={{ uri: workingUri }}
                        style={{
                          width: displayW,
                          height: displayH,
                          transform: [{ scale: scaleAnim }, { translateX: panAnim.x }, { translateY: panAnim.y }],
                        }}
                        resizeMode="cover"
                      />
                    </View>
                  </Animated.View>
                )}
              </View>

              <View
                style={[
                  styles.bottomCard,
                  {
                    backgroundColor: shell.modalBg,
                    borderTopColor: shell.border,
                    paddingBottom: Math.max(Platform.OS === 'ios' ? 36 : 24, modalFooterBottomPad),
                  },
                ]}
              >
                <Text style={[styles.confirmTitle, { color: shell.textPrimary }]}>{title}</Text>
                <Text style={[styles.confirmSubtitle, { color: shell.textSecondary }]}>{hint}</Text>
                <View style={styles.actionsRow}>
                  <LuxCtaButton
                    label={tcx('photo_editor_choose_again')}
                    variant="outline"
                    onPress={onChooseAgain}
                    disabled={busy}
                    style={styles.actionBtn}
                  />
                  <LuxCtaButton
                    label={confirmLabel}
                    variant="primary"
                    icon="check-circle"
                    onPress={() => void handleConfirm()}
                    disabled={busy}
                    loading={busy}
                    style={styles.actionBtn}
                  />
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 14 : 10,
    right: 16,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingBottom: 12,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    width: '100%',
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: '48%',
  },
  toolBtnText: {
    fontSize: 10,
    fontWeight: '600',
    flexShrink: 1,
  },
  cropWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropWindow: {
    overflow: 'hidden',
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewScroll: {
    flex: 1,
  },
  reviewScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  reviewImage: {},
  bottomCard: {
    borderTopWidth: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
    gap: 4,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  confirmSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 17,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    minHeight: 48,
  },
});
