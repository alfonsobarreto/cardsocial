import { dashboardReceiversStrings } from '@/constants/dashboardReceiversI18n';
import type { AppLanguage } from '@/services/language';
import { intlLocaleTagForAppLanguage } from '@/services/language';
import { fetchBusinessCardHoldersHistory, type BusinessHoldersHistoryGranularity } from '@/services/qrApi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ReceiversMetricChrome = {
  text: string;
  textSecondary: string;
  textMuted: string;
  panel: string;
  panelBorder: string;
  gold: string;
  iconGold: string;
  analyticsCardBg: string;
  analyticsCardBorder: string;
  periodTabBg: string;
  periodTabBorder: string;
  periodTabText: string;
  periodTabActiveText: string;
  chartGridLine: string;
  isNight: boolean;
};

function formatBucketLabel(
  key: string,
  granularity: BusinessHoldersHistoryGranularity,
  lang: AppLanguage,
): string {
  const tag = intlLocaleTagForAppLanguage(lang);
  if (granularity === 'daily') {
    const [y, m, d] = key.split('-').map((x) => Number(x));
    if (!y || !m || !d) return key;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(tag, { day: 'numeric', month: 'short' });
  }
  if (granularity === 'monthly') {
    const [y, m] = key.split('-').map((x) => Number(x));
    if (!y || !m) return key;
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(tag, { month: 'short' });
  }
  return key;
}

function heroMessage(count: number, s: ReturnType<typeof dashboardReceiversStrings>): string {
  if (count <= 0) return s.heroZero;
  if (count === 1) return s.heroOne;
  return s.heroMany.replace(/\{n\}/g, String(count));
}

