import palette from '@/app/theme';
import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MaterialCommunityIcons as MCIType } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type IconName = React.ComponentProps<typeof MCIType>['name'];

export type LuxCtaButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

/**
 * CTA minimalista sin animaciones continuas (sustituye patrones tipo “golden ring” en vitrina premium).
 */
const LuxCtaButton: React.FC<LuxCtaButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  style,
}) => {
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const isOutline = variant === 'outline';
  const busy = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.88}
      style={[
        styles.base,
        isOutline
          ? {
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              borderColor: shell.ctaAccent,
            }
          : {
              backgroundColor: shell.ctaAccent,
              borderWidth: 0,
            },
        busy && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? shell.ctaAccent : shell.emptyCtaText} />
      ) : (
        <>
          {icon ? (
            <MaterialCommunityIcons
              name={icon}
              size={20}
              color={isOutline ? shell.ctaAccent : shell.emptyCtaText}
              style={styles.icon}
            />
          ) : null}
          <Text
            style={[
              styles.label,
              { color: isOutline ? shell.ctaAccent : shell.emptyCtaText },
            ]}
            numberOfLines={2}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  icon: {
    marginRight: 10,
  },
});

export default LuxCtaButton;
