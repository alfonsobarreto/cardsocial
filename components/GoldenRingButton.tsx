import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Animated, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MaterialCommunityIcons as MCIType } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof MCIType>['name'];

interface GoldenRingButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * Componente botón con animación de anillo dorado giratorio
 * Ideal para Call to Action de compras/upgrades
 */
const GoldenRingButton: React.FC<GoldenRingButtonProps> = ({
  label,
  onPress,
  icon = 'crown',
  style,
  disabled = false,
  loading = false,
}) => {
  const spinValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.3)).current;

  // Animación de rotación continua del anillo
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(spinValue, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Animación de glow (pulso suave)
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.8,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handlePress = () => {
    if (!disabled && !loading) {
      // Animación de escala al presionar
      Animated.sequence([
        Animated.timing(scaleValue, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleValue, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();

      onPress();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.buttonContainer, style]}
    >
      {/* Outer Golden Ring - Animación de rotación */}
      <Animated.View
        style={[
          styles.outerRing,
          {
            transform: [{ rotate: spin }],
            opacity: disabled ? 0.5 : glowOpacity,
          },
        ]}
      />

      {/* Middle Glow Layer */}
      <Animated.View
        style={[
          styles.glowLayer,
          {
            opacity: disabled ? 0.3 : glowOpacity,
            transform: [{ scale: scaleValue }],
          },
        ]}
      />

      {/* Button Core */}
      <Animated.View
        style={[
          styles.buttonCore,
          {
            transform: [{ scale: scaleValue }],
          },
        ]}
      >
        <View style={styles.buttonContent}>
          {loading ? (
            <MaterialCommunityIcons name="loading" size={20} color="#FFF" />
          ) : (
            <MaterialCommunityIcons name={icon} size={20} color="#FFF" />
          )}
          <Text style={styles.buttonLabel}>{label}</Text>
        </View>
      </Animated.View>

      {/* Decorative Inner Ring */}
      <Animated.View
        style={[
          styles.innerRing,
          {
            transform: [{ rotate: spin }],
            opacity: disabled ? 0.3 : 0.6,
          },
        ]}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },

  // Outer golden rotating ring
  outerRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#C5A065',
    borderStyle: 'solid',
  },

  // Glow effect
  glowLayer: {
    position: 'absolute',
    width: '95%',
    height: '95%',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E8C547',
    backgroundColor: 'rgba(197, 160, 101, 0.1)',
  },

  // Main button with gradient
  buttonCore: {
    width: '90%',
    height: '90%',
    borderRadius: 24,
    backgroundColor: '#0A2540',
    borderWidth: 2,
    borderColor: '#C5A065',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#C5A065',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },

  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  buttonLabel: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Inner decorative rotating ring
  innerRing: {
    position: 'absolute',
    width: '85%',
    height: '85%',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#C5A065',
    borderStyle: 'dashed',
  },
});

export default GoldenRingButton;
