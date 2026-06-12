/**
 * Carrusel de bienvenida (primera sesión o nueva versión de onboarding).
 * Estética alineada al landing corporativo: negro, oro y sans geométrico (system UI).
 */
import { CURRENT_ONBOARDING_VERSION } from '@/constants/onboarding';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { auth, db } from '@/services/firebaseConfig';
import { type CoreLocaleKey, coreT, useAppLanguage } from '@/services/coreI18n';
import type { AppLanguage } from '@/services/language';
import { writeOnboardingDoneToStorage } from '@/services/onboardingStorage';
import { Image } from 'expo-image';
import * as Localization from 'expo-localization';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  FlatList,
  type ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND_MARK = 'Card-Social';

/** Ilustraciones servidas por el API (admin / uploads). */
const ONBOARDING_IMAGE = {
  slide0:
    'https://card-social-api.azurewebsites.net/uploads/1779051178684_63397578-4725-4bf7-8516-29761efd4113.jpg',
  vault:
    'https://card-social-api.azurewebsites.net/uploads/1779050603239_3f44c3d5-d3f1-4f7e-870b-1c353929282f.png',
  /** Smart Card — pantalla My Cards / Create. */
  cardHub:
    'https://card-social-api.azurewebsites.net/uploads/1779050662335_bcb107ae-1154-4fd7-ae76-69ac65f0497f.png',
  businessCard:
    'https://card-social-api.azurewebsites.net/uploads/1779050691451_1d87dedc-fb50-43ca-bccd-2b1021bae221.png',
  qrScanner:
    'https://card-social-api.azurewebsites.net/uploads/1779053106666_2bc771e3-f4a3-4593-b4f3-0b8c9470f75e.jpg',
  socialMarket:
    'https://card-social-api.azurewebsites.net/uploads/1779050714619_c2edde5d-74dd-4337-83b2-b6362a14d439.png',
  skinForge:
    'https://card-social-api.azurewebsites.net/uploads/1779053059148_5df9cfbd-b64f-4e2a-9ef0-863bdfe2cd25.jpg',
  localMarket:
    'https://card-social-api.azurewebsites.net/uploads/1779053141606_d8095987-9c93-44b5-92ab-0fffe6df2c78.jpg',
  slideLast:
    'https://card-social-api.azurewebsites.net/uploads/1779051306659_c8b70169-61aa-403c-82e6-27e6eb067d92.jpg',
} as const;

/** Paleta hero landing (oscuro + acento oro). */
const L = {
  bg: '#000000',
  text: '#FFFFFF',
  textMuted: '#B8B8B8',
  gold: '#2F7BFF',
  goldDeep: '#C9A227',
  goldGlow: 'rgba(47, 123, 255, 0.45)',
  hairline: 'rgba(255,255,255,0.12)',
};

type SlideDef = {
  id: string;
  imageUri: string;
  titleKey: CoreLocaleKey;
  bodyKey: CoreLocaleKey;
  /** Slide 0: título dos tonos + cuerpo con eyebrow (primer párrafo). */
  variant: 'welcome' | 'standard';
};

const SLIDES: SlideDef[] = [
  {
    id: 'welcome',
    imageUri: ONBOARDING_IMAGE.slide0,
    titleKey: 'onboarding_slide_0_title',
    bodyKey: 'onboarding_slide_0_body',
    variant: 'welcome',
  },
  {
    id: 'vault',
    imageUri: ONBOARDING_IMAGE.vault,
    titleKey: 'onboarding_slide_1_title',
    bodyKey: 'onboarding_slide_1_body',
    variant: 'standard',
  },
  {
    id: 'icondatas',
    imageUri: ONBOARDING_IMAGE.cardHub,
    titleKey: 'onboarding_slide_2_title',
    bodyKey: 'onboarding_slide_2_body',
    variant: 'standard',
  },
  {
    id: 'cards',
    imageUri: ONBOARDING_IMAGE.qrScanner,
    titleKey: 'onboarding_slide_3_title',
    bodyKey: 'onboarding_slide_3_body',
    variant: 'standard',
  },
  {
    id: 'business',
    imageUri: ONBOARDING_IMAGE.businessCard,
    titleKey: 'onboarding_slide_4_title',
    bodyKey: 'onboarding_slide_4_body',
    variant: 'standard',
  },
  {
    id: 'market',
    imageUri: ONBOARDING_IMAGE.socialMarket,
    titleKey: 'onboarding_slide_5_title',
    bodyKey: 'onboarding_slide_5_body',
    variant: 'standard',
  },
  {
    id: 'identity',
    imageUri: ONBOARDING_IMAGE.skinForge,
    titleKey: 'onboarding_slide_6_title',
    bodyKey: 'onboarding_slide_6_body',
    variant: 'standard',
  },
  {
    id: 'demand',
    imageUri: ONBOARDING_IMAGE.localMarket,
    titleKey: 'onboarding_slide_7_title',
    bodyKey: 'onboarding_slide_7_body',
    variant: 'standard',
  },
  {
    id: 'arsenal',
    imageUri: ONBOARDING_IMAGE.slideLast,
    titleKey: 'onboarding_slide_8_title',
    bodyKey: 'onboarding_slide_8_body',
    variant: 'standard',
  },
];

