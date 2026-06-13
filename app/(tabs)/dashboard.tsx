import AutoScaleText from '@/components/AutoScaleText';
import { BusinessReceiversMetricBlock } from '@/components/dashboard/BusinessReceiversMetricBlock';
import { ContactSavesMetricStrip } from '@/components/dashboard/ContactSavesMetricStrip';
import { LegacyPathGoalsSection } from '@/components/LegacyPathGoalsSection';
import {
  getCardAnalyticsForPeriod,
  getSeoInsightsForCard,
  type CardAnalyticsPeriodMode,
  type CardAnalyticsPeriodSummary,
  type MarketSeoSummary,
} from '@/services/analyticsService';
import { getActiveUserId } from '@/services/authSession';
import { buildBusinessCardEmailSignatureHtml, buildBusinessCardEmailSignaturePlainText } from '@/services/businessCardEmailSignatureHtml';
import { copyRichEmailSignatureToClipboard } from '@/services/copyRichEmailSignature';
import {
  generatePublicBusinessWebUrlForEmailSignature,
  getPublicBusinessWebBaseUrlForEmailSignature,
  getSignatureQrImageBaseUrl,
} from '@/services/brandedQrService';
import { listMyBusinessCards, updateBusinessCard } from '@/services/businessCardsRepo';
import { fetchBusinessCardHolderCounts } from '@/services/qrApi';
import { auth, db } from '@/services/firebaseConfig';
import { useLegacyPathEngine, LEGACY_REFERRALS_CEILING_UI } from '@/hooks/useLegacyPathEngine';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { issuePromotionsQrMarketRadarUrl } from '@/services/promotionsQrMarketRadarEmbedUrl';
import { MarketRadarWebView } from '@/components/MarketRadarWebView';
import { startSearchLocationSession } from '@/services/searchLocationSession';
import { marketRadarPromotionsQrUserMessage } from '@/services/marketRadarPromotionsQrMessages';
import {
  getMarketRadarRemoteConfig,
  subscribeMarketRadarRemoteConfig,
} from '@/services/marketRadarConfigService';
import { getRadarTrialEnabledSync } from '@/services/radarTrialEnabledCache';
import { userHasMarketRadarProAccess } from '@/services/marketRadarEntitlement';
import { requestMarketRadarProUpsell } from '@/services/subscriptionNavigationIntent';
import { requestBusinessCardSignatureEmail } from '@/services/requestBusinessCardSignatureEmail';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';
import {
  isDashboardTestingGraceModeEnabled,
  isDashboardTrialDisplayMode,
} from '@/services/dashboardTestingGrace';
import { hasUnlimitedAdminUi } from '@/services/roleService';
import { effectiveTierKeyFromUserData, type TierKey } from '@/services/tiersConfigService';
import type { BusinessCardDoc } from '@/services/types/cards';
import {
  buildBusinessCardIconAnalyticsRows,
  visibleIconAnalyticsRows,
} from '@/services/cardIconAnalyticsRows';
import { getCardRowTheme } from '@/services/useActiveTheme';
import { toRenderableImageUri } from '@/services/userProfilePhoto';
import * as Clipboard from 'expo-clipboard';
import { getThemeById } from '@/constants/themeChest';
import { listScrollInteractionProps, SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import appPalette, { type AppShellTheme } from '@/app/theme';
import type { CoreLocaleKey } from '@/services/coreI18n';
import { useCoreT } from '@/services/coreI18n';
import type { AppLanguage } from '@/services/language';
import { intlLocaleTagForAppLanguage, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { doc, getDoc } from 'firebase/firestore';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SHELL_ACCENT_GOLD } from '@/styles/_premiumTheme';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Map as LucideMap, Maximize2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** SEO explorer + heatmap + “niche keyword” + Market Radar WebView: oculto hasta UX/geo estables y reglas KPI claras. */
const DASHBOARD_SHOW_SEO_INTEL_AND_RADAR = false;

const CARD_GAP = 12;

type ExpirationTone = 'green' | 'amber' | 'red';
type PeriodMode = CardAnalyticsPeriodMode;
type DashboardBusinessCard = BusinessCardDoc & {
  type: 'business';
  is_visible: boolean;
};
type DashboardHeaderInfo = {
  firstName: string;
  planTier: TierKey;
};
type AnalyticsByBId = Record<string, CardAnalyticsPeriodSummary | undefined>;
type SeoByBId = Record<string, MarketSeoSummary | undefined>;

type DashboardChrome = {
  text: string;
  textSecondary: string;
  textMuted: string;
  seoMutedLine: string;
  panel: string;
  panelBorder: string;
  collapsibleHeaderBg: string;
  collapsibleBorder: string;
  subtitleOnPanel: string;
  gold: string;
  iconGold: string;
  /** Texto/iconos dorados legibles sobre fondos claros (día: bronce oscuro). */
  goldReadable: string;
  goldDeep: string;
  headerStripe: readonly [string, string, ...string[]];
  helloColor: string;
  planColor: string;
  loadingBorder: string;
  loadingBoxBg: string;
  loadingText: string;
  paginationDot: string;
  blockTitleColor: string;
  optimizeCtaBg: string;
  optimizeCtaBorder: string;
  optimizeCtaIcon: string;
  optimizeCtaText: string;
  analyticsCardBg: string;
  analyticsCardBorder: string;
  chartGridLine: string;
  periodTabBg: string;
  periodTabBorder: string;
  periodTabText: string;
  periodTabActiveText: string;
  periodTitleColor: string;
  periodArrowBg: string;
  periodArrowBorder: string;
  periodArrowIcon: string;
  periodArrowDisabledBg: string;
  periodArrowDisabledBorder: string;
  periodArrowDisabled: string;
  clickRateValueEmpty: string;
  metricsEmptyIconBg: string;
  bigMetricColor: string;
  rankLabel: string;
  rankEmpty: string;
  seoCardBg: string;
  seoCardBorder: string;
  opportunityTitle: string;
  seoScopeMuted: string;
  seoTransparency: string;
  explorerBtnIcon: string;
  heatmapCardBg: string;
  heatmapCanvasBg: string;
  heatmapRoad: string;
  heatmapCity: string;
  heatOrbText: string;
  legacyTitle: string;
  legacyBody: string;
  medalLabel: string;
  seoInputBg: string;
  seoInputBorder: string;
  seoInputText: string;
  seoInputPlaceholder: string;
  rankTrackBg: string;
  nicheChipInactiveBg: string;
  nicheChipActiveBg: string;
  nicheChipInactiveText: string;
  nicheChipActiveText: string;
  seoExplorerResetFg: string;
  collapsibleFrameBg: string;
  isNight: boolean;
};

function buildDashboardChrome(shellIn: AppShellTheme, isNight: boolean): DashboardChrome {
  const shell = shellIn as typeof appPalette.light;

  const accent = shell.ctaAccent;
  /** Legible sobre blanco / crema (~5.5:1). Evita #2F7BFF sobre fondos claros. */
  const goldReadable = isNight ? '#4D8FFF' : '#7A5C10';
  const goldDeep = isNight ? accent : '#5C4509';
  /** 8‑digit `#RRGGBBAA` (React Native): acento sobre superficies shell. */
  const a = (suffix: string) => `${accent}${suffix}` as const;

  const sm = shell.surfaceMuted;
  const sv = shell.surface;

  return {
    text: shell.textPrimary,
    textSecondary: shell.textSecondary,
    textMuted: shell.textMuted ?? shell.textSecondary,
    seoMutedLine: shell.textSecondary,
    panel: sm,
    panelBorder: isNight ? a('55') : shell.border,
    collapsibleHeaderBg: sm,
    collapsibleBorder: shell.border,
    collapsibleFrameBg: sm,
    subtitleOnPanel: shell.textSecondary,
    gold: accent,
    iconGold: goldReadable,
    goldReadable,
    goldDeep,
    headerStripe: isNight ? [sm, a('33'), shell.backgroundSolid] : [sv, shell.backgroundSolid, shell.backgroundSolid],
    helloColor: shell.textPrimary,
    planColor: goldReadable,
    loadingBorder: isNight ? a('59') : shell.border,
    loadingBoxBg: sm,
    loadingText: shell.textSecondary,
    paginationDot: isNight ? a('66') : 'rgba(122,92,16,0.28)',
    blockTitleColor: shell.textPrimary,
    optimizeCtaBg: sv,
    optimizeCtaBorder: shell.border,
    optimizeCtaIcon: goldReadable,
    optimizeCtaText: shell.textPrimary,
    analyticsCardBg: sm,
    analyticsCardBorder: isNight ? a('55') : shell.border,
    chartGridLine: isNight ? a('44') : 'rgba(122,92,16,0.14)',
    periodTabBg: isNight ? sv : shell.modalRowBg,
    periodTabBorder: shell.border,
    periodTabText: shell.textSecondary,
    periodTabActiveText: goldReadable,
    periodTitleColor: shell.textPrimary,
    periodArrowBg: isNight ? 'rgba(0,0,0,0.28)' : sv,
    periodArrowBorder: isNight ? 'rgba(47,123,255,0.24)' : shell.border,
    periodArrowIcon: goldReadable,
    periodArrowDisabledBg: isNight ? 'rgba(255,255,255,0.03)' : shell.modalRowBg,
    periodArrowDisabledBorder: isNight ? 'rgba(255,255,255,0.08)' : shell.border,
    periodArrowDisabled: shell.textMuted ?? shell.textSecondary,
    clickRateValueEmpty: isNight ? 'rgba(255,255,255,0.55)' : shell.textMuted,
    metricsEmptyIconBg: isNight ? 'rgba(47,123,255,0.16)' : 'rgba(122,92,16,0.10)',
    bigMetricColor: shell.textPrimary,
    rankLabel: shell.textPrimary,
    rankEmpty: shell.textSecondary,
    seoCardBg: sm,
    seoCardBorder: isNight ? a('55') : shell.border,
    opportunityTitle: goldReadable,
    seoScopeMuted: shell.textSecondary,
    seoTransparency: shell.textSecondary,
    explorerBtnIcon: isNight ? shell.btnPrimaryText : goldDeep,
    heatmapCardBg: sm,
    heatmapCanvasBg: sv,
    heatmapRoad: isNight ? a('44') : 'rgba(122,92,16,0.12)',
    heatmapCity: shell.textMuted ?? shell.textSecondary,
    heatOrbText: shell.textPrimary,
    legacyTitle: shell.textPrimary,
    legacyBody: shell.textSecondary,
    medalLabel: shell.textSecondary,
    seoInputBg: shell.inputBg,
    seoInputBorder: shell.border,
    seoInputText: shell.inputText ?? shell.textPrimary,
    seoInputPlaceholder: shell.searchPlaceholder ?? shell.textMuted ?? shell.textSecondary,
    rankTrackBg: shell.modalRowBg,
    nicheChipInactiveBg: sv,
    nicheChipActiveBg: isNight ? a('33') : 'rgba(122,92,16,0.12)',
    nicheChipInactiveText: shell.textSecondary,
    nicheChipActiveText: goldReadable,
    seoExplorerResetFg: goldReadable,
    isNight,
  };
}

function toDashboardBusinessCard(doc: BusinessCardDoc): DashboardBusinessCard {
  return {
    ...doc,
    type: 'business',
    is_visible: Boolean(doc.isPublishedToMarket),
  };
}

function expirationDateFor(card: DashboardBusinessCard): Date | null {
  const raw = card.subscriptionExpiresAt || card.trialEndsAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(date: Date | null): number {
  if (!date) return 999;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function toneForDays(daysLeft: number): ExpirationTone {
  if (daysLeft <= 7) return 'red';
  if (daysLeft <= 15) return 'amber';
  return 'green';
}

function toneColors(tone: ExpirationTone) {
  if (tone === 'red') {
    return {
      glow: '#FF3B30',
      bg: 'rgba(255,59,48,0.16)',
      border: 'rgba(255,59,48,0.78)',
      text: '#FFB3AD',
      label: 'CRITICO',
    };
  }
  if (tone === 'amber') {
    return {
      glow: '#FFB020',
      bg: 'rgba(255,176,32,0.16)',
      border: 'rgba(255,176,32,0.78)',
      text: '#FFD18A',
      label: 'ALERTA',
    };
  }
  return {
    glow: '#30D158',
    bg: 'rgba(48,209,88,0.12)',
    border: 'rgba(48,209,88,0.62)',
    text: '#B8F7C8',
    label: 'OK',
  };
}

function formatRenewal(date: Date | null, lang: AppLanguage): string {
  if (!date) return '--/--/----';
  const tag = intlLocaleTagForAppLanguage(lang);
  return date
    .toLocaleDateString(tag, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();
}

function readDashboardFirstName(data: Record<string, unknown> | null | undefined): string {
  const fullName =
    String(data?.userFullName ?? '').trim() ||
    String(data?.fullName ?? '').trim() ||
    String(data?.displayName ?? '').trim() ||
    String(auth.currentUser?.displayName ?? '').trim();
  return String(data?.firstName ?? '').trim() || fullName.split(/\s+/)[0] || '';
}

function planLabelFromTier(tier: TierKey, tcx: (key: CoreLocaleKey) => string): string {
  if (tier === 'business') return tcx('label_business');
  if (tier === 'influencer') return tcx('dashboard_plan_influencer');
  return tcx('dashboard_plan_free');
}

function periodTabsLabels(tcx: (key: CoreLocaleKey) => string): Array<{ key: PeriodMode; label: string }> {
  return [
    { key: 'day', label: tcx('dashboard_period_day') },
    { key: 'week', label: tcx('dashboard_period_week') },
    { key: 'month', label: tcx('dashboard_period_month') },
    { key: 'year', label: tcx('dashboard_period_year') },
  ];
}

function addPeriod(date: Date, mode: PeriodMode, offset: number) {
  const next = new Date(date);
  if (mode === 'day') next.setDate(next.getDate() + offset);
  if (mode === 'week') next.setDate(next.getDate() + offset * 7);
  if (mode === 'month') next.setMonth(next.getMonth() + offset);
  if (mode === 'year') next.setFullYear(next.getFullYear() + offset);
  return next;
}

function isoWeekNumber(date: Date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function periodTitle(mode: PeriodMode, offset: number, lang: AppLanguage, tcx: (key: CoreLocaleKey) => string) {
  const tag = intlLocaleTagForAppLanguage(lang);
  const target = addPeriod(new Date(), mode, offset);
  if (mode === 'day') {
    return target.toLocaleDateString(tag, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (mode === 'week') {
    return `${tcx('dashboard_period_week')} ${isoWeekNumber(target)} · ${target.getFullYear()}`;
  }
  if (mode === 'month') {
    return target.toLocaleDateString(tag, { month: 'long', year: 'numeric' });
  }
  return String(target.getFullYear());
}

function labelsForPeriod(mode: PeriodMode, lang: AppLanguage) {
  const tag = intlLocaleTagForAppLanguage(lang);
  if (mode === 'day') return Array.from({ length: 24 }, (_, i) => `${i}`);
  if (mode === 'week') {
    const monday = new Date(2024, 0, 8);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toLocaleDateString(tag, { weekday: 'narrow' });
    });
  }
  if (mode === 'month') {
    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: dim }, (_, i) => `${i + 1}`);
  }
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2024, i, 1);
    return d.toLocaleDateString(tag, { month: 'narrow' });
  });
}

