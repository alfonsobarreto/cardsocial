import { SecondaryStackHeader } from '@/components/SecondaryStackHeader';
import ThemeChest from '@/components/ThemeChest';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import palette from './theme';

export default function ThemeLockerScreen() {
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];

  return (
    <View style={styles.root}>
      <SecondaryStackHeader
        title={tr('Locker de Estilos', 'Theme Locker')}
        accentColor={shell.ctaAccent}
        backgroundColor={shell.backgroundSolid}
        borderColor={shell.modalBorder}
        titleColor={shell.textPrimary}
      />
      <ThemeChest hideChromeHeader />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

