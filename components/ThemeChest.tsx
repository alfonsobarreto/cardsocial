/**
 * ThemeChest — cofre de themes con preview cards en grilla 3×3.
 *
 * Cada theme se renderiza como una mini-tarjeta con:
 *   gradiente vertical, borde grueso, título, subtítulo, icono,
 *   sombra por tier, badge de tier, y candado si está bloqueado.
 *
 * Features:
 *   - Current theme banner at top
 *   - Theme name below each card
 *   - Haptic feedback + toast on apply
 *   - Long-press for full-size preview modal
 *   - Firestore-synced unlock persistence
 *   - Accessibility labels on every card
 *   - "La Fragua" button for premium store
 */

import { ThemeLockerThemeTile, THEME_LOCKER_TILE_GAP } from '@/components/ThemeLockerThemeTile';
import {
    TIER_META,
    getThemeById,
    getThemesByTier,
    type CardTheme,
    type ThemeTier
} from '@/constants/themeChest';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
import { setActiveThemeId, useActiveTheme } from '@/services/useActiveTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import {
    Alert,
    Dimensions,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - THEME_LOCKER_TILE_GAP * 2) / 3;
const BORDER_RADIUS = 22; // squircle iOS-style

type Props = {
  onNavigateToForge?: () => void;
  /** Si la ruta ya muestra cabecera con botón atrás (evita duplicar título). */
  hideChromeHeader?: boolean;
};