function splitWelcomeTitle(full: string): { lead: string; brand: string | null } {
  const idx = full.lastIndexOf(BRAND_MARK);
  if (idx < 0) return { lead: full, brand: null };
  return { lead: full.slice(0, idx).trimEnd(), brand: BRAND_MARK };
}

function onboardingBodyWithDistance(body: string, distanceText: string): string {
  return body.includes('{{distance}}') ? body.replace('{{distance}}', distanceText) : body;
}

function WelcomeHeadline({ language }: { language: AppLanguage }) {
  const full = coreT('onboarding_slide_0_title', language);
  const { lead, brand } = splitWelcomeTitle(full);
  return (
    <View style={styles.titleCluster}>
      <Text style={styles.headlineWhite} accessibilityRole="header">
        {brand ? (
          <>
            {lead}
            {'\n'}
            <Text style={styles.headlineGold}>{brand}</Text>
          </>
        ) : (
          full
        )}
      </Text>
    </View>
  );
}

function WelcomeBodyCopy({ language }: { language: AppLanguage }) {
  const raw = coreT('onboarding_slide_0_body', language);
  const parts = raw.split('\n\n');
  const eyebrow = parts[0] ?? '';
  const rest = parts.length > 1 ? parts.slice(1).join('\n\n') : '';

  return (
    <>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      {rest.length > 0 ? (
        <Text style={styles.bodyWelcome}>{rest}</Text>
      ) : null}
    </>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const language = useAppLanguage();
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;

  const isMetric = Localization.getLocales()[0]?.measurementSystem === 'metric';
  const distanceText = isMetric ? '40 kilómetros' : '25 millas';

  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const listRef = useRef<FlatList<SlideDef>>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / width);
      setIndex(Math.max(0, Math.min(next, SLIDES.length - 1)));
    },
    [width],
  );

  const goNext = useCallback(() => {
    const next = Math.min(index + 1, SLIDES.length - 1);
    if (next === index) return;
    listRef.current?.scrollToOffset({ offset: next * width, animated: true });
    setIndex(next);
  }, [index, width]);

  const remindLater = useCallback(() => {
    router.replace('/(tabs)/cards');
  }, [router]);

  const finish = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || finishing) return;
    setFinishing(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        onboardingVersion: CURRENT_ONBOARDING_VERSION,
      });
      await writeOnboardingDoneToStorage();
      // Apagar el indicador de carga antes de la redirección (evita choque visual / pantalla en blanco).
      setFinishing(false);
      router.replace('/(tabs)/cards');
    } catch (e) {
      console.warn('[onboarding] finish failed', e);
      setFinishing(false);
    }
  }, [finishing, router]);

  const renderItem: ListRenderItem<SlideDef> = useCallback(
    ({ item }) => (
      <View style={[styles.slide, { width }]}>
        <Image
          source={{ uri: item.imageUri }}
          style={item.variant === 'welcome' ? styles.heroWelcome : styles.hero}
          contentFit="cover"
          transition={200}
        />
        <ScrollView
          style={styles.copyScroll}
          {...verticalScrollInteractionProps}
          contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.copyScrollContent]}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {item.variant === 'welcome' ? (
            <>
              <WelcomeHeadline language={language} />
              <WelcomeBodyCopy language={language} />
            </>
          ) : (
            <>
              <Text style={styles.titleStandard}>{coreT(item.titleKey, language)}</Text>
              <Text style={styles.bodyStandard}>
                {onboardingBodyWithDistance(coreT(item.bodyKey, language), distanceText)}
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    ),
    [language, width, distanceText],
  );

  const isLast = index >= SLIDES.length - 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: L.bg }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarSpacer} />
        <Text style={styles.wordmark}>CARD-SOCIAL</Text>
        <View style={[styles.topBarSpacer, styles.topBarSpacerEnd]}>
          <Pressable
            onPress={() => void finish()}
            disabled={finishing}
            accessibilityRole="button"
            accessibilityLabel={coreT('onboarding_a11y_close', language)}
            hitSlop={12}
            style={({ pressed }) => [styles.closePressable, { opacity: pressed || finishing ? 0.55 : 1 }]}
          >
            <Text style={styles.closeGlyph}>×</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={SLIDES.length}
        windowSize={SLIDES.length + 1}
      />

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View
              key={s.id}
              style={[styles.dot, { backgroundColor: i === index ? L.gold : 'rgba(255,255,255,0.25)' }]}
            />
          ))}
        </View>

        {!isLast ? (
          <View style={styles.ctaRow}>
            <Pressable
              onPress={() => void finish()}
              disabled={finishing}
              style={({ pressed }) => [
                styles.skipPressable,
                styles.ctaTertiaryFlex,
                { opacity: pressed || finishing ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.skipText} numberOfLines={2}>
                {coreT('onboarding_cta_skip', language)}
              </Text>
            </Pressable>
            <Pressable
              onPress={remindLater}
              disabled={finishing}
              style={({ pressed }) => [
                styles.remindPressable,
                styles.ctaTertiaryFlex,
                { opacity: pressed || finishing ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.remindText} numberOfLines={2}>
                {coreT('onboarding_cta_remind_later', language)}
              </Text>
            </Pressable>
            <Pressable
              onPress={goNext}
              style={({ pressed }) => [styles.ctaPressable, styles.ctaPrimaryFlex, { opacity: pressed ? 0.92 : 1 }]}
            >
              <LinearGradient
                colors={[L.gold, '#FFD569']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>{coreT('onboarding_cta_next', language)}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => void finish()}
            disabled={finishing}
            style={({ pressed }) => [styles.ctaPressable, { opacity: pressed || finishing ? 0.85 : 1 }]}
          >
            <LinearGradient
              colors={[L.gold, '#FFD569']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.ctaGradient}
            >
              {finishing ? (
                <ActivityIndicator color="#1C1C1E" />
              ) : (
                <Text style={styles.ctaText}>{coreT('onboarding_cta_start', language)}</Text>
              )}
            </LinearGradient>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  topBarSpacer: {
    flex: 1,
    minWidth: 40,
  },
  topBarSpacerEnd: {
    alignItems: 'flex-end',
  },
  wordmark: {
    color: L.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3.2,
    textAlign: 'center',
  },
  closePressable: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: {
    color: L.textMuted,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
    marginTop: -2,
  },
  slide: { flex: 1, backgroundColor: L.bg },
  hero: {
    width: '100%',
    height: 160,
    opacity: 0.95,
  },
  heroWelcome: {
    width: '100%',
    height: 120,
    opacity: 0.9,
  },
  copyScroll: {
    flex: 1,
  },
  copyScrollContent: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: 'center',
    flexGrow: 1,
  },
  titleCluster: {
    marginBottom: 18,
    alignSelf: 'stretch',
  },
  headlineWhite: {
    color: L.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  headlineGold: {
    color: L.gold,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  eyebrow: {
    color: L.gold,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    lineHeight: 18,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  bodyWelcome: {
    color: L.textMuted,
    fontSize: 15,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 24,
    alignSelf: 'stretch',
    width: '100%',
    letterSpacing: 0.1,
  },
  titleStandard: {
    color: L.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 32,
    letterSpacing: -0.6,
    marginBottom: 14,
    alignSelf: 'stretch',
  },
  bodyStandard: {
    color: L.textMuted,
    fontSize: 15,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 24,
    alignSelf: 'stretch',
    width: '100%',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: L.hairline,
    backgroundColor: L.bg,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  ctaTertiaryFlex: {
    flex: 1,
    minWidth: 0,
  },
  skipPressable: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: L.hairline,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 52,
  },
  remindPressable: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(47, 123, 255, 0.35)',
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 52,
  },
  skipText: {
    color: L.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  remindText: {
    color: L.gold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  ctaPrimaryFlex: {
    flex: 1.35,
    minWidth: 0,
  },
  ctaPressable: {
    borderRadius: 999,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: L.goldDeep,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  ctaGradient: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
