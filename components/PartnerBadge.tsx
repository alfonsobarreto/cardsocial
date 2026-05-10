/**
 * Insignia de socio oficial (Legacy Silver+): marca azul con check visible.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const BLUE = '#0A84FF';
const BLUE_RING = '#5AC8FA';

export function PartnerBadge(props: {
  /** Diámetro del círculo azul externo (~18–26). */
  size?: number;
  accessibilityLabel?: string;
}) {
  const diameter = props.size ?? 20;
  return (
    <View
      style={[styles.ring, { width: diameter + 8, height: diameter + 8, borderRadius: (diameter + 8) / 2 }]}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="image"
    >
      <View style={[styles.core, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}>
        <MaterialCommunityIcons name="check" size={diameter * 0.62} color="#FFFFFF" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 1.6,
    borderColor: BLUE_RING,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(90,200,250,0.12)',
  },
  core: {
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
