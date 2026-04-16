import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type KeypadColors = {
  backdrop: string;
  sheetBg: string;
  sheetBorder: string;
  keyBg: string;
  keyText: string;
  closeIcon: string;
  title: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  tr: (es: string, en: string) => string;
  colors: KeypadColors;
};

const ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

/**
 * Teclado DTMF in-app (tonos en red no garantizados en Ghost-Link app-a-app).
 * Feedback háptico + UI alineada tema día/noche.
 */
export function GhostLinkKeypadSheet({ visible, onClose, tr, colors }: Props) {
  const onDigit = useCallback(async (d: string) => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      /* opcional */
    }
    if (__DEV__) {
      console.log('[Ghost-Link keypad]', d);
    }
  }, []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.backdrop }]} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.sheetBg,
              borderColor: colors.sheetBorder,
            },
            Platform.OS === 'android' ? { elevation: 24 } : null,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.title, { color: colors.title }]}>
              {tr('Teclado', 'Keypad')}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={tr('Cerrar teclado', 'Close keypad')}
            >
              <MaterialCommunityIcons name="close" size={26} color={colors.closeIcon} />
            </TouchableOpacity>
          </View>
          {ROWS.map((row, ri) => (
            <View key={`r-${ri}`} style={styles.row}>
              {row.map((digit) => (
                <TouchableOpacity
                  key={digit}
                  style={[styles.key, { backgroundColor: colors.keyBg }]}
                  onPress={() => void onDigit(digit)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={digit}
                >
                  <Text style={[styles.keyText, { color: colors.keyText }]}>{digit}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <Text style={[styles.hint, { color: colors.title }]}>
            {tr(
              'Tono local (la otra parte puede no oír marcación).',
              'Local tones only; the other party may not hear DTMF.',
            )}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  sheet: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  key: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 22,
    fontWeight: '600',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.75,
    textAlign: 'center',
  },
});
