/**
 * Confetti Animation Component
 * Efecto visual de confeti dorado al recibir Welcome Bonus
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';

interface ConfettiPiece {
  id: number;
  left: Animated.Value;
  top: Animated.Value;
  rotation: Animated.Value;
  opacity: Animated.Value;
}

export interface ConfettiAnimationRef {
  trigger: () => void;
}

const CONFETTI_COUNT = 40;
const ANIMATION_DURATION = 3000;

export const ConfettiAnimation = React.forwardRef<ConfettiAnimationRef>((_, ref) => {
  const [confetti, setConfetti] = React.useState<ConfettiPiece[]>([]);

  const createConfettiPieces = () => {
    const pieces: ConfettiPiece[] = [];

    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const startX = Math.random() * Dimensions.get('window').width;
      const startY = -50;
      const endY = Dimensions.get('window').height + 100;
      const endX = startX + (Math.random() - 0.5) * 400;
      const rotation = Math.random() * 720;

      const piece: ConfettiPiece = {
        id: i,
        left: new Animated.Value(startX),
        top: new Animated.Value(startY),
        rotation: new Animated.Value(0),
        opacity: new Animated.Value(1),
      };

      pieces.push(piece);

      // Animar cada pieza
      Animated.parallel([
        Animated.timing(piece.top, {
          toValue: endY,
          duration: ANIMATION_DURATION + Math.random() * 1000,
          useNativeDriver: false,
        }),
        Animated.timing(piece.left, {
          toValue: endX,
          duration: ANIMATION_DURATION + Math.random() * 1000,
          useNativeDriver: false,
        }),
        Animated.timing(piece.rotation, {
          toValue: rotation,
          duration: ANIMATION_DURATION + Math.random() * 1000,
          useNativeDriver: false,
        }),
        Animated.timing(piece.opacity, {
          toValue: 0,
          duration: ANIMATION_DURATION + Math.random() * 1000,
          useNativeDriver: false,
          delay: 500,
        }),
      ]).start();
    }

    setConfetti(pieces);
  };

  React.useImperativeHandle(ref, () => ({
    trigger: () => {
      createConfettiPieces();
    },
  }));

  return (
    <View style={styles.container} pointerEvents="none">
      {confetti.map((piece) => (
        <Animated.View
          key={piece.id}
          style={[
            styles.confettiPiece,
            {
              left: piece.left,
              top: piece.top,
              opacity: piece.opacity,
              transform: [
                { rotate: piece.rotation.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                  }) 
                },
              ],
            },
          ]}
        >
          <View style={styles.goldConfetti} />
        </Animated.View>
      ))}
    </View>
  );
});

ConfettiAnimation.displayName = 'ConfettiAnimation';

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  confettiPiece: {
    position: 'absolute',
    width: 10,
    height: 10,
  },
  goldConfetti: {
    width: '100%',
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#C5A065', // Dorado soft
  },
});