export function BusinessReceiversMetricBlock({
  holdersCount,
  cardTitle,
  sessionUid,
  bId,
  chrome,
  language,
}: {
  holdersCount: number;
  cardTitle: string;
  sessionUid: string;
  bId: string;
  chrome: ReceiversMetricChrome;
  language: AppLanguage;
}) {
  const insets = useSafeAreaInsets();
  const s = useMemo(() => dashboardReceiversStrings(language), [language]);
  const [modalOpen, setModalOpen] = useState(false);
  const [granularity, setGranularity] = useState<BusinessHoldersHistoryGranularity>('monthly');
  const [monthCursor, setMonthCursor] = useState(0);
  const [yearCursor, setYearCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalActive, setTotalActive] = useState(holdersCount);
  const [sumInRange, setSumInRange] = useState(0);
  const [buckets, setBuckets] = useState<Array<{ key: string; count: number }>>([]);

  useEffect(() => {
    setTotalActive(holdersCount);
  }, [holdersCount]);

  useEffect(() => {
    setMonthCursor(0);
    setYearCursor(0);
  }, [bId]);

  const loadHistory = useCallback(async () => {
    if (!sessionUid || !bId) return;
    setLoading(true);
    setError(null);
    try {
      const out = await fetchBusinessCardHoldersHistory({
        uid: sessionUid,
        bId,
        granularity,
        monthCursor,
        yearCursor,
      });
      setTotalActive(out.totalActive);
      setSumInRange(out.sumInRange);
      setBuckets(out.buckets);
    } catch (e) {
      setError(e instanceof Error ? e.message : '—');
      setBuckets([]);
    } finally {
      setLoading(false);
    }
  }, [sessionUid, bId, granularity, monthCursor, yearCursor]);

  useEffect(() => {
    if (modalOpen) {
      void loadHistory();
    }
  }, [modalOpen, loadHistory]);

  const maxBar = useMemo(() => Math.max(1, ...buckets.map((b) => b.count)), [buckets]);
  const hasActivity = buckets.some((b) => b.count > 0);

  const periodHint = useMemo(() => {
    if (granularity === 'daily') {
      const now = new Date();
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthCursor, 1));
      return d.toLocaleDateString(intlLocaleTagForAppLanguage(language), { month: 'long', year: 'numeric' });
    }
    if (granularity === 'monthly') {
      const now = new Date();
      const y = now.getUTCFullYear() + yearCursor;
      return String(y);
    }
    const now = new Date();
    const endY = now.getUTCFullYear() + yearCursor;
    const startY = endY - 5;
    return `${startY} · ${endY}`;
  }, [granularity, monthCursor, yearCursor, language]);

  const shiftPeriod = (delta: number) => {
    if (granularity === 'daily') setMonthCursor((c) => c + delta);
    else if (granularity === 'monthly') setYearCursor((c) => c + delta);
    else setYearCursor((c) => c + delta);
  };

  const canShiftFuture =
    granularity === 'daily'
      ? monthCursor < 0
      : yearCursor < 0;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => setModalOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${s.metricTitle}. ${s.tapForHistory}`}
        style={[styles.heroOuter, { borderColor: chrome.analyticsCardBorder }]}
      >
        <LinearGradient
          colors={
            chrome.isNight
              ? ['rgba(233,195,73,0.22)', 'rgba(30,28,24,0.95)', 'rgba(18,16,12,0.98)']
              : ['rgba(255,248,220,0.95)', 'rgba(255,252,240,0.98)', 'rgba(246,234,190,0.42)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.heroInner}>
          <View style={[styles.heroIconWrap, { backgroundColor: chrome.isNight ? 'rgba(233,195,73,0.18)' : 'rgba(233,195,73,0.25)' }]}>
            <MaterialCommunityIcons name="account-heart" size={28} color={chrome.iconGold} />
          </View>
          <View style={styles.heroTextCol}>
            <Text style={[styles.heroKicker, { color: chrome.gold }]}>{s.metricTitle}</Text>
            <Text style={[styles.heroNumber, { color: chrome.text }]}>{holdersCount}</Text>
            <Text style={[styles.heroSubtitle, { color: chrome.textSecondary }]} numberOfLines={2}>
              {heroMessage(holdersCount, s)}
            </Text>
            <Text style={[styles.heroTap, { color: chrome.textMuted }]}>{s.tapForHistory}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={chrome.iconGold} style={styles.heroChevron} />
        </View>
      </TouchableOpacity>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdropFlex} onPress={() => setModalOpen(false)} />
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: chrome.panel,
                borderColor: chrome.panelBorder,
                paddingBottom: Math.max(20, insets.bottom + 12),
                maxHeight: '82%',
              },
            ]}
          >
            <View style={styles.modalGrab}>
              <View style={[styles.modalGrabBar, { backgroundColor: chrome.textMuted }]} />
            </View>
            <Text style={[styles.modalTitle, { color: chrome.text }]}>{s.modalTitle}</Text>
            <Text style={[styles.modalCardName, { color: chrome.gold }]} numberOfLines={1}>
              {cardTitle}
            </Text>
            <Text style={[styles.modalSubtitle, { color: chrome.textSecondary }]}>{s.modalSubtitle}</Text>

            <View style={styles.tabRow}>
              {(
                [
                  ['daily', s.tabDay] as const,
                  ['monthly', s.tabMonth] as const,
                  ['yearly', s.tabYear] as const,
                ]
              ).map(([g, label]) => {
                const active = granularity === g;
                return (
                  <TouchableOpacity
                    key={g}
                    onPress={() => {
                      setGranularity(g);
                      setMonthCursor(0);
                      setYearCursor(0);
                    }}
                    style={[
                      styles.tabBtn,
                      {
                        backgroundColor: active ? chrome.gold : chrome.periodTabBg,
                        borderColor: active ? chrome.gold : chrome.periodTabBorder,
                      },
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.tabBtnText,
                        { color: active ? (chrome.isNight ? '#1A1508' : '#3D2E08') : chrome.periodTabText },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.periodNav}>
              <TouchableOpacity onPress={() => shiftPeriod(-1)} style={styles.periodNavBtn} hitSlop={12}>
                <MaterialCommunityIcons name="chevron-left" size={22} color={chrome.iconGold} />
                <Text style={[styles.periodNavLabel, { color: chrome.textSecondary }]}>{s.periodPrev}</Text>
              </TouchableOpacity>
              <Text style={[styles.periodHint, { color: chrome.text }]} numberOfLines={1}>
                {periodHint}
              </Text>
              <TouchableOpacity
                onPress={() => shiftPeriod(1)}
                style={styles.periodNavBtn}
                hitSlop={12}
                disabled={!canShiftFuture}
              >
                <Text style={[styles.periodNavLabel, { color: canShiftFuture ? chrome.textSecondary : chrome.textMuted }]}>
                  {s.periodNext}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={canShiftFuture ? chrome.iconGold : chrome.textMuted}
                />
              </TouchableOpacity>
            </View>

            <View style={[styles.statsRow, { borderColor: chrome.analyticsCardBorder }]}>
              <View style={styles.statCell}>
                <Text style={[styles.statVal, { color: chrome.gold }]}>{totalActive}</Text>
                <Text style={[styles.statLab, { color: chrome.textSecondary }]}>{s.totalActiveLabel}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: chrome.analyticsCardBorder }]} />
              <View style={styles.statCell}>
                <Text style={[styles.statVal, { color: chrome.text }]}>{sumInRange}</Text>
                <Text style={[styles.statLab, { color: chrome.textSecondary }]}>{s.inPeriodLabel}</Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={chrome.gold} />
                <Text style={[styles.loadingText, { color: chrome.textMuted }]}>{s.loading}</Text>
              </View>
            ) : error ? (
              <Text style={[styles.errorText, { color: '#FF6B6B' }]}>{error}</Text>
            ) : !hasActivity ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={36} color={chrome.iconGold} />
                <Text style={[styles.emptyText, { color: chrome.textSecondary }]}>{s.emptyChart}</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.barsScrollContent}
                style={styles.chartScroll}
              >
                <View style={styles.barsRow}>
                  {buckets.map((b) => {
                    const h = Math.max(4, Math.round((b.count / maxBar) * 72));
                    return (
                      <View key={b.key} style={styles.barCol}>
                        <Text style={[styles.barCount, { color: chrome.text }]}>{b.count}</Text>
                        <LinearGradient
                          colors={['rgba(255,222,128,0.95)', 'rgba(233,195,73,0.55)', 'rgba(122,92,16,0.35)']}
                          style={[styles.barFill, { height: h, borderColor: chrome.analyticsCardBorder }]}
                        />
                        <Text style={[styles.barLabel, { color: chrome.textMuted }]} numberOfLines={1}>
                          {formatBucketLabel(b.key, granularity, language)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.closeBtn, { borderColor: chrome.panelBorder }]}
              onPress={() => setModalOpen(false)}
            >
              <Text style={[styles.closeBtnText, { color: chrome.text }]}>{s.close}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  heroOuter: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 108,
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: {
    flex: 1,
    minWidth: 0,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heroNumber: {
    fontSize: 32,
    fontWeight: '200',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },
  heroTap: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.2,
  },
  heroChevron: { opacity: 0.9 },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  modalBackdropFlex: {
    flex: 1,
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  modalGrab: { alignItems: 'center', paddingVertical: 8 },
  modalGrabBar: { width: 40, height: 4, borderRadius: 2, opacity: 0.45 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  modalCardName: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  modalSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 12 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabBtnText: { fontSize: 12, fontWeight: '800' },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  periodNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  periodNavLabel: { fontSize: 12, fontWeight: '700' },
  periodHint: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '800' },
  statsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, alignSelf: 'stretch' },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLab: { fontSize: 11, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  loadingBox: { paddingVertical: 28, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '600' },
  errorText: { paddingVertical: 16, textAlign: 'center', fontSize: 13 },
  emptyBox: { paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { textAlign: 'center', fontSize: 13, fontWeight: '600', paddingHorizontal: 12 },
  chartScroll: { maxHeight: 220 },
  barsScrollContent: { paddingVertical: 8, paddingRight: 12 },
  barsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  barCol: { width: 44, alignItems: 'center', marginBottom: 8 },
  barCount: { fontSize: 10, fontWeight: '800', marginBottom: 4 },
  barFill: {
    width: 32,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  barLabel: { fontSize: 9, fontWeight: '700', maxWidth: 40, textAlign: 'center' },
  closeBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  closeBtnText: { fontSize: 15, fontWeight: '800' },
});