function MiniLineChart({
  points,
  labels,
  height = 92,
  labelColor,
  gridColor,
  emptyHint,
}: {
  points: number[];
  labels: string[];
  height?: number;
  labelColor: string;
  gridColor: string;
  emptyHint: string;
}) {
  const max = Math.max(...points, 1);
  const hasActivity = points.some((point) => point > 0);
  return (
    <View style={[styles.chartBox, { height }]}>
      <View style={styles.chartGrid}>
        {[0, 1, 2].map((line) => (
          <View key={line} style={[styles.gridLine, { backgroundColor: gridColor }]} />
        ))}
      </View>
      {hasActivity ? (
        <>
          <View style={styles.chartBars}>
            {points.map((value, index) => {
              const barHeight = Math.max(4, (value / max) * (height - 28));
              return (
                <View key={`${value}-${index}`} style={styles.barSlot}>
                  <LinearGradient
                    colors={['rgba(255,222,128,0.95)', 'rgba(47,123,255,0.55)', 'rgba(80,53,14,0.25)']}
                    style={[styles.chartBar, { height: barHeight }]}
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.chartLabels}>
            {labels.map((label, index) => (
              <Text key={`${label}-${index}`} style={[styles.chartLabel, { color: labelColor }]} numberOfLines={1}>
                {label}
              </Text>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.noViewsBox}>
          <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={22} color="rgba(47,123,255,0.68)" />
          <Text style={[styles.noViewsText, { color: labelColor }]}>{emptyHint}</Text>
        </View>
      )}
    </View>
  );
}

function ExpirationBadge({
  variant,
  daysLeft,
  renewsAt,
}: {
  variant: 'normal' | 'trial' | 'unlimited';
  daysLeft: number;
  renewsAt: string;
}) {
  const tcx = useCoreT();
  const { resolvedMode: _badgeMode } = useLookMode();
  const badgeIsNight = _badgeMode === 'noche';
  const tone = toneForDays(daysLeft);
  const pulse = useRef(new Animated.Value(0)).current;
  const unlimited = variant === 'unlimited';

  useEffect(() => {
    if (unlimited || variant === 'trial' || tone !== 'red') {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 820, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 820, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, tone, unlimited, variant]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.95] });

  if (variant === 'trial') {
    const text = badgeIsNight ? '#4D8FFF' : '#5C4509';
    return (
      <View
        style={[
          styles.expirationBadge,
          {
            backgroundColor: badgeIsNight ? `${SHELL_ACCENT_GOLD}29` : 'rgba(122,92,16,0.10)',
            borderColor: badgeIsNight ? 'rgba(246,218,135,0.58)' : 'rgba(122,92,16,0.32)',
            shadowColor: badgeIsNight ? SHELL_ACCENT_GOLD : '#7A5C10',
          },
        ]}
      >
        <Text style={[styles.expirationStatus, { color: text, fontSize: 12, lineHeight: 16 }]}>
          {tcx('dashboard_trial_mode_label')}
        </Text>
      </View>
    );
  }

  const colors =
    variant === 'unlimited'
      ? {
          glow: badgeIsNight ? SHELL_ACCENT_GOLD : '#7A5C10',
          bg: badgeIsNight ? `${SHELL_ACCENT_GOLD}29` : 'rgba(122,92,16,0.10)',
          border: badgeIsNight ? 'rgba(246,218,135,0.58)' : 'rgba(122,92,16,0.32)',
          text: badgeIsNight ? '#4D8FFF' : '#5C4509',
          label: tcx('dashboard_unlimited_access'),
        }
      : (() => {
          const t = toneColors(tone);
          const dayText =
            tone === 'red' ? '#B02818' : tone === 'amber' ? '#8A5C00' : '#1A6B34';
          return {
            ...t,
            text: badgeIsNight ? t.text : dayText,
            label:
              tone === 'red'
                ? tcx('dashboard_exp_critical')
                : tone === 'amber'
                  ? tcx('dashboard_exp_alert')
                  : tcx('dashboard_exp_ok'),
          };
        })();

  const expirationSubTextColor = badgeIsNight ? 'rgba(255,255,255,0.82)' : 'rgba(28,28,30,0.65)';

  return (
    <Animated.View
      style={[
        styles.expirationBadge,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          shadowColor: colors.glow,
          transform: [{ scale }],
        },
      ]}
    >
      <Animated.View style={[styles.badgeGlowDot, { backgroundColor: colors.glow, opacity }]} />
      <View>
        <Text style={[styles.expirationStatus, { color: colors.text }]}>{colors.label}</Text>
        <Text style={[styles.expirationText, { color: expirationSubTextColor }]}>
          {unlimited ? tcx('dashboard_no_expiration') : `${tcx('dashboard_renews_prefix')} ${renewsAt}`}
        </Text>
      </View>
    </Animated.View>
  );
}

function PremiumMarketToggle({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean;
  disabled: boolean;
  onToggle: (nextValue: boolean) => void;
}) {
  const tcx = useCoreT();
  const { resolvedMode } = useLookMode();
  const shell = appPalette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const accent = shell.ctaAccent;
  const trackOn = accent;
  const trackOff = resolvedMode === 'noche' ? '#2E2E32' : '#4A4A4E';
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      disabled={disabled}
      onPress={() => onToggle(!enabled)}
      accessibilityRole="switch"
      accessibilityLabel={tcx('search_section_market')}
      accessibilityState={{ checked: enabled, disabled }}
      style={[
        styles.premiumToggleShell,
        enabled ? styles.premiumToggleShellOn : styles.premiumToggleShellOff,
        disabled && styles.premiumToggleDisabled,
        {
          backgroundColor: enabled ? trackOn : trackOff,
          borderColor: enabled ? `${accent}CC` : 'rgba(255,255,255,0.14)',
          shadowColor: enabled ? accent : 'transparent',
        },
      ]}
    >
      <LinearGradient
        colors={enabled ? ['#FFF4B8', accent, '#8D651B'] : ['#5C5C5C', '#3A3A3A', '#1A1A1A']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[
          styles.premiumToggleKnob,
          enabled ? styles.premiumToggleKnobOn : styles.premiumToggleKnobOff,
        ]}
      >
        <View style={styles.premiumToggleKnobShine} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

function DashboardBusinessCardItem({
  item,
  width,
  updating,
  onToggleMarket,
}: {
  item: DashboardBusinessCard;
  width: number;
  updating: boolean;
  onToggleMarket: (card: DashboardBusinessCard, nextValue: boolean) => void;
}) {
  const tcx = useCoreT();
  const chestTheme = getCardRowTheme(item.themeId || undefined);
  const themeMeta = getThemeById(item.themeId || '') ?? getThemeById('obsidian');
  const logoUri = toRenderableImageUri(item.bcLogoUrl || '');

  return (
    <View
      style={[
        styles.cardItem,
        styles.dashboardCardItem,
        {
          width,
          borderColor: chestTheme.borderColor,
          borderWidth: chestTheme.borderWidth,
          shadowColor: chestTheme.borderColor,
        },
      ]}
    >
      <LinearGradient
        colors={[...chestTheme.gradient]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.cardRowInner, styles.businessCardListInner, styles.businessCardRowInner]}>
        <View style={styles.businessListMainRow}>
          {logoUri ? (
            <ExpoImage
              source={{ uri: logoUri }}
              style={[styles.businessListLogo, { borderColor: chestTheme.borderColor }]}
              cachePolicy="memory"
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View style={[styles.businessListLogoPh, { borderColor: chestTheme.borderColor }]}>
              <MaterialCommunityIcons name="storefront-outline" size={35} color={chestTheme.titleColor} />
            </View>
          )}
          <View style={styles.businessListTextCol}>
            <AutoScaleText maxLines={2} style={[styles.cardTitle, styles.businessListTitle, { color: chestTheme.titleColor }]}>
              {item.bcName}
            </AutoScaleText>
            <Text style={[styles.businessListSubtitle, { color: chestTheme.metaColor }]} numberOfLines={1}>
              {item.bcContactName.trim() ? item.bcContactName : themeMeta?.name || tcx('dashboard_business_card_fallback')}
            </Text>
            <View style={styles.businessCardStatsRow}>
              <View style={styles.marketControl}>
                <Text style={[styles.marketSwitchLabel, { color: chestTheme.metaColor }]}>
                  {tcx('search_section_market')}
                </Text>
                <PremiumMarketToggle
                  enabled={item.is_visible}
                  disabled={updating}
                  onToggle={(nextValue) => onToggleMarket(item, nextValue)}
                />
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function MetricPanel({
  analytics,
  periodMode,
  periodOffset,
  onChangePeriod,
  onMovePeriod,
  chrome,
  language,
}: {
  analytics: CardAnalyticsPeriodSummary | undefined;
  periodMode: PeriodMode;
  periodOffset: number;
  onChangePeriod: (mode: PeriodMode) => void;
  onMovePeriod: (delta: number) => void;
  chrome: DashboardChrome;
  language: AppLanguage;
}) {
  const tcx = useCoreT();
  const periodOptions = useMemo(() => periodTabsLabels(tcx), [tcx]);
  const totalViews = Number(analytics?.totalViews || 0);
  const fallbackLabels = labelsForPeriod(periodMode, language);
  const labels = analytics?.labels?.length ? analytics.labels : fallbackLabels;
  const trend = analytics?.points?.length ? analytics.points : labels.map(() => 0);
  const engagementClicks = Number(analytics?.engagementClicks ?? analytics?.totalClicks ?? 0) || 0;
  const clickRate =
    totalViews > 0 && engagementClicks > 0
      ? Math.max(1, Math.min(99, Number(analytics?.clickRate || 0) || Math.round((engagementClicks / totalViews) * 100)))
      : 0;
  const hasClicks = clickRate > 0;
  const chartEmptyHint = tcx('dashboard_chart_empty_hint');
  const emptyTitle = tcx('dashboard_empty_activity_title');
  const emptySubtitle = tcx('dashboard_empty_activity_subtitle');
  const periodSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 28 && Math.abs(gesture.dy) < 18,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -42) {
            onMovePeriod(-1);
            return;
          }
          if (gesture.dx > 42 && periodOffset < 0) {
            onMovePeriod(1);
          }
        },
      }),
    [onMovePeriod, periodOffset],
  );

  return (
    <View style={styles.analyticsGrid}>
      <View
        style={[
          styles.analyticsCard,
          styles.analyticsCardFull,
          { backgroundColor: chrome.analyticsCardBg, borderColor: chrome.analyticsCardBorder },
        ]}
        {...periodSwipeResponder.panHandlers}
      >
        <View style={styles.panelHeaderRow}>
          <Text style={[styles.sectionKicker, { color: chrome.textMuted }]}>{tcx('dashboard_metric_card_views')}</Text>
          {totalViews > 0 ? (
            <View style={[styles.clickRateChip, { borderColor: chrome.panelBorder, backgroundColor: chrome.rankTrackBg }]}>
              <Text style={[styles.clickRateChipLabel, { color: chrome.seoMutedLine }]} numberOfLines={2}>
                {tcx('dashboard_metric_ctr')}
              </Text>
              <Text
                style={[
                  styles.clickRateChipValue,
                  { color: chrome.iconGold },
                  !hasClicks && { color: chrome.clickRateValueEmpty },
                ]}
              >
                {clickRate}%
              </Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.periodTabs, { backgroundColor: chrome.periodTabBg, borderColor: chrome.periodTabBorder }]}>
          {periodOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.periodTab,
                periodMode === option.key && styles.periodTabActive,
                periodMode === option.key && {
                  borderColor: chrome.isNight ? `${chrome.gold}C7` : 'rgba(122,92,16,0.38)',
                  backgroundColor: chrome.isNight ? `${chrome.gold}33` : 'rgba(122,92,16,0.12)',
                  shadowColor: chrome.isNight ? chrome.gold : 'transparent',
                },
              ]}
              onPress={() => onChangePeriod(option.key)}
              activeOpacity={0.82}
            >
              <Text
                style={[
                  styles.periodTabText,
                  { color: chrome.periodTabText },
                  periodMode === option.key && { color: chrome.periodTabActiveText },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.periodNavRow}>
          <TouchableOpacity
            style={[
              styles.periodArrow,
              { backgroundColor: chrome.periodArrowBg, borderColor: chrome.periodArrowBorder },
            ]}
            onPress={() => onMovePeriod(-1)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="chevron-left" size={18} color={chrome.periodArrowIcon} />
          </TouchableOpacity>
          <Text style={[styles.periodTitle, { color: chrome.periodTitleColor }]} numberOfLines={1}>
            {periodTitle(periodMode, periodOffset, language, tcx)}
          </Text>
          <TouchableOpacity
            style={[
              styles.periodArrow,
              {
                backgroundColor: periodOffset >= 0 ? chrome.periodArrowDisabledBg : chrome.periodArrowBg,
                borderColor: periodOffset >= 0 ? chrome.periodArrowDisabledBorder : chrome.periodArrowBorder,
              },
            ]}
            onPress={() => {
              if (periodOffset < 0) onMovePeriod(1);
            }}
            activeOpacity={periodOffset < 0 ? 0.8 : 1}
          >
            <MaterialCommunityIcons
              name="chevron-right"
              size={18}
              color={periodOffset < 0 ? chrome.periodArrowIcon : chrome.periodArrowDisabled}
            />
          </TouchableOpacity>
        </View>
        {totalViews > 0 ? (
          <>
            <Text style={[styles.bigMetric, { color: chrome.bigMetricColor }]}>
              {totalViews.toLocaleString(intlLocaleTagForAppLanguage(language))}
            </Text>
            <MiniLineChart
              points={trend}
              labels={labels}
              height={118}
              labelColor={chrome.textMuted}
              gridColor={chrome.chartGridLine}
              emptyHint={chartEmptyHint}
            />
          </>
        ) : (
          <View style={styles.metricsEmptyState}>
            <View
              style={[
                styles.metricsEmptyIcon,
                {
                  backgroundColor: chrome.metricsEmptyIconBg,
                  borderColor: chrome.isNight ? 'rgba(47,123,255,0.34)' : 'rgba(122,92,16,0.22)',
                },
              ]}
            >
              <MaterialCommunityIcons name="diamond-stone" size={22} color={chrome.iconGold} />
            </View>
            <Text style={[styles.metricsEmptyTitle, { color: chrome.rankLabel }]}>{emptyTitle}</Text>
            <Text style={[styles.metricsEmptyText, { color: chrome.rankEmpty }]}>{emptySubtitle}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  headerBg,
  borderColor,
  titleColor,
  iconTint,
  chevronTint,
  frameBg,
  children,
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  defaultOpen?: boolean;
  headerBg?: string;
  borderColor?: string;
  titleColor?: string;
  iconTint?: string;
  chevronTint?: string;
  frameBg?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View
      style={[
        styles.collapsibleFrame,
        frameBg ? { backgroundColor: frameBg } : undefined,
        borderColor ? { borderColor } : undefined,
      ]}
    >
      <Pressable
        style={[styles.collapsibleHeader, headerBg ? { backgroundColor: headerBg } : undefined]}
        onPress={() => setOpen((prev) => !prev)}
      >
        <View style={styles.collapsibleTitleRow}>
          <MaterialCommunityIcons name={icon} size={17} color={iconTint ?? SHELL_ACCENT_GOLD} />
          <Text style={[styles.collapsibleTitle, titleColor ? { color: titleColor } : undefined]}>{title}</Text>
        </View>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={chevronTint ?? '#A88A43'} />
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language } = useLanguage();
  const tcx = useCoreT();
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = appPalette[isNight ? 'dark' : 'light'];
  const chrome = useMemo(() => buildDashboardChrome(shell, isNight), [shell, isNight]);
  const { width: screenWidth } = useWindowDimensions();
  const itemWidth = Math.max(280, screenWidth - 32);
  const snapInterval = itemWidth + CARD_GAP;
  const [activeIndex, setActiveIndex] = useState(0);
  const [sessionUid, setSessionUid] = useState('');
  const [cards, setCards] = useState<DashboardBusinessCard[]>([]);
  const [analyticsByBId, setAnalyticsByBId] = useState<AnalyticsByBId>({});
  const [analyticsLoadFailed, setAnalyticsLoadFailed] = useState(false);
  const [analyticsReloadNonce, setAnalyticsReloadNonce] = useState(0);
  const [seoByBId, setSeoByBId] = useState<SeoByBId>({});
  const [seoLocationQuery, setSeoLocationQuery] = useState('');
  const [seoLocationApplied, setSeoLocationApplied] = useState('');
  const [launchingRadar, setLaunchingRadar] = useState(false);
  const [radarWebViewUrl, setRadarWebViewUrl] = useState<string | null>(null);
  const [seoExpanded, setSeoExpanded] = useState(false);
  const [iconoDataExpanded, setIconoDataExpanded] = useState(false);
  const [showTopNicheKeyword, setShowTopNicheKeyword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingBId, setUpdatingBId] = useState<string | null>(null);
  const [signatureBusy, setSignatureBusy] = useState(false);
  /** Año civil en curso (1 ene → 31 dic, offset 0) — mejor visión macro del negocio. */
  const [periodMode, setPeriodMode] = useState<PeriodMode>('year');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [headerInfo, setHeaderInfo] = useState<DashboardHeaderInfo>({
    firstName: '',
    planTier: 'free',
  });
  const [opsAdmin, setOpsAdmin] = useState(false);
  const [radarTrialEnabled, setRadarTrialEnabled] = useState(() => getRadarTrialEnabledSync());
  const [marketRadarProOk, setMarketRadarProOk] = useState(false);
  const [marketRadarProPrice, setMarketRadarProPrice] = useState(0);
  const [marketRadarProCs, setMarketRadarProCs] = useState(0);
  const activeCard = cards[activeIndex] ?? cards[0] ?? null;
  const testingGrace = isDashboardTestingGraceModeEnabled();
  const trialDisplayMode = isDashboardTrialDisplayMode(testingGrace, radarTrialEnabled);
  const rawActiveRenewal = !activeCard ? null : expirationDateFor(activeCard);
  const normalDaysLeft = daysUntil(rawActiveRenewal);
  const headerTone = toneColors(
    opsAdmin || trialDisplayMode ? 'green' : toneForDays(normalDaysLeft),
  );
  const showExpirationBadge = Boolean(activeCard && (opsAdmin || trialDisplayMode || rawActiveRenewal));
  const expirationBadgeVariant: 'normal' | 'trial' | 'unlimited' = opsAdmin
    ? 'unlimited'
    : trialDisplayMode
      ? 'trial'
      : 'normal';
  const expirationBadgeDaysLeft = opsAdmin || trialDisplayMode ? 999 : normalDaysLeft;
  const expirationBadgeRenewsAt = formatRenewal(rawActiveRenewal, language);
  const activeAnalytics = activeCard ? analyticsByBId[activeCard.bId] : undefined;
  const activeSeo = activeCard ? seoByBId[activeCard.bId] : undefined;

  const legacyLive = useLegacyPathEngine(Boolean(sessionUid.trim()));

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const uid = await getActiveUserId();
      if (!uid) {
        setSessionUid('');
        setCards([]);
        setAnalyticsByBId({});
        setSeoByBId({});
        setOpsAdmin(false);
        setRadarTrialEnabled(getRadarTrialEnabledSync());
        setMarketRadarProOk(false);
        setMarketRadarProPrice(0);
        setMarketRadarProCs(0);
        return;
      }
      setSessionUid(uid);
      const [isUnlimitedAdmin, userSnap, radarCfg] = await Promise.all([
        hasUnlimitedAdminUi(uid),
        getDoc(doc(db, 'users', uid)).catch(() => null),
        getMarketRadarRemoteConfig(),
      ]);
      const userData = userSnap?.exists() ? (userSnap.data() as Record<string, unknown>) : null;
      setMarketRadarProPrice(radarCfg.proPriceUsd);
      setMarketRadarProCs(radarCfg.proEquivalentCs);
      setRadarTrialEnabled(radarCfg.radarTrialEnabled);
      setOpsAdmin(isUnlimitedAdmin);
      setMarketRadarProOk(userHasMarketRadarProAccess(userData, isUnlimitedAdmin));
      setHeaderInfo({
        firstName: readDashboardFirstName(userData),
        planTier: effectiveTierKeyFromUserData(userData || {}),
      });
      const businessCards = (await listMyBusinessCards(uid))
        .map(toDashboardBusinessCard)
        .filter((card) => card.type === 'business' && String(card.bId || '').trim().length > 0)
        .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));
      setCards(businessCards);
      setActiveIndex((prev) => Math.max(0, Math.min(prev, Math.max(0, businessCards.length - 1))));
      if (businessCards.length) {
        try {
          const counts = await fetchBusinessCardHolderCounts({
            uid,
            keys: businessCards.map((c) => String(c.bId || '').trim()).filter(Boolean),
          });
          setCards((prev) =>
            prev.map((c) => ({
              ...c,
              holdersCount: counts[c.bId] ?? c.holdersCount ?? 0,
            })),
          );
        } catch {
          /* conserva holdersCount de Firestore si la API falla */
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  useEffect(() => {
    if (!sessionUid || !cards.length) {
      setAnalyticsByBId({});
      setAnalyticsLoadFailed(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      let anyFailed = false;
      const analyticsEntries = await Promise.all(
        cards.map(async (card) => {
          try {
            const summary = await getCardAnalyticsForPeriod({
              cardId: card.bId,
              periodMode,
              periodOffset,
            });
            return [card.bId, summary] as const;
          } catch {
            anyFailed = true;
            return [card.bId, undefined] as const;
          }
        }),
      );
      if (!cancelled) {
        setAnalyticsByBId(Object.fromEntries(analyticsEntries));
        setAnalyticsLoadFailed(anyFailed);
        if (!anyFailed && sessionUid && cards.length) {
          try {
            const counts = await fetchBusinessCardHolderCounts({
              uid: sessionUid,
              keys: cards.map((c) => String(c.bId || '').trim()).filter(Boolean),
            });
            setCards((prev) =>
              prev.map((c) => ({
                ...c,
                holdersCount: counts[c.bId] ?? c.holdersCount ?? 0,
              })),
            );
          } catch {
            /* holdersCount se conserva */
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cards, periodMode, periodOffset, sessionUid, analyticsReloadNonce]);

  useEffect(() => {
    if (!DASHBOARD_SHOW_SEO_INTEL_AND_RADAR || !sessionUid || !cards.length) {
      setSeoByBId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const seoEntries = await Promise.all(
        cards.map(async (card) => {
          try {
            const summary = await getSeoInsightsForCard({
              bId: card.bId,
              locationQuery: seoLocationApplied || null,
            });
            return [card.bId, summary] as const;
          } catch {
            return [card.bId, undefined] as const;
          }
        }),
      );
      if (!cancelled) {
        setSeoByBId(Object.fromEntries(seoEntries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cards, seoLocationApplied, sessionUid]);

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / snapInterval);
    setActiveIndex(Math.max(0, Math.min(cards.length - 1, nextIndex)));
  };

  useEffect(() => {
    setSeoExpanded(false);
    setIconoDataExpanded(false);
    setShowTopNicheKeyword(false);
  }, [activeCard?.bId]);

  const topIconData = useMemo(
    () =>
      buildBusinessCardIconAnalyticsRows(
        activeCard,
        activeAnalytics?.topIcons,
        activeAnalytics?.totalViews ?? 0,
      ),
    [activeAnalytics, activeCard],
  );
  const topIconVisible = useMemo(
    () => visibleIconAnalyticsRows(topIconData, iconoDataExpanded),
    [topIconData, iconoDataExpanded],
  );
  const seoRows = activeSeo?.rows || [];
  const visibleSeoRows = seoExpanded || seoRows.length <= 6 ? seoRows : seoRows.slice(0, 5);
  const studioWebBase = useMemo((): string | null => {
    const raw =
      process.env.EXPO_PUBLIC_MARKET_RADAR_WEB_ORIGIN ??
      process.env.EXPO_PUBLIC_STUDIO_WEB_URL ??
      '';
    const s = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
    return s.length > 0 ? s : null;
  }, []);

  useEffect(() => {
    if (!sessionUid.trim()) return undefined;
    return subscribeMarketRadarRemoteConfig((cfg) => {
      setRadarTrialEnabled(cfg.radarTrialEnabled);
      setMarketRadarProPrice(cfg.proPriceUsd);
      setMarketRadarProCs(cfg.proEquivalentCs);
      if (opsAdmin || cfg.radarTrialEnabled) {
        setMarketRadarProOk(true);
      }
    });
  }, [sessionUid, opsAdmin]);

  const canOpenMarketRadar = marketRadarProOk || opsAdmin || radarTrialEnabled || getRadarTrialEnabledSync();

  const launchCommandCenter = useCallback(async () => {
    if (!studioWebBase || launchingRadar) return;
    if (!canOpenMarketRadar) {
      const priceLine =
        marketRadarProPrice > 0 || marketRadarProCs > 0
          ? [
              marketRadarProPrice > 0
                ? new Intl.NumberFormat(intlLocaleTagForAppLanguage(language), {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0,
                  }).format(marketRadarProPrice)
                : null,
              marketRadarProCs > 0 ? `${marketRadarProCs.toLocaleString()} CS` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : tcx('dashboard_radar_price_fallback');
      Alert.alert(
        tcx('dashboard_market_radar_pro_title'),
        tcx('dashboard_market_radar_pro_body', { priceLine }),
        [
          { text: tcx('common_close'), style: 'cancel' },
          { text: tcx('dashboard_go_subscription'), onPress: () => requestMarketRadarProUpsell() },
        ],
      );
      return;
    }
    setLaunchingRadar(true);
    try {
      const radarEmbed = await issuePromotionsQrMarketRadarUrl(language);
      if (!radarEmbed.ok) {
        const gate403 =
          radarEmbed.issue.httpStatus === 403 &&
          (radarEmbed.issue.code === 'market_radar_pro_required' ||
            radarEmbed.issue.code === 'market_radar_requires_business_card');
        if (gate403) {
          requestMarketRadarProUpsell();
          return;
        }
        Alert.alert(
          tcx('dashboard_radar_unavailable'),
          marketRadarPromotionsQrUserMessage(radarEmbed.issue),
        );
        return;
      }
      let url = radarEmbed.url.trim();
      const locSession = await startSearchLocationSession();
      if (locSession.ok) {
        const parsed = new URL(url);
        parsed.searchParams.set('lat', String(locSession.latitude));
        parsed.searchParams.set('lng', String(locSession.longitude));
        url = parsed.toString();
      }
      setRadarWebViewUrl(url);
    } catch (e) {
      Alert.alert(
        tcx('dashboard_browser_open_failed'),
        userFacingAlertMessage(e, language, tcx('common_try_again')),
      );
    } finally {
      setLaunchingRadar(false);
    }
  }, [
    studioWebBase,
    launchingRadar,
    language,
    tcx,
    canOpenMarketRadar,
    marketRadarProPrice,
    marketRadarProCs,
  ]);

  const radarLaunchBlockedByPro = Boolean(studioWebBase && !canOpenMarketRadar);

  const handleChangePeriod = (mode: PeriodMode) => {
    setPeriodMode(mode);
    setPeriodOffset(0);
  };

  const applySeoLocation = () => {
    setSeoLocationApplied(seoLocationQuery.trim());
  };

  const resetSeoLocation = () => {
    setSeoLocationQuery('');
    setSeoLocationApplied('');
  };

  const handleMovePeriod = (delta: number) => {
    setPeriodOffset((prev) => Math.min(0, prev + delta));
  };

  const handleToggleMarket = async (card: DashboardBusinessCard, nextValue: boolean) => {
    if (!sessionUid || updatingBId) return;
    setUpdatingBId(card.bId);
    const previousValue = card.is_visible;
    setCards((prev) =>
      prev.map((row) =>
        row.bId === card.bId
          ? { ...row, is_visible: nextValue, isPublishedToMarket: nextValue }
          : row,
      ),
    );
    try {
      // Backend contract: `isPublishedToMarket` is the persisted is_visible flag for Social Market.
      await updateBusinessCard(sessionUid, card.bId, { isPublishedToMarket: nextValue });
    } catch (error) {
      setCards((prev) =>
        prev.map((row) =>
          row.bId === card.bId
            ? { ...row, is_visible: previousValue, isPublishedToMarket: previousValue }
            : row,
        ),
      );
      Alert.alert(
        tcx('dashboard_social_market_update_failed'),
        userFacingAlertMessage(error, language, tcx('common_try_again')),
      );
    } finally {
      setUpdatingBId(null);
    }
  };

  const handleCopyEmailSignature = useCallback(async () => {
    if (!activeCard || !sessionUid || signatureBusy) return;
    const themeMeta = getThemeById(activeCard.themeId || '') ?? getThemeById('obsidian');
    const subtitleText = activeCard.bcContactName.trim()
      ? activeCard.bcContactName
      : themeMeta?.name || tcx('dashboard_business_card_fallback');
    const qrHostBase = getSignatureQrImageBaseUrl();
    const publicUrl = generatePublicBusinessWebUrlForEmailSignature(activeCard.bId, sessionUid);
    let emailLogoNormalize: { siteOrigin: string; apiOrigin: string } | undefined;
    try {
      emailLogoNormalize = {
        siteOrigin: getPublicBusinessWebBaseUrlForEmailSignature(),
        apiOrigin: resolveExpoPublicApiBaseUrl(),
      };
    } catch {
      emailLogoNormalize = undefined;
    }
    const html = buildBusinessCardEmailSignatureHtml({
      webBaseUrl: qrHostBase,
      publicCardUrl: publicUrl,
      bcName: activeCard.bcName,
      subtitle: subtitleText,
      logoUrl: toRenderableImageUri(activeCard.bcLogoUrl || '') ?? undefined,
      themeId: activeCard.themeId ?? undefined,
      emailLogoNormalize,
    });
    const plain = buildBusinessCardEmailSignaturePlainText({
      bcName: activeCard.bcName,
      subtitle: subtitleText,
      publicCardUrl: publicUrl,
    });

    try {
      if (Platform.OS === 'web') {
        const richOk = await copyRichEmailSignatureToClipboard(html, plain);
        if (richOk) {
          Alert.alert(
            tcx('dashboard_signature_copied_title'),
            tcx('dashboard_signature_copied_body'),
          );
          return;
        }
        await Clipboard.setStringAsync(plain);
        Alert.alert(
          tcx('dashboard_plain_text_only_title'),
          tcx('dashboard_plain_text_only_body'),
        );
        return;
      }

      setSignatureBusy(true);
      try {
        await requestBusinessCardSignatureEmail({
          bId: activeCard.bId,
          locale: language === 'es' ? 'es' : 'en',
        });
        Alert.alert(
          tcx('dashboard_check_email_title'),
          tcx('dashboard_check_email_body'),
        );
      } catch (e) {
        const code = String((e as Error)?.message || '');
        if (code === 'email_not_available_on_account') {
          Alert.alert(
            tcx('dashboard_email_not_linked_title'),
            tcx('dashboard_email_not_linked_body'),
          );
        } else if (code === 'email_unconfigured') {
          Alert.alert(
            tcx('dashboard_email_service_pause_title'),
            tcx('dashboard_email_service_pause_body'),
          );
        } else if (code === 'card_not_found_or_forbidden') {
          Alert.alert(
            tcx('dashboard_card_unavailable_title'),
            tcx('dashboard_card_unavailable_body'),
          );
        } else if (code === 'AUTH_REQUIRED') {
          Alert.alert(
            tcx('dashboard_sign_in_required_title'),
            tcx('dashboard_sign_in_required_body'),
          );
        } else if (code === 'send_failed' || code.startsWith('http_')) {
          Alert.alert(
            tcx('dashboard_send_failed_title'),
            tcx('dashboard_send_failed_server_body'),
          );
        } else if (code === 'request_timeout' || code === 'auth_token_timeout') {
          Alert.alert(
            tcx('dashboard_send_failed_title'),
            tcx('dashboard_send_timeout_body'),
          );
        } else {
          Alert.alert(
            tcx('dashboard_send_failed_title'),
            userFacingAlertMessage(e, language, tcx('common_try_again')),
          );
        }
      } finally {
        setSignatureBusy(false);
      }
    } catch (e) {
      Alert.alert(
        tcx('dashboard_something_wrong'),
        userFacingAlertMessage(e, language, tcx('common_try_again')),
      );
      setSignatureBusy(false);
    }
  }, [activeCard, sessionUid, tcx, signatureBusy, language]);
  const displayFirstName = headerInfo.firstName.trim() || tcx('dashboard_user_fallback');

  return (
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <ScrollView
        contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        {...verticalScrollInteractionProps}
      >
        <View style={[styles.headerFrame, { shadowColor: headerTone.glow, borderColor: headerTone.border }]}>
          <LinearGradient
            colors={chrome.headerStripe}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerInner}
          >
            <View style={styles.headerCopy}>
              <Text style={[styles.hello, { color: chrome.helloColor }]} numberOfLines={1}>
                {tcx('dashboard_hello')}, {displayFirstName}
              </Text>
              <Text style={[styles.plan, { color: chrome.planColor }]} numberOfLines={1}>
                {tcx('dashboard_plan_label')} {planLabelFromTier(headerInfo.planTier, tcx)}
              </Text>
            </View>
            {showExpirationBadge ? (
              <ExpirationBadge
                variant={expirationBadgeVariant}
                daysLeft={expirationBadgeDaysLeft}
                renewsAt={expirationBadgeRenewsAt}
              />
            ) : null}
          </LinearGradient>
        </View>

        {loading ? (
          <View style={[styles.loadingBox, { borderColor: chrome.loadingBorder, backgroundColor: chrome.loadingBoxBg }]}>
            <ActivityIndicator color={chrome.gold} />
            <Text style={[styles.loadingText, { color: chrome.loadingText }]}>
              {tcx('dashboard_loading_business_cards')}
            </Text>
          </View>
        ) : cards.length ? (
          <>
            <View style={styles.carouselShell}>
              <FlatList
                horizontal
                {...listScrollInteractionProps}
                snapToInterval={snapInterval}
                decelerationRate="fast"
                data={cards}
                keyExtractor={(item) => item.bId}
                renderItem={({ item }) => (
                  <DashboardBusinessCardItem
                    item={item}
                    width={itemWidth}
                    updating={updatingBId === item.bId}
                    onToggleMarket={handleToggleMarket}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onMomentumScrollEnd}
                contentContainerStyle={styles.carouselContent}
                ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
                getItemLayout={(_, index) => ({ length: snapInterval, offset: snapInterval * index, index })}
              />
            </View>
            <View style={styles.pagination}>
              {cards.map((card, index) => (
                <View
                  key={card.bId}
                  style={[
                    styles.pageDot,
                    { backgroundColor: chrome.paginationDot },
                    index === activeIndex && styles.pageDotActive,
                    index === activeIndex ? { backgroundColor: chrome.gold } : undefined,
                  ]}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={[styles.emptyDashboardBox, { borderColor: chrome.loadingBorder, backgroundColor: chrome.loadingBoxBg }]}>
            <MaterialCommunityIcons name="chart-line-variant" size={34} color={chrome.goldReadable} />
            <Text style={[styles.emptyTitle, { color: chrome.text }]}>
              {tcx('dashboard_empty_no_business_cards_title')}
            </Text>
            <Text style={[styles.emptyText, { color: chrome.textSecondary }]}>
              {tcx('dashboard_empty_no_business_cards_body')}
            </Text>
          </View>
        )}

        {cards.length > 0 && activeCard && sessionUid ? (
          <>
            <BusinessReceiversMetricBlock
              holdersCount={activeCard.holdersCount ?? 0}
              cardTitle={String(activeCard.bcName || activeCard.bcContactName || '').trim() || '—'}
              sessionUid={sessionUid}
              bId={activeCard.bId}
              chrome={{
                text: chrome.text,
                textSecondary: chrome.textSecondary,
                textMuted: chrome.textMuted,
                panel: chrome.panel,
                panelBorder: chrome.panelBorder,
                gold: chrome.gold,
                goldReadable: chrome.goldReadable,
                iconGold: chrome.iconGold,
                analyticsCardBg: chrome.analyticsCardBg,
                analyticsCardBorder: chrome.analyticsCardBorder,
                periodTabBg: chrome.periodTabBg,
                periodTabBorder: chrome.periodTabBorder,
                periodTabText: chrome.periodTabText,
                periodTabActiveText: chrome.periodTabActiveText,
                chartGridLine: chrome.chartGridLine,
                isNight: chrome.isNight,
              }}
              language={language}
            />
            <ContactSavesMetricStrip analytics={activeAnalytics} language={language} isNight={chrome.isNight} />
            {analyticsLoadFailed ? (
              <View style={[styles.analyticsErrorBanner, { borderColor: chrome.panelBorder, backgroundColor: chrome.rankTrackBg }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={chrome.goldReadable} />
                <Text style={[styles.analyticsErrorText, { color: chrome.textSecondary }]}>
                  {tcx('dashboard_analytics_load_error')}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setAnalyticsLoadFailed(false);
                    setAnalyticsReloadNonce((n) => n + 1);
                  }}
                  hitSlop={8}
                  activeOpacity={0.82}
                >
                  <Text style={[styles.analyticsRetryText, { color: chrome.goldReadable }]}>{tcx('dashboard_analytics_retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : null}

        {activeCard && sessionUid ? (
          <View style={styles.emailSignatureRow}>
            <TouchableOpacity
              style={[
                styles.emailSignatureBtn,
                {
                  opacity: signatureBusy ? 0.72 : 1,
                  backgroundColor: chrome.optimizeCtaBg,
                  borderColor: chrome.optimizeCtaBorder,
                },
              ]}
              onPress={() => void handleCopyEmailSignature()}
              disabled={signatureBusy}
              activeOpacity={0.85}
            >
              {signatureBusy ? (
                <ActivityIndicator size="small" color={chrome.optimizeCtaIcon} />
              ) : (
                <MaterialCommunityIcons
                  name={Platform.OS === 'web' ? 'content-copy' : 'send-outline'}
                  size={16}
                  color={chrome.optimizeCtaIcon}
                />
              )}
              <Text style={[styles.emailSignatureBtnText, { color: chrome.optimizeCtaText }]} numberOfLines={2}>
                {Platform.OS === 'web'
                  ? tcx('dashboard_copy_signature_web')
                  : tcx('dashboard_email_signature_cta')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.blockTitleRow}>
          <Text style={[styles.blockTitle, { flex: 1, color: chrome.blockTitleColor }]}>
            {tcx('dashboard_seo_block_title')}
          </Text>
          {activeCard ? (
            <TouchableOpacity
              style={[
                styles.optimizeKeywordsCta,
                { backgroundColor: chrome.optimizeCtaBg, borderColor: chrome.optimizeCtaBorder },
              ]}
              onPress={() => router.push({ pathname: '/(tabs)/createBusinessCard', params: { bId: activeCard.bId } })}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="tune-variant" size={15} color={chrome.optimizeCtaIcon} />
              <Text style={[styles.optimizeKeywordsCtaText, { color: chrome.optimizeCtaText }]} numberOfLines={2}>
                {tcx('dashboard_seo_adjust_keywords')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {activeCard ? (
          <MetricPanel
            analytics={activeAnalytics}
            periodMode={periodMode}
            periodOffset={periodOffset}
            onChangePeriod={handleChangePeriod}
            onMovePeriod={handleMovePeriod}
            chrome={chrome}
            language={language}
          />
        ) : null}

        {activeCard && sessionUid && periodMode === 'year' ? (
          <Text
            style={[
              styles.rankEmptyText,
              { marginTop: -4, marginBottom: 8, paddingHorizontal: 4, color: chrome.textMuted, fontSize: 12 },
            ]}
          >
            {tcx('dashboard_metric_calendar_year_scope')}
          </Text>
        ) : null}

        <CollapsibleSection
          title={tcx('dashboard_iconodata_section_title')}
          icon="format-list-numbered"
          frameBg={chrome.collapsibleFrameBg}
          borderColor={chrome.collapsibleBorder}
          headerBg={chrome.collapsibleHeaderBg}
          titleColor={chrome.text}
          iconTint={chrome.iconGold}
          chevronTint={chrome.iconGold}
        >
          {topIconData.length ? (
            <>
              {topIconVisible.iconRows.map((row) => (
                <View key={row.key} style={styles.rankRow}>
                  <View style={styles.rankIcon}>
                    {row.iconUrl ? (
                      <ExpoImage source={{ uri: row.iconUrl }} style={styles.rankIconImage} contentFit="cover" />
                    ) : (
                      <MaterialCommunityIcons
                        name={row.iconName as keyof typeof MaterialCommunityIcons.glyphMap}
                        size={13}
                        color={chrome.iconGold}
                      />
                    )}
                  </View>
                  <Text style={[styles.rankLabel, { color: chrome.rankLabel }]} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <View style={[styles.rankTrack, { backgroundColor: chrome.rankTrackBg }]}>
                    <LinearGradient
                      colors={['rgba(47,123,255,0.95)', 'rgba(47,123,255,0.28)']}
                      style={[styles.rankFill, { width: `${row.percent}%` }]}
                    />
                  </View>
                  <Text style={[styles.rankClicks, { color: chrome.goldReadable }]}>{row.clicks}</Text>
                  <Text style={[styles.rankPct, { color: chrome.textMuted }]}>{row.percent}%</Text>
                </View>
              ))}
              {topIconVisible.showToggle ? (
                <TouchableOpacity
                  style={styles.rankSeeMoreRow}
                  onPress={() => setIconoDataExpanded((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    topIconVisible.toggleIsLess ? tcx('cards_stats_see_less') : tcx('cards_stats_see_more')
                  }
                >
                  <Text style={[styles.rankSeeMoreText, { color: chrome.goldReadable }]}>
                    {topIconVisible.toggleIsLess ? tcx('cards_stats_see_less') : tcx('cards_stats_see_more')}
                  </Text>
                  <MaterialCommunityIcons
                    name={topIconVisible.toggleIsLess ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={chrome.goldReadable}
                  />
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <Text style={[styles.rankEmptyText, { color: chrome.rankEmpty }]}>
              {tcx('dashboard_iconodata_empty')}
            </Text>
          )}
        </CollapsibleSection>

        {DASHBOARD_SHOW_SEO_INTEL_AND_RADAR ? (
        <CollapsibleSection
          title={tcx('dashboard_seo_intel_title')}
          icon="map-search-outline"
          frameBg={chrome.collapsibleFrameBg}
          borderColor={chrome.collapsibleBorder}
          headerBg={chrome.collapsibleHeaderBg}
          titleColor={chrome.text}
          iconTint={chrome.iconGold}
          chevronTint={chrome.iconGold}
        >
          <View style={[styles.seoConversionCard, { borderColor: chrome.seoCardBorder, backgroundColor: chrome.seoCardBg }]}>
            <View style={styles.seoHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.opportunityTitle, { color: chrome.opportunityTitle }]}>
                  {tcx('dashboard_seo_conversions_title')}
                </Text>
                <Text style={[styles.seoScopeText, { color: chrome.seoScopeMuted }]}>
                  {tcx('dashboard_seo_perform_prefix')}
                  {activeSeo?.locationLabel || tcx('dashboard_seo_combined_zone')}
                </Text>
              </View>
              <MaterialCommunityIcons name="chart-timeline-variant" size={20} color={chrome.iconGold} />
            </View>
            <Text style={[styles.seoTransparencyText, { color: chrome.seoTransparency }]}>
              {activeSeo?.locationSource === 'explorer'
                ? tcx('dashboard_seo_explorer_mode')
                : `${tcx('dashboard_seo_source_card_location')}${
                    activeSeo?.cardLocationUpdatedAt
                      ? ` · ${tcx('dashboard_seo_active_since')} ${new Date(activeSeo.cardLocationUpdatedAt).toLocaleDateString(intlLocaleTagForAppLanguage(language))}`
                      : ''
                  }.`}
            </Text>
            <View style={styles.seoExplorerRow}>
              <TextInput
                value={seoLocationQuery}
                onChangeText={setSeoLocationQuery}
                placeholder={tcx('dashboard_seo_explorer_placeholder')}
                placeholderTextColor={chrome.seoInputPlaceholder}
                style={[
                  styles.seoExplorerInput,
                  {
                    backgroundColor: chrome.seoInputBg,
                    borderColor: chrome.seoInputBorder,
                    color: chrome.seoInputText,
                  },
                ]}
                returnKeyType="search"
                onSubmitEditing={applySeoLocation}
              />
              <TouchableOpacity style={[styles.seoExplorerButton, { backgroundColor: chrome.gold }]} onPress={applySeoLocation} activeOpacity={0.84}>
                <MaterialCommunityIcons name="radar" size={16} color={chrome.explorerBtnIcon} />
              </TouchableOpacity>
              {seoLocationApplied ? (
                <TouchableOpacity style={styles.seoExplorerReset} onPress={resetSeoLocation} activeOpacity={0.84}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={16} color={chrome.seoExplorerResetFg} />
                </TouchableOpacity>
              ) : null}
            </View>
            {visibleSeoRows.length ? (
              <View style={styles.seoList}>
                <Text style={[styles.seoCtrLegend, { color: chrome.seoMutedLine }]}>
                  {tcx('dashboard_seo_ctr_legend')}
                </Text>
                {visibleSeoRows.map((row) => (
                  <View key={`${row.keywordRoot}-${row.keyword}`} style={styles.seoRow}>
                    <View style={styles.seoKeywordCol}>
                      <Text style={[styles.seoKeyword, { color: chrome.text }]} numberOfLines={1}>{row.keyword}</Text>
                      <Text style={[styles.seoRatio, { color: chrome.textSecondary }]}>
                        {row.myClicks} / {row.totalSearches}
                      </Text>
                    </View>
                    <View style={[styles.rankTrack, { backgroundColor: chrome.rankTrackBg }]}>
                      <LinearGradient
                        colors={['rgba(47,123,255,0.95)', 'rgba(47,123,255,0.28)']}
                        style={[styles.rankFill, { width: `${row.percent}%` }]}
                      />
                    </View>
                    <Text style={[styles.rankPct, { color: chrome.goldReadable }]}>{row.percent}%</Text>
                  </View>
                ))}
                {seoRows.length > 6 ? (
                  <TouchableOpacity
                    style={[
                      styles.showMoreButton,
                      { borderColor: chrome.collapsibleBorder, backgroundColor: chrome.nicheChipInactiveBg },
                    ]}
                    activeOpacity={0.82}
                    onPress={() => setSeoExpanded((prev) => !prev)}
                  >
                    <Text style={[styles.showMoreText, { color: chrome.optimizeCtaIcon }]}>
                      {seoExpanded ? tcx('dashboard_show_less') : tcx('dashboard_show_more')}
                    </Text>
                    <MaterialCommunityIcons
                      name={seoExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={chrome.optimizeCtaIcon}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.rankEmptyText, { color: chrome.rankEmpty }]}>
                {tcx('dashboard_seo_add_keywords_empty')}
              </Text>
            )}
            <TouchableOpacity style={[styles.keywordButton, { backgroundColor: chrome.gold }]} activeOpacity={0.82} onPress={() => setShowTopNicheKeyword((prev) => !prev)}>
              <Text style={[styles.keywordButtonText, { color: chrome.explorerBtnIcon }]}>{tcx('dashboard_top_niche_keyword')}</Text>
            </TouchableOpacity>
            {showTopNicheKeyword ? (
              <View style={[styles.topNicheBox, { borderColor: chrome.collapsibleBorder, backgroundColor: chrome.nicheChipInactiveBg }]}>
                <Text style={[styles.topNicheLabel, { color: chrome.textSecondary }]}>
                  {tcx('dashboard_suggested_keyword')}
                </Text>
                <Text style={[styles.topNicheWord, { color: chrome.opportunityTitle }]}>
                  {activeSeo?.topNicheKeyword || tcx('dashboard_not_enough_data')}
                </Text>
                <Text style={[styles.topNicheMeta, { color: chrome.textSecondary }]}>
                  {activeSeo?.topNicheKeyword
                    ? `${activeSeo.topNicheSearches} ${tcx('dashboard_niche_searches_suffix')}`
                    : tcx('dashboard_niche_waiting_body')}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.executiveRadarCard, { borderColor: chrome.seoCardBorder, backgroundColor: chrome.heatmapCardBg }]}>
            <LinearGradient
              colors={['rgba(47,123,255,0.18)', 'rgba(8,8,8,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Text style={[styles.executiveRadarEyebrow, { color: chrome.goldReadable }]}>
              {tcx('dashboard_geo_intel_eyebrow')}
            </Text>
            <Text style={[styles.executiveRadarTitle, { color: chrome.text }]}>
              {tcx('dashboard_executive_radar_title')}
            </Text>
            <Text style={[styles.executiveRadarPeriod, { color: chrome.textMuted }]}>
              {periodTitle(periodMode, periodOffset, language, tcx)}
            </Text>

            {studioWebBase ? (
              <View
                style={[
                  styles.marketRadarWebShell,
                  {
                    borderColor: isNight ? 'rgba(246,218,135,0.55)' : 'rgba(47,123,255,0.42)',
                    overflow: 'hidden',
                  },
                ]}
              >
                <LinearGradient
                  colors={
                    isNight
                      ? (['#1a1610', '#100e0a', '#060504'] as const)
                      : (['#f6f1e8', '#ece6da', '#e2dcd0'] as const)
                  }
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View
                  style={[StyleSheet.absoluteFillObject, styles.marketRadarPlaceholderWatermarkWrap]}
                  pointerEvents="none"
                  accessibilityElementsHidden
                >
                  <View style={styles.marketRadarPlaceholderRadarCore}>
                    {[240, 175, 112].map((d) => (
                      <View
                        key={`ring-${d}`}
                        style={[
                          styles.marketRadarPlaceholderRing,
                          {
                            width: d,
                            height: d,
                            borderRadius: d / 2,
                            borderColor: isNight ? 'rgba(246,218,135,0.12)' : 'rgba(180,145,60,0.16)',
                          },
                        ]}
                      />
                    ))}
                    <LucideMap
                      size={198}
                      color={isNight ? 'rgba(246,218,135,0.07)' : 'rgba(100,78,28,0.1)'}
                      strokeWidth={1}
                    />
                  </View>
                </View>
                <View style={styles.marketRadarPlaceholderContent} pointerEvents="none">
                  <View
                    style={[
                      styles.marketRadarPlaceholderIconRing,
                      {
                        borderColor: isNight ? 'rgba(246,218,135,0.5)' : 'rgba(47,123,255,0.45)',
                        backgroundColor: isNight ? 'rgba(8,8,8,0.42)' : 'rgba(255,252,248,0.72)',
                      },
                    ]}
                  >
                    <LucideMap size={36} color={chrome.iconGold} strokeWidth={1.6} />
                  </View>
                  <Text style={[styles.marketRadarPlaceholderTitle, { color: chrome.text }]}>
                    {tcx('dashboard_market_radar_full_title')}
                  </Text>
                  <Text style={[styles.marketRadarPlaceholderSubtitle, { color: chrome.textSecondary }]}>
                    {tcx('dashboard_market_radar_full_subtitle')}
                  </Text>
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.marketRadarWebShell,
                  styles.marketRadarMissingShell,
                  { borderColor: chrome.collapsibleBorder, backgroundColor: chrome.nicheChipInactiveBg },
                ]}
              >
                <MaterialCommunityIcons name="radar" size={32} color={chrome.iconGold} />
                <Text style={[styles.marketRadarMissingText, { color: chrome.textSecondary }]}>
                  {tcx('dashboard_radar_unavailable_build')}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.launchCommandButton,
                (!studioWebBase || launchingRadar) && styles.launchCommandButtonDisabled,
              ]}
              onPress={launchCommandCenter}
              disabled={!studioWebBase || launchingRadar}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={
                radarLaunchBlockedByPro
                  ? tcx('dashboard_radar_pro_required_a11y')
                  : tcx('dashboard_radar_explore_full_a11y')
              }
            >
              <LinearGradient
                colors={
                  studioWebBase ? ['#4D8FFF', chrome.gold, '#6235E0'] : ['rgba(150,120,60,0.4)', 'rgba(80,60,30,0.4)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.launchCommandGradient}
              >
                {launchingRadar ? (
                  <ActivityIndicator size="small" color="#1B1205" />
                ) : (
                  <Maximize2 size={18} color="#1B1205" strokeWidth={2.2} />
                )}
                <Text style={styles.launchCommandText} numberOfLines={2}>
                  {radarLaunchBlockedByPro
                    ? tcx('dashboard_radar_cta_pro_required')
                    : tcx('dashboard_radar_cta_explore')}
                </Text>
                <MaterialCommunityIcons name="arrow-top-right" size={16} color="#1B1205" />
              </LinearGradient>
            </TouchableOpacity>

            <Text style={[styles.executiveRadarOriginCaption, { color: chrome.textMuted, marginTop: 6 }]} numberOfLines={4}>
              {studioWebBase
                ? radarLaunchBlockedByPro
                  ? tcx('dashboard_radar_footer_pro')
                  : tcx('dashboard_radar_footer_mapbox')
                : tcx('dashboard_radar_unavailable_build')}
            </Text>
          </View>
        </CollapsibleSection>
        ) : null}

        <CollapsibleSection
          title={tcx('dashboard_legacy_path_title')}
          icon="diamond-stone"
          defaultOpen
          frameBg={chrome.collapsibleFrameBg}
          borderColor={chrome.collapsibleBorder}
          headerBg={chrome.collapsibleHeaderBg}
          titleColor={chrome.text}
          iconTint={chrome.iconGold}
          chevronTint={chrome.iconGold}
        >
          <LegacyPathGoalsSection
            referralsCurrent={legacyLive.referralsCount}
            referralsCeiling={LEGACY_REFERRALS_CEILING_UI}
            palette={{
              legacyTitleColor: chrome.legacyTitle,
              legacyBodyColor: chrome.legacyBody,
              rankTrackBg: chrome.rankTrackBg,
              medalLabelColor: chrome.medalLabel,
              textMuted: chrome.textMuted,
            }}
          />
        </CollapsibleSection>
      </ScrollView>
      <MarketRadarWebView
        url={radarWebViewUrl ?? ''}
        visible={Boolean(radarWebViewUrl)}
        onClose={() => setRadarWebViewUrl(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: 16,
  },
  headerFrame: {
    borderWidth: 1,
    borderRadius: 18,
    shadowOpacity: 0.78,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
    overflow: 'hidden',
  },
  headerInner: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  hello: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  plan: {
    color: 'transparent',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  expirationBadge: {
    maxWidth: 168,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowOpacity: 0.85,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  badgeGlowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  expirationStatus: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  expirationText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 8.5,
    fontWeight: '800',
    marginTop: 1,
  },
  carouselShell: {
    marginTop: 14,
    marginHorizontal: -16,
  },
  carouselContent: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  dashboardCardItem: {
    minHeight: 104,
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  cardItem: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'relative',
    minHeight: 90,
  },
  cardRowInner: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
    paddingRight: 28,
  },
  businessCardListInner: {
    alignItems: 'stretch',
  },
  businessCardRowInner: {
    paddingRight: 2,
    paddingLeft: 6,
  },
  businessListMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  cardTitle: {
    color: '#2F7BFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  businessListTitle: {
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  businessListSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'left',
  },
  businessListLogo: {
    width: 70,
    height: 70,
    borderRadius: 15,
    borderWidth: 1,
  },
  businessListLogoPh: {
    width: 70,
    height: 70,
    borderRadius: 15,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessListTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  businessCardStatsRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  marketControl: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  marketSwitchLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  premiumToggleShell: {
    width: 52,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
  },
  premiumToggleShellOn: {
    shadowOpacity: 0.52,
    shadowRadius: 9,
  },
  premiumToggleShellOff: {
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  premiumToggleDisabled: {
    opacity: 0.6,
  },
  premiumToggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  premiumToggleKnobOn: {
    alignSelf: 'flex-end',
    shadowOpacity: 0.9,
    shadowRadius: 7,
  },
  premiumToggleKnobOff: {
    alignSelf: 'flex-start',
  },
  premiumToggleKnobShine: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginLeft: 4,
    marginTop: 3,
  },
  loadingBox: {
    marginTop: 16,
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.74)',
    fontWeight: '700',
  },
  emptyDashboardBox: {
    marginTop: 16,
    minHeight: 132,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 8,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 6,
  },
  emailSignatureRow: {
    paddingHorizontal: 4,
    marginBottom: 12,
    alignItems: 'stretch',
  },
  emailSignatureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
  },
  emailSignatureBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  pageDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  pageDotActive: {
    width: 18,
  },
  blockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  blockTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  optimizeKeywordsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '56%',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(246,220,150,0.55)',
    backgroundColor: 'rgba(6,6,6,0.72)',
  },
  optimizeKeywordsCtaText: {
    flex: 1,
    color: '#FCECC0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: 13,
  },
  nicheDemandFilterLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,226,174,0.88)',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 2,
  },
  marketGapBanner: {
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.28)',
    backgroundColor: 'rgba(47,123,255,0.06)',
    marginBottom: 10,
  },
  marketGapTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    color: '#F8E6A2',
    marginBottom: 5,
  },
  marketGapBody: {
    fontSize: 10,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '600',
  },
  analyticsGrid: {
    marginBottom: 12,
  },
  analyticsCard: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.25)',
    padding: 10,
  },
  analyticsCardFull: {
    width: '100%',
    minHeight: 260,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionKicker: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  clickRateChip: {
    minWidth: 68,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignItems: 'center',
  },
  clickRateChipLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  clickRateChipValue: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 1,
  },
  periodTabs: {
    flexDirection: 'row',
    marginTop: 8,
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  periodTab: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    paddingVertical: 5,
    alignItems: 'center',
  },
  periodTabActive: {
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 2,
  },
  periodTabText: {
    fontSize: 9,
    fontWeight: '800',
  },
  periodNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  periodArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  bigMetric: {
    fontSize: 28,
    fontWeight: '900',
    marginTop: 3,
  },
  chartBox: {
    marginTop: 4,
    overflow: 'hidden',
    borderRadius: 10,
  },
  chartGrid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-around',
  },
  gridLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  chartBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 4,
    paddingBottom: 18,
  },
  barSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '78%',
    borderRadius: 999,
  },
  chartLabels: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 1,
    flexDirection: 'row',
    gap: 1,
  },
  chartLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.43)',
    fontSize: 7,
    fontWeight: '700',
    textAlign: 'center',
  },
  noViewsBox: {
    flex: 1,
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  noViewsText: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 17,
  },
  metricsEmptyState: {
    minHeight: 150,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  metricsEmptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsEmptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 10,
    letterSpacing: 0.2,
  },
  analyticsErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  analyticsErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  analyticsRetryText: {
    fontSize: 12,
    fontWeight: '800',
  },
  metricsEmptyText: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 5,
  },
  collapsibleFrame: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.24)',
    borderRadius: 14,
    marginTop: 10,
    overflow: 'hidden',
  },
  collapsibleHeader: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  collapsibleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsibleTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  collapsibleBody: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(47,123,255,0.18)',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
    gap: 8,
  },
  rankSeeMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 36,
    marginTop: 4,
  },
  rankSeeMoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  rankIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(47,123,255,0.14)',
    overflow: 'hidden',
  },
  rankIconImage: {
    width: '100%',
    height: '100%',
  },
  rankLabel: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 11,
    fontWeight: '700',
    width: 104,
  },
  rankTrack: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rankFill: {
    height: '100%',
    borderRadius: 999,
  },
  rankClicks: {
    width: 28,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rankPct: {
    width: 34,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rankEmptyText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
    paddingVertical: 10,
  },
  seoConversionCard: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(47,123,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.3)',
  },
  executiveRadarCard: {
    marginTop: 14,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: 'rgba(5,5,5,0.86)',
    borderWidth: 1.5,
    borderColor: 'rgba(47,123,255,0.5)',
    overflow: 'hidden',
    shadowColor: SHELL_ACCENT_GOLD,
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    position: 'relative',
  },
  executiveRadarEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  executiveRadarTitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  executiveRadarPeriod: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  marketRadarWebShell: {
    marginTop: 14,
    height: 432,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    shadowColor: SHELL_ACCENT_GOLD,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
    position: 'relative',
  },
  marketRadarPlaceholderContent: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 22,
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketRadarPlaceholderWatermarkWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketRadarPlaceholderRadarCore: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketRadarPlaceholderRing: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  marketRadarPlaceholderIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: SHELL_ACCENT_GOLD,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  marketRadarPlaceholderTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.35,
  },
  marketRadarPlaceholderSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 300,
    paddingHorizontal: 6,
    opacity: 0.92,
  },
  marketRadarWebView: {
    flex: 1,
    width: '100%',
    minHeight: 320,
    backgroundColor: 'transparent',
  },
  marketRadarWebLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(5,5,5,0.65)',
    zIndex: 2,
  },
  marketRadarWebLoadingText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  marketRadarMissingShell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    gap: 12,
    height: 220,
    shadowOpacity: 0,
    elevation: 0,
  },
  marketRadarMissingText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  executiveRadarBody: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  executiveRadarChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  executiveRadarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  executiveRadarChipText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  launchCommandButton: {
    marginTop: 16,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: SHELL_ACCENT_GOLD,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  launchCommandButtonDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
  },
  launchCommandGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  launchCommandText: {
    flexShrink: 1,
    color: '#1B1205',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  executiveRadarOriginCaption: {
    marginTop: 10,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  executiveRadarHint: {
    marginTop: 6,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 14,
  },
  opportunityTitle: {
    color: '#F8E6A2',
    fontWeight: '900',
    fontSize: 13,
  },
  seoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  seoScopeText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },
  seoTransparencyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 8,
  },
  seoExplorerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
  },
  seoExplorerInput: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.28)',
    backgroundColor: 'rgba(0,0,0,0.24)',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 11,
  },
  seoExplorerButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  seoExplorerReset: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(246,218,135,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  seoList: {
    marginTop: 10,
    gap: 8,
  },
  seoCtrLegend: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    marginBottom: 2,
    letterSpacing: 0.1,
  },
  seoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 30,
    gap: 8,
  },
  seoKeywordCol: {
    flex: 1,
    minWidth: 0,
  },
  seoKeyword: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '800',
  },
  seoRatio: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  showMoreButton: {
    alignSelf: 'center',
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.24)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  showMoreText: {
    color: '#F8E6A2',
    fontSize: 10,
    fontWeight: '900',
  },
  opportunityBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  keywordButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  keywordButtonText: {
    color: '#1B1205',
    fontWeight: '900',
    fontSize: 11,
  },
  topNicheBox: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(246,218,135,0.24)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    padding: 12,
  },
  topNicheLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  topNicheWord: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 3,
    textTransform: 'capitalize',
  },
  topNicheMeta: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 5,
  },
});
