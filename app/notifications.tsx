import { resolveNotificationCopyKeys } from '@/services/inAppNotificationCopy';
import { auth, db } from '@/services/firebaseConfig';
import { useCoreT } from '@/services/coreI18n';
import { useLookMode } from '@/services/lookMode';
import palette from './theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GOLD_DOT = '#C9A227';

export type NotificationListItem = {
  id: string;
  templateId: string;
  read: boolean;
  createdAt: Date | null;
  reportId?: string;
  targetCardId?: string | null;
  raw: Record<string, unknown>;
};

export type BroadcastHubRow = {
  kind: 'broadcast';
  id: string;
  templateId: string;
  read: boolean;
  createdAt: Date | null;
  expiresAt: Date | null;
};

export type PersonalHubRow = {
  kind: 'personal';
  id: string;
  templateId: string;
  read: boolean;
  createdAt: Date | null;
  reportId?: string;
  targetCardId?: string | null;
  raw: Record<string, unknown>;
};

export type NotificationHubRow = PersonalHubRow | BroadcastHubRow;

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (v as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

function rowSortKey(d: Date | null): number {
  if (!d || Number.isNaN(d.getTime())) return 0;
  return d.getTime();
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = palette[isNight ? 'dark' : 'light'];
  const t = useCoreT();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [personalRows, setPersonalRows] = useState<PersonalHubRow[]>([]);
  const [broadcastDocs, setBroadcastDocs] = useState<BroadcastHubRow[]>([]);
  const [readBroadcastIds, setReadBroadcastIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) {
      setPersonalRows([]);
      setBroadcastDocs([]);
      setReadBroadcastIds([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const qPersonal = query(
      collection(db, 'users', uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );

    const unsubPersonal = onSnapshot(
      qPersonal,
      (snap) => {
        const next: PersonalHubRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            kind: 'personal',
            id: d.id,
            templateId: String(data.templateId || ''),
            read: Boolean(data.read),
            createdAt: toDate(data.createdAt),
            reportId: typeof data.reportId === 'string' ? data.reportId : undefined,
            targetCardId: data.targetCardId != null ? String(data.targetCardId) : null,
            raw: data,
          };
        });
        setPersonalRows(next);
        setLoading(false);
      },
      (e) => {
        console.warn('[notifications] personal', e);
        setPersonalRows([]);
        setLoading(false);
      },
    );

    const qBroadcasts = query(
      collection(db, 'system_broadcasts'),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc'),
      limit(50),
    );

    const unsubBroadcasts = onSnapshot(
      qBroadcasts,
      (snap) => {
        const now = Date.now();
        const next: BroadcastHubRow[] = [];
        for (const d of snap.docs) {
          const data = d.data() as Record<string, unknown>;
          const expiresAt = data.expiresAt == null ? null : toDate(data.expiresAt);
          if (
            expiresAt != null &&
            !Number.isNaN(expiresAt.getTime()) &&
            expiresAt.getTime() < now
          ) {
            continue;
          }
          next.push({
            kind: 'broadcast',
            id: d.id,
            templateId: String(data.templateId || ''),
            read: false,
            createdAt: toDate(data.createdAt),
            expiresAt,
          });
        }
        setBroadcastDocs(next);
      },
      (e) => {
        console.warn('[notifications] broadcasts', e);
        setBroadcastDocs([]);
      },
    );

    const stateRef = doc(db, 'users', uid, 'status', 'notifications_state');
    const unsubState = onSnapshot(
      stateRef,
      (snap) => {
        const raw = snap.data()?.readBroadcastIds;
        setReadBroadcastIds(Array.isArray(raw) ? raw.map((x) => String(x)) : []);
      },
      (e) => {
        console.warn('[notifications] state', e);
        setReadBroadcastIds([]);
      },
    );

    return () => {
      unsubPersonal();
      unsubBroadcasts();
      unsubState();
    };
  }, [uid]);

  const readBroadcastSet = useMemo(() => new Set(readBroadcastIds), [readBroadcastIds]);

  const mergedRows: NotificationHubRow[] = useMemo(() => {
    const broadcastsWithRead: BroadcastHubRow[] = broadcastDocs.map((b) => ({
      ...b,
      read: readBroadcastSet.has(b.id),
    }));
    return [...personalRows, ...broadcastsWithRead].sort(
      (a, b) => rowSortKey(b.createdAt) - rowSortKey(a.createdAt),
    );
  }, [personalRows, broadcastDocs, readBroadcastSet]);

  const onToggleRow = async (row: NotificationHubRow) => {
    const key = row.kind === 'broadcast' ? `b:${row.id}` : `p:${row.id}`;
    setExpandedId((prev) => (prev === key ? null : key));

    if (!uid) return;

    if (row.kind === 'personal') {
      if (row.read) return;
      try {
        await updateDoc(doc(db, 'users', uid, 'notifications', row.id), { read: true });
        setPersonalRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, read: true } : x)));
      } catch (e) {
        console.warn('[notifications] mark personal read', e);
      }
      return;
    }

    if (row.read) return;
    try {
      await setDoc(
        doc(db, 'users', uid, 'status', 'notifications_state'),
        { readBroadcastIds: arrayUnion(row.id) },
        { merge: true },
      );
      setReadBroadcastIds((prev) => (prev.includes(row.id) ? prev : [...prev, row.id]));
    } catch (e) {
      console.warn('[notifications] mark broadcast read', e);
    }
  };

  const stylesMemo = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: shell.backgroundSolid },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: shell.modalBorder,
        },
        backBtn: { padding: 8, marginRight: 4 },
        title: { flex: 1, fontSize: 18, fontWeight: '700', color: shell.textPrimary },
        card: {
          marginHorizontal: 16,
          marginTop: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          backgroundColor: shell.surface,
          padding: 14,
          overflow: 'hidden',
        },
        cardUnread: {
          borderColor: GOLD_DOT,
          backgroundColor: isNight ? 'rgba(201, 162, 39, 0.08)' : 'rgba(201, 162, 39, 0.06)',
        },
        rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
        dot: {
          width: 10,
          height: 10,
          borderRadius: 5,
          marginTop: 5,
          backgroundColor: GOLD_DOT,
        },
        dotHidden: { opacity: 0 },
        titleRow: { flex: 1 },
        itemTitle: { fontSize: 15, fontWeight: '700', color: shell.textPrimary, lineHeight: 20 },
        meta: { fontSize: 12, color: shell.textSecondary, marginTop: 4 },
        body: { fontSize: 14, color: shell.textPrimary, marginTop: 10, lineHeight: 21 },
        globalPill: {
          alignSelf: 'flex-start',
          marginBottom: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 8,
          backgroundColor: isNight ? 'rgba(201, 162, 39, 0.2)' : 'rgba(201, 162, 39, 0.15)',
        },
        globalPillText: { fontSize: 10, fontWeight: '800', color: GOLD_DOT, letterSpacing: 0.4 },
        empty: { textAlign: 'center', marginTop: 48, paddingHorizontal: 24, color: shell.textSecondary, fontSize: 15 },
        center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
      }),
    [shell, isNight],
  );

  if (!uid) {
    return (
      <View style={[stylesMemo.root, stylesMemo.center]}>
        <Text style={{ color: shell.textSecondary }}>{t('common_not_authenticated')}</Text>
      </View>
    );
  }

  return (
    <View style={[stylesMemo.root, { paddingTop: insets.top }]}>
      <View style={[stylesMemo.topBar, { minHeight: 48 + insets.top * 0 }]}>
        <Pressable style={stylesMemo.backBtn} onPress={() => router.back()} accessibilityRole="button">
          <MaterialCommunityIcons name="chevron-left" size={28} color={shell.ctaAccent} />
        </Pressable>
        <Text style={stylesMemo.title} numberOfLines={1}>
          {t('notif_hub_title')}
        </Text>
      </View>

      {loading ? (
        <View style={stylesMemo.center}>
          <ActivityIndicator size="large" color={shell.ctaAccent} />
        </View>
      ) : mergedRows.length === 0 ? (
        <Text style={stylesMemo.empty}>{t('notif_hub_empty')}</Text>
      ) : (
        <FlatList
          data={mergedRows}
          keyExtractor={(x) => (x.kind === 'broadcast' ? `b:${x.id}` : `p:${x.id}`)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshing={false}
          renderItem={({ item }) => {
            const keys = resolveNotificationCopyKeys(item.templateId);
            const titleText = keys ? t(keys.title) : item.templateId || t('common_error');

            const rowKey = item.kind === 'broadcast' ? `b:${item.id}` : `p:${item.id}`;
            const expanded = expandedId === rowKey;
            const dateStr = item.createdAt
              ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(item.createdAt)
              : '';

            const daysRaw = item.kind === 'personal' ? item.raw.daysRemaining : undefined;
            const daysRemaining =
              typeof daysRaw === 'number' && Number.isFinite(daysRaw)
                ? daysRaw
                : typeof daysRaw === 'string' && daysRaw.trim() !== '' && Number.isFinite(Number(daysRaw))
                  ? Number(daysRaw)
                  : undefined;

            let bodyResolved = '';
            if (keys) {
              if (item.templateId === 'SYS_ACCOUNT_EXPIRING') {
                bodyResolved =
                  daysRemaining != null && Number.isFinite(daysRemaining)
                    ? t(keys.body, { days: daysRemaining })
                    : t('notif_tpl_SYS_ACCOUNT_EXPIRING_body_general');
              } else {
                bodyResolved = t(keys.body);
              }
            }

            const isUnread = !item.read;

            return (
              <Pressable
                style={[stylesMemo.card, isUnread && stylesMemo.cardUnread]}
                onPress={() => void onToggleRow(item)}
              >
                {item.kind === 'broadcast' ? (
                  <View style={stylesMemo.globalPill}>
                    <Text style={stylesMemo.globalPillText}>{t('notif_hub_global_pill')}</Text>
                  </View>
                ) : null}
                <View style={stylesMemo.rowTop}>
                  <View style={[stylesMemo.dot, item.read && stylesMemo.dotHidden]} />
                  <View style={stylesMemo.titleRow}>
                    <Text style={stylesMemo.itemTitle}>{titleText}</Text>
                    {dateStr ? <Text style={stylesMemo.meta}>{dateStr}</Text> : null}
                  </View>
                </View>
                {expanded ? <Text style={stylesMemo.body}>{bodyResolved}</Text> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
