import {
    dismissPremiumDataPanel,
    type PremiumDataPanelPayload,
    subscribePremiumDataPanel,
} from '@/services/premiumDataPanelController';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
import { splitSovereignText } from '@/utils/sovereignTextSplit';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    BackHandler,
    Dimensions,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

const ACCENT = '#C9A227';
const SHEET_BG = '#101014';
const TEXT_MAIN = '#F4F4F5';
const TEXT_MUTED = '#A1A1AA';

const { height: SCREEN_H } = Dimensions.get('window');

export default function PremiumDataPanelHost() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const tr = useCallback(
    (es: string, en: string) => coreTrEsEn(es, en, language),
    [language],
  );
  const [payload, setPayload] = useState<PremiumDataPanelPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slide = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    return subscribePremiumDataPanel((p) => {
      setPayload(p);
      setCopied(false);
      if (p) {
        slide.setValue(SCREEN_H);
        Animated.spring(slide, {
          toValue: 0,
          useNativeDriver: true,
          tension: 68,
          friction: 12,
        }).start();
      } else {
        Animated.timing(slide, {
          toValue: SCREEN_H,
          duration: 220,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [slide]);

  const close = useCallback(() => {
    dismissPremiumDataPanel();
  }, []);

  const handleCopy = useCallback(async (text: string) => {
    const t = String(text || '').trim();
    if (!t) return;
    try {
      await Clipboard.setStringAsync(t);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }, []);

  const visible = Boolean(payload);
  const p = payload;
  const copySource = p?.copyText ?? p?.body ?? '';
  const showCopy = !p?.hideCopy && Boolean(copySource.trim());
  const backdropDismiss = !p || p.dismissOnBackdropPress !== false;

  // Android hardware back button
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backdropDismiss) { close(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [visible, backdropDismiss, close]);

  if (!visible) return null;

  const isSovereign = Boolean(
    p && p.presentation === 'sovereign-text' && p.body != null,
  );
  const copySovereign = String(p?.copyText ?? p?.body ?? '');
  const showCopySovereign = !p?.hideCopy && Boolean(copySovereign.trim());
  const closeLabelSovereign =
    p?.actions?.find((a) => a.variant === 'secondary' || a.label.toLowerCase().includes('cerrar'))?.label ??
    tr('Cerrar', 'Close');

  const sovereign = isSovereign && p ? (
    <View style={styles.sovereignRoot}>
      <Pressable style={StyleSheet.absoluteFill} onPress={backdropDismiss ? close : undefined} />
      <Animated.View
        style={[
          styles.sovereignCard,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 24),
            transform: [{ translateY: slide }],
          },
        ]}
      >
        <View style={styles.sovereignTopAccent} />
        <ScrollView
          style={styles.sovereignScroll}
          {...verticalScrollInteractionProps}
          contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.sovereignScrollContent]}
        >
          {(() => {
            const { headline, body: bodyRest } = splitSovereignText(String(p.body || ''));
            if (headline && bodyRest) {
              return (
                <>
                  <Text style={styles.sovereignTitle} selectable>
                    {headline}
                  </Text>
                  <Text style={styles.sovereignBody} selectable>
                    {bodyRest}
                  </Text>
                </>
              );
            }
            if (headline) {
              return (
                <Text style={styles.sovereignTitle} selectable>
                  {headline}
                </Text>
              );
            }
            return (
              <Text style={styles.sovereignBody} selectable>
                {bodyRest || '—'}
              </Text>
            );
          })()}
        </ScrollView>
        <View style={styles.sovereignBar}>
          <Pressable onPress={close} hitSlop={12} style={styles.sovereignBarBtn}>
            <Text style={styles.sovereignCloseTxt}>{closeLabelSovereign}</Text>
          </Pressable>
          {showCopySovereign ? (
            <Pressable
              onPress={() => void handleCopy(copySovereign)}
              hitSlop={12}
              style={styles.sovereignBarBtn}
            >
              <MaterialCommunityIcons
                name={copied ? 'check-circle' : 'content-copy'}
                size={16}
                color={copied ? '#86efac' : ACCENT}
              />
              <Text style={styles.sovereignCopyTxt}>
                {copied ? tr('Copiado', 'Copied') : tr('Copiar', 'Copy')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  ) : null;

  const defaultSheet = !isSovereign ? (
    <View style={styles.root}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={backdropDismiss ? close : undefined}
      />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 20) + 8,
              transform: [{ translateY: slide }],
            },
          ]}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          {p ? (
            <>
              <View style={styles.headerRow}>
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons
                    name={(p.icon as any) || 'text-box-outline'}
                    size={28}
                    color={ACCENT}
                  />
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.title} numberOfLines={2}>
                    {p.title}
                  </Text>
                  {p.email ? <Text style={styles.emailLine}>{p.email}</Text> : null}
                </View>
              </View>

              {p.emailOptions && p.emailOptions.length > 0 ? (
                <ScrollView
                  style={styles.emailScroll}
                  {...verticalScrollInteractionProps}
                  contentContainerStyle={SCROLL_CONTENT_MIN_FILL}
                >
                  {p.emailOptions.map((row) => (
                    <TouchableOpacity
                      key={row.key}
                      style={styles.emailRow}
                      onPress={() => {
                        row.onPress();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.emailRowLabel}>{row.label}</Text>
                      <MaterialCommunityIcons name="chevron-right" size={22} color={TEXT_MUTED} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : p.body ? (
                <ScrollView
                  style={styles.bodyScroll}
                  {...verticalScrollInteractionProps}
                  contentContainerStyle={SCROLL_CONTENT_MIN_FILL}
                >
                  <Text style={styles.body} selectable>
                    {p.body}
                  </Text>
                </ScrollView>
              ) : null}

              {showCopy ? (
                <TouchableOpacity
                  style={[styles.copyBtn, copied && styles.copyBtnDone]}
                  onPress={() => void handleCopy(copySource)}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons
                    name={copied ? 'check-circle' : 'content-copy'}
                    size={20}
                    color={copied ? '#22c55e' : ACCENT}
                  />
                  <Text style={[styles.copyBtnText, copied && styles.copyBtnTextDone]}>
                    {copied ? tr('Copiado', 'Copied') : tr('Copiar al portapapeles', 'Copy to clipboard')}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {p.actions && p.actions.length > 0 ? (
                <View style={styles.actions}>
                  {p.actions.map((a, i) => {
                    const isPrimary = a.variant === 'primary' || (!a.variant && i === 0);
                    const isDest = a.variant === 'destructive';
                    return (
                      <TouchableOpacity
                        key={`${a.label}-${i}`}
                        style={[
                          styles.actionBtn,
                          isPrimary && styles.actionPrimary,
                          isDest && styles.actionDestructive,
                          !isPrimary && !isDest && styles.actionSecondary,
                        ]}
                        onPress={() => {
                          a.onPress();
                        }}
                        activeOpacity={0.88}
                      >
                        <Text
                          style={[
                            styles.actionLabel,
                            isPrimary && styles.actionLabelOnPrimary,
                            isDest && styles.actionLabelDestructive,
                            !isPrimary && !isDest && styles.actionLabelSecondary,
                          ]}
                        >
                          {a.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : p.emailOptions && p.emailOptions.length > 0 ? null : (
                <TouchableOpacity style={styles.closeOnly} onPress={close} activeOpacity={0.88}>
                  <Text style={styles.closeOnlyText}>{tr('Cerrar', 'Close')}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}
        </Animated.View>
    </View>
  ) : null;

  const content = isSovereign ? sovereign : defaultSheet;

  /**
   * iOS: `FullWindowOverlay` crea un UIWindow nativo encima de TODOS los
   * Modal (incluyendo `MyCardsPreviewModal`, `SmartCardMirrorModal`, etc.).
   *
   * Android: los Modal RN son Dialog nativos con ventana propia — un `View`
   * absoluto en el árbol padre NO puede pintarse encima de un Modal hijo.
   * Antes el comentario decía lo contrario y el sheet se abría DEBAJO del
   * modal de tarjeta al tocar un iconData en Contactos. Solución: envolverlo
   * en su propio `Modal` con `statusBarTranslucent` para que Android lo
   * coloque por encima del modal padre.
   */
  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{content}</FullWindowOverlay>;
  }
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={backdropDismiss ? close : undefined}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 99999,
    elevation: 99999,
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 6,
    maxHeight: SCREEN_H * 0.88,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,162,39,0.35)',
  },
  grabberWrap: { alignItems: 'center', paddingVertical: 8 },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(201,162,39,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,162,39,0.35)',
  },
  headerText: { flex: 1 },
  title: {
    color: TEXT_MAIN,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  emailLine: {
    color: TEXT_MUTED,
    fontSize: 15,
    marginTop: 6,
  },
  bodyScroll: { maxHeight: SCREEN_H * 0.36, marginBottom: 12 },
  body: {
    color: TEXT_MAIN,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  emailScroll: { maxHeight: SCREEN_H * 0.4, marginBottom: 8 },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  emailRowLabel: { color: TEXT_MAIN, fontSize: 16, flex: 1 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,162,39,0.45)',
    marginBottom: 14,
    backgroundColor: 'rgba(201,162,39,0.06)',
  },
  copyBtnDone: {
    borderColor: 'rgba(34,197,94,0.5)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  copyBtnText: { color: ACCENT, fontSize: 16, fontWeight: '600' },
  copyBtnTextDone: { color: '#86efac', fontWeight: '600' },
  actions: { gap: 10 },
  actionBtn: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  actionPrimary: {
    backgroundColor: ACCENT,
  },
  actionSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  actionDestructive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.45)',
  },
  actionLabel: { fontSize: 16, fontWeight: '600' },
  actionLabelOnPrimary: { color: '#0a0a0a' },
  actionLabelSecondary: { color: TEXT_MAIN },
  actionLabelDestructive: { color: '#fca5a5' },
  closeOnly: {
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  closeOnlyText: { color: TEXT_MUTED, fontSize: 16, fontWeight: '500' },
  sovereignRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 99999,
    elevation: 99999,
  },
  sovereignCard: {
    flex: 1,
    marginHorizontal: 20,
    marginVertical: 12,
    backgroundColor: '#000000',
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201, 162, 39, 0.45)',
    paddingHorizontal: 22,
    maxHeight: SCREEN_H * 0.92,
  },
  sovereignTopAccent: {
    position: 'absolute',
    top: 0,
    left: 22,
    right: 22,
    height: 1,
    backgroundColor: 'rgba(201, 162, 39, 0.35)',
  },
  sovereignScroll: { flex: 1 },
  sovereignScrollContent: {
    flexGrow: 1,
    paddingTop: 12,
    paddingBottom: 8,
    justifyContent: 'flex-start',
  },
  sovereignTitle: {
    color: ACCENT,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 32,
    marginBottom: 20,
    textAlign: 'center',
    ...Platform.select({
      ios: { fontFamily: 'Georgia' },
      android: { fontFamily: 'serif' },
      default: {},
    }),
  },
  sovereignBody: {
    color: 'rgba(244, 244, 245, 0.92)',
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '400',
    textAlign: 'left',
  },
  sovereignBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(201, 162, 39, 0.2)',
  },
  sovereignBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  sovereignCloseTxt: {
    color: TEXT_MUTED,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.8,
  },
  sovereignCopyTxt: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
