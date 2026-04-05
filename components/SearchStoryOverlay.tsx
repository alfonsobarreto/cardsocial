/**
 * Visor flotante de historia / oferta activa desde Search (Fase 2).
 * Swipe izquierda o cerrar: vuelve al listado (scroll restaurado por el padre).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type SearchStoryOverlayProps = {
  visible: boolean;
  onRequestClose: () => void;
  isDark: boolean;
  /** Nombre visible del emisor */
  title: string;
  subtitle: string;
  storyState: 'none' | 'normal' | 'vip';
  /** Negocio del mercado vs contacto recibido */
  variant: 'received' | 'market';
  tr: (es: string, en: string) => string;
};

const AUTO_DISMISS_MS = 28_000;

export function SearchStoryOverlay({
  visible,
  onRequestClose,
  isDark,
  title,
  subtitle,
  storyState,
  variant,
  tr,
}: SearchStoryOverlayProps) {
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e: GestureResponderEvent, g: PanResponderGestureState) =>
          Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1,
        onPanResponderRelease: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          if (g.dx < -56) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onRequestClose();
          }
        },
      }),
    [onRequestClose]
  );

  useEffect(() => {
    if (!visible) {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      return;
    }
    dismissTimerRef.current = setTimeout(() => {
      onRequestClose();
    }, AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [visible, onRequestClose]);

  const badgeLabel =
    storyState === 'vip'
      ? tr('Historia u oferta VIP', 'VIP story or offer')
      : storyState === 'normal'
        ? tr('Historia u oferta activa', 'Active story or offer')
        : tr('Actividad', 'Activity');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.root} {...pan.panHandlers}>
        <BlurView intensity={55} tint={isDark ? 'dark' : 'dark'} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['#000000', '#0a0a0c', '#151018']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} accessibilityRole="button" />

        <View style={styles.sheet} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.closeBtn, { borderColor: 'rgba(197,160,101,0.85)', backgroundColor: 'rgba(0,0,0,0.55)' }]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onRequestClose();
            }}
            accessibilityLabel={tr('Cerrar', 'Close')}
          >
            <MaterialCommunityIcons name="close" size={22} color="rgba(212,175,55,0.95)" />
          </TouchableOpacity>

          <View style={[styles.badge, { borderColor: 'rgba(212,175,55,0.5)' }]}>
            <MaterialCommunityIcons
              name={storyState === 'vip' ? 'star-circle' : 'play-circle-outline'}
              size={18}
              color="rgba(212,175,55,0.95)"
            />
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>

          <Text style={[styles.title, { textShadowColor: 'rgba(0,0,0,0.75)' }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>

          <Text style={styles.hint}>
            {variant === 'market'
              ? tr(
                  'Desliza a la izquierda o toca fuera para volver a tu búsqueda.',
                  'Swipe left or tap outside to return to search.',
                )
              : tr(
                  'El carrusel completo está en la pestaña Stories. Desliza a la izquierda para cerrar.',
                  'Full carousel lives in the Stories tab. Swipe left to close.',
                )}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(197,160,101,0.35)',
    backgroundColor: 'rgba(8,8,10,0.92)',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    marginTop: 8,
  },
  badgeText: {
    color: 'rgba(245,240,230,0.92)',
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    color: '#F5F0E6',
    fontSize: 22,
    fontWeight: '800',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitle: {
    marginTop: 8,
    color: 'rgba(245,240,230,0.65)',
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    marginTop: 22,
    color: 'rgba(197,160,101,0.85)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
});
