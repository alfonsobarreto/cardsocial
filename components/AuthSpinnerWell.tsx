/**
 * Pozol blanco compartido para BrandedSpinner / ActivityIndicator en auth y registro.
 * Evita el rectángulo oscuro del contenedor nativo/GIF sobre fondos oscuros.
 */
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

export const AUTH_SPINNER_WELL_PRESETS = {
  /** Botones inline (p. ej. autocompletar ubicación) */
  inline: { minSide: 36, borderRadius: 10 },
  /** CTA ancho fijo (confirmar registro, aceptar foto Android) */
  cta: { minSide: 44, borderRadius: 12 },
  /** Modal sign-in “Validando acceso…” */
  signinModal: { minSide: 132, borderRadius: 22 },
  /** Modal registro subida de datos */
  registerUpload: { minSide: 152, borderRadius: 24 },
  /** Botón confirmar recorte (CircularPhotoCropper) */
  cropperCta: { minSide: 40, borderRadius: 11 },
} as const;

type PresetName = keyof typeof AUTH_SPINNER_WELL_PRESETS;

type AuthSpinnerWellProps = {
  /** Color de fondo del pozo (p. ej. look.spinnerWellBg) */
  wellBg: string;
  /** Borde sutil (p. ej. look.spinnerWellBorder) */
  wellBorder: string;
  preset?: PresetName;
  /** Si se pasa, ignora preset (tamaño exacto) */
  minSide?: number;
  borderRadius?: number;
  children: React.ReactNode;
  style?: ViewStyle;
};

export function AuthSpinnerWell({
  wellBg,
  wellBorder,
  preset = 'inline',
  minSide: minSideProp,
  borderRadius: radiusProp,
  children,
  style,
}: AuthSpinnerWellProps) {
  const fromPreset = AUTH_SPINNER_WELL_PRESETS[preset];
  const minSide = minSideProp ?? fromPreset.minSide;
  const borderRadius = radiusProp ?? fromPreset.borderRadius;

  return (
    <View
      style={[
        styles.well,
        {
          width: minSide,
          height: minSide,
          borderRadius,
          backgroundColor: wellBg,
          borderColor: wellBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