export default function ThemeChest({ onNavigateToForge, hideChromeHeader = false }: Props) {
  const modalFooterBottomPad = useModalFooterBottomPad();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);

  const { activeTheme, unlockedIds } = useActiveTheme();
  const [selectedThemeId, setSelectedThemeId] = useState<string>(activeTheme.id);
  const [previewTheme, setPreviewTheme] = useState<CardTheme | null>(null);

  // Sync when hook loads
  React.useEffect(() => { setSelectedThemeId(activeTheme.id); }, [activeTheme.id]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectTheme = useCallback(
    async (theme: CardTheme) => {
      const isUnlocked = unlockedIds.has(theme.id) || !theme.locked;

      if (!isUnlocked) {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
        Alert.alert(
          tr('Tema bloqueado', 'Theme locked'),
          tr(
            `"${theme.name}" cuesta ${theme.price} créditos.\nVisita La Fragua para desbloquear.`,
            `"${theme.name}" costs ${theme.price} credits.\nVisit The Forge to unlock.`,
          ),
          [
            { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
            { text: tr('Ir a La Fragua', 'Go to The Forge'), onPress: () => onNavigateToForge?.() },
          ],
        );
        return;
      }

      setSelectedThemeId(theme.id);
      await setActiveThemeId(theme.id);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Toast.show({
        type: 'success',
        text1: tr('Theme aplicado', 'Theme applied'),
        text2: theme.name,
        visibilityTime: 2000,
        topOffset: 60,
      });
    },
    [unlockedIds, onNavigateToForge, tr],
  );

  // ── Render one theme preview card (mismo tile que modal Temas en cards) ─────
  const renderThemeCard = (theme: CardTheme) => {
    const isActive = selectedThemeId === theme.id;
    const isUnlocked = unlockedIds.has(theme.id) || !theme.locked;

    return (
      <ThemeLockerThemeTile
        key={theme.id}
        theme={theme}
        isActive={isActive}
        isUnlocked={isUnlocked}
        tileWidth={CARD_WIDTH}
        onPress={() => void handleSelectTheme(theme)}
        onLongPress={() => {
          try {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {
            /* noop */
          }
          setPreviewTheme(theme);
        }}
      />
    );
  };

  // ── Render tier section ────────────────────────────────────────────────────
  const renderTier = (tier: ThemeTier) => {
    const meta = TIER_META[tier];
    const themes = getThemesByTier(tier);

    return (
      <View key={tier} style={styles.tierSection}>
        <View style={styles.tierHeader}>
          <Text style={styles.tierEmoji}>{meta.emoji}</Text>
          <Text style={styles.tierLabel}>{tr(meta.label[0], meta.label[1])}</Text>
          <View style={[styles.tierLine, { backgroundColor: tier === 'luxury' ? '#E9C349' : '#E0E0E0' }]} />
        </View>
        <View style={styles.tierGrid}>
          {themes.map(renderThemeCard)}
        </View>
      </View>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────
  const currentTheme = getThemeById(selectedThemeId) ?? activeTheme;
  const currentTierMeta = TIER_META[currentTheme.tier];

  return (
    <View style={styles.container}>
      {hideChromeHeader ? null : (
        <View style={styles.header}>
          <MaterialCommunityIcons name="treasure-chest" size={24} color="#C5A065" />
          <Text style={styles.headerTitle}>{tr('Locker de Estilos', 'Theme Locker')}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        {...verticalScrollInteractionProps}
        contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.scrollContent]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        {/* ── Current theme banner ──────────────────────────────────────── */}
        <View style={styles.bannerWrap}>
          <LinearGradient
            colors={currentTheme.background}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.bannerGradient, { borderColor: currentTheme.border.color, borderWidth: currentTheme.border.width }]}
          >
            <View style={styles.bannerLeft}>
              <MaterialCommunityIcons name={currentTheme.icon.name as any} size={22} color={currentTheme.icon.color} />
              <View>
                <Text style={[styles.bannerLabel, { color: currentTheme.subtitle.color }]}>{tr('Tu theme actual', 'Your current theme')}</Text>
                <Text style={[styles.bannerName, { color: currentTheme.title.color }]}>{currentTheme.name}</Text>
              </View>
            </View>
            <Text style={styles.bannerTier}>{currentTierMeta.emoji}</Text>
          </LinearGradient>
        </View>

        {/* Tier sections */}
        {(['fresh', 'moderno', 'luxury'] as ThemeTier[]).map(renderTier)}

        {/* ── La Fragua button ──────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.forgeButton}
          activeOpacity={0.85}
          onPress={() => {
            if (onNavigateToForge) {
              onNavigateToForge();
            } else {
              Alert.alert(
                tr('La Fragua', 'The Forge'),
                tr('Aquí podrás crear y comprar themes exclusivos. ¡Próximamente!', 'Create and buy exclusive themes here. Coming soon!'),
              );
            }
          }}
        >
          <LinearGradient
            colors={['#252525', '#1A1712', '#2A2618']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.forgeGradient}
          >
            <MaterialCommunityIcons name="anvil" size={28} color="#E9C349" />
            <View style={styles.forgeTextWrap}>
              <Text style={styles.forgeTitle}>{tr('La Fragua', 'The Forge')}</Text>
              <Text style={styles.forgeSubtitle}>
                {tr('Crea tu propio theme exclusivo', 'Create your own exclusive theme')}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#E9C349" />
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Long-press preview modal ──────────────────────────────────── */}
      <Modal visible={!!previewTheme} transparent animationType="fade" onRequestClose={() => setPreviewTheme(null)}>
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setPreviewTheme(null)}>
          {previewTheme && (
            <View
              style={[
                styles.previewCard,
                {
                  borderColor: previewTheme.border.color,
                  borderWidth: previewTheme.border.width + 1,
                  marginBottom: modalFooterBottomPad,
                },
              ]}
            >
              <LinearGradient
                colors={previewTheme.background}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.previewGradient}
              >
                <Text
                  style={[
                    styles.previewTitle,
                    {
                      color: previewTheme.title.color,
                      fontWeight: previewTheme.title.fontWeight,
                      fontStyle: previewTheme.title.fontStyle,
                    },
                  ]}
                >
                  Card
                </Text>
                <Text
                  style={[
                    styles.previewSubtitle,
                    {
                      color: previewTheme.subtitle.color,
                      fontWeight: previewTheme.subtitle.fontWeight,
                      fontStyle: previewTheme.subtitle.fontStyle,
                    },
                  ]}
                >
                  Social
                </Text>
                <View
                  style={[
                    styles.previewIconBubble,
                    {
                      backgroundColor: previewTheme.bubble.backgroundColor,
                      borderRadius: Math.min(previewTheme.bubble.borderRadius, 36),
                      borderColor: previewTheme.border.color,
                      borderWidth: Math.max(1, previewTheme.border.width),
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={previewTheme.icon.name as any}
                    size={previewTheme.icon.size * 1.65}
                    color={previewTheme.icon.color}
                  />
                </View>
                <Text
                  style={[
                    styles.previewIconLabel,
                    {
                      color: previewTheme.iconLabel.color,
                      fontWeight: previewTheme.iconLabel.fontWeight,
                      fontStyle: previewTheme.iconLabel.fontStyle,
                    },
                  ]}
                >
                  Icon
                </Text>
                <Text
                  style={[
                    styles.previewExtra,
                    {
                      color: previewTheme.extraText.color,
                      fontWeight: previewTheme.extraText.fontWeight,
                      fontStyle: previewTheme.extraText.fontStyle,
                    },
                  ]}
                >
                  {tr('4.8 · 12 reseñas', '4.8 · 12 reviews')}
                </Text>
              </LinearGradient>
              <View style={styles.previewFooter}>
                <Text style={styles.previewName}>{previewTheme.name}</Text>
                <Text style={styles.previewTier}>{TIER_META[previewTheme.tier].emoji} {tr(TIER_META[previewTheme.tier].label[0], TIER_META[previewTheme.tier].label[1])}</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: GRID_PADDING,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#E8E8E8',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 16,
  },

  // ── Tier ──
  tierSection: {
    marginBottom: 20,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tierEmoji: {
    fontSize: 18,
  },
  tierLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  tierLine: {
    flex: 1,
    height: 1,
    marginLeft: 8,
  },
  tierGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: THEME_LOCKER_TILE_GAP,
  },

  // ── La Fragua ──
  forgeButton: {
    marginTop: 8,
    borderRadius: 18,
    overflow: 'hidden',
  },
  forgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
  },
  forgeTextWrap: {
    flex: 1,
  },
  forgeTitle: {
    color: '#E9C349',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  forgeSubtitle: {
    color: '#8E99A4',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },

  // ── Current theme banner ──
  bannerWrap: {
    marginBottom: 16,
  },
  bannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  bannerName: {
    fontSize: 16,
    fontWeight: '800',
  },
  bannerTier: {
    fontSize: 22,
  },

  // ── Preview modal ──
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    width: SCREEN_WIDTH * 0.65,
    borderRadius: BORDER_RADIUS + 4,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  previewGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  previewTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
  },
  previewSubtitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  previewIconBubble: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  previewIconLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  previewExtra: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.95,
  },
  previewFooter: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  previewName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  previewTier: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E99A4',
  },
});
