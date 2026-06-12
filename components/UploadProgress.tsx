/**
 * UploadProgress — circular or linear progress indicator for file uploads.
 * Usage: <UploadProgress progress={0.65} /> or <UploadProgress progress={0.65} variant="linear" />
 */

import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

type UploadProgressProps = {
  /** 0 to 1 */
  progress: number;
  variant?: 'circular' | 'linear';
  size?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  style?: ViewStyle;
};

export function UploadProgress({
  progress,
  variant = 'circular',
  size = 64,
  color = '#7A42FF',
  trackColor = '#E0E0E0',
  label,
  style,
}: UploadProgressProps) {
  const pct = Math.max(0, Math.min(1, progress));
  const displayPct = Math.round(pct * 100);

  if (variant === 'linear') {
    return (
      <View style={[styles.linearWrap, style]}>
        {label ? <Text style={[styles.label, { color }]}>{label}</Text> : null}
        <View style={[styles.linearTrack, { backgroundColor: trackColor }]}>
          <View style={[styles.linearFill, { width: `${displayPct}%`, backgroundColor: color }]} />
        </View>
        <Text style={[styles.pctText, { color }]}>{displayPct}%</Text>
      </View>
    );
  }

  // Circular variant — simple ring with percentage text
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {/* SVG-like background ring using border */}
      <View
        style={[
          styles.circularTrack,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: trackColor,
          },
        ]}
      />
      {/* Percentage text */}
      <Text style={[styles.circularText, { color, fontSize: size * 0.22 }]}>{displayPct}%</Text>
      {label ? <Text style={[styles.circularLabel, { color }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  linearWrap: {
    width: '100%',
    gap: 6,
  },
  linearTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  linearFill: {
    height: '100%',
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  pctText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  circularTrack: {
    position: 'absolute',
  },
  circularText: {
    fontWeight: '800',
  },
  circularLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
