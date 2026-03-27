/**
 * SwipeHint — first-time animated overlay showing swipe-left gesture on card rows.
 * Shows once per user, then hides permanently (AsyncStorage flag).
 *
 * Usage: <SwipeHint storageKey="cards_swipe_hint" direction="left" />
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

type SwipeHintProps = {
  storageKey?: string;
  direction?: 'left' | 'right';
  message?: string;
  onDismiss?: () => void;
};

export function SwipeHint({
  storageKey = 'swipe_hint_seen',
  direction = 'left',
  message,
  onDismiss,
}: SwipeHintProps) {
  const [visible, setVisible] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = await AsyncStorage.getItem(storageKey);
      if (seen || cancelled) return;
      setVisible(true);

      // Fade in
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();

      // Animated swipe gesture loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(translateX, {
            toValue: direction === 'left' ? -60 : 60,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.delay(600),
        ]),
      ).start();
    })();
    return () => { cancelled = true; };
  }, [storageKey, direction, opacity, translateX]);

  const dismiss = async () => {
    await AsyncStorage.setItem(storageKey, '1');
    Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setVisible(false);
      onDismiss?.();
    });
  };

  if (!visible) return null;

  const defaultMsg =
    direction === 'left'
      ? 'Desliza a la izquierda para ver acciones'
      : 'Desliza a la derecha para ver acciones';

  return (
    <Animated.View style={[styles.overlay, { opacity }]}>
      <View style={styles.content}>
        <Animated.View style={{ transform: [{ translateX }] }}>
          <MaterialCommunityIcons
            name={direction === 'left' ? 'gesture-swipe-left' : 'gesture-swipe-right'}
            size={48}
            color="#FFFFFF"
          />
        </Animated.View>
        <Text style={styles.message}>{message || defaultMsg}</Text>
        <TouchableOpacity style={styles.gotIt} onPress={dismiss} activeOpacity={0.8}>
          <Text style={styles.gotItText}>Entendido</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  content: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  gotIt: {
    backgroundColor: '#C5A065',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 10,
    marginTop: 8,
  },
  gotItText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
