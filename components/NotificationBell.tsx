import { auth, db } from '@/services/firebaseConfig';
import { useCoreT } from '@/services/coreI18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GOLD = '#C9A227';
const GOLD_RING = 'rgba(201, 162, 39, 0.35)';

type NotificationBellProps = {
  /** Color del icono de campana (p. ej. acento del shell). */
  accent: string;
};

type BroadcastLite = {
  id: string;
  expiresAt: Date | null;
};

/**
 * Campanita: no leídas personales + megáfono global activo no leído (sin fan-out por usuario).
 */
export function NotificationBell({ accent }: NotificationBellProps) {
  const router = useRouter();
  const t = useCoreT();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [personalUnread, setPersonalUnread] = useState(0);
  const [readBroadcastIds, setReadBroadcastIds] = useState<string[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastLite[]>([]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!uid) {
      setPersonalUnread(0);
      setReadBroadcastIds([]);
      setBroadcasts([]);
      return;
    }

    const qUnread = query(
      collection(db, 'users', uid, 'notifications'),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(100),
    );

    const unsubPersonal = onSnapshot(
      qUnread,
      (snap) => setPersonalUnread(snap.size),
      (err) => {
        console.warn('[NotificationBell] personal snapshot', err);
        setPersonalUnread(0);
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
        setBroadcasts(
          snap.docs.map((d) => {
            const data = d.data() as { expiresAt?: { toDate?: () => Date } };
            let expiresAt: Date | null = null;
            try {
              expiresAt = data.expiresAt?.toDate?.() ?? null;
            } catch {
              expiresAt = null;
            }
            return { id: d.id, expiresAt };
          }),
        );
      },
      (err) => {
        console.warn('[NotificationBell] broadcasts snapshot', err);
        setBroadcasts([]);
      },
    );

    const stateRef = doc(db, 'users', uid, 'status', 'notifications_state');
    const unsubState = onSnapshot(
      stateRef,
      (snap) => {
        const raw = snap.data()?.readBroadcastIds;
        setReadBroadcastIds(Array.isArray(raw) ? raw.map((x) => String(x)) : []);
      },
      (err) => {
        console.warn('[NotificationBell] notifications_state snapshot', err);
        setReadBroadcastIds([]);
      },
    );

    return () => {
      unsubPersonal();
      unsubBroadcasts();
      unsubState();
    };
  }, [uid]);

  const globalUnread = useMemo(() => {
    const now = Date.now();
    const readSet = new Set(readBroadcastIds);
    return broadcasts.filter((b) => {
      if (readSet.has(b.id)) return false;
      if (b.expiresAt != null && !Number.isNaN(b.expiresAt.getTime()) && b.expiresAt.getTime() < now) {
        return false;
      }
      return true;
    }).length;
  }, [broadcasts, readBroadcastIds]);

  const badge = useMemo(() => {
    const total = personalUnread + globalUnread;
    if (total <= 0) return 'hidden' as const;
    if (total >= 10) return '9plus' as const;
    return total;
  }, [personalUnread, globalUnread]);

  if (!uid) return null;

  return (
    <TouchableOpacity
      style={styles.hit}
      onPress={() => router.push('/notifications' as any)}
      accessibilityRole="button"
      accessibilityLabel={t('notif_hub_title')}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="bell-outline" size={26} color={accent} />
        {typeof badge === 'number' ? (
          <View style={[styles.badge, { backgroundColor: GOLD, borderColor: GOLD_RING }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : badge === '9plus' ? (
          <View style={[styles.badge, styles.badgeWide, { backgroundColor: GOLD, borderColor: GOLD_RING }]}>
            <Text style={styles.badgeTextSmall}>9+</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hit: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    position: 'relative',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeWide: {
    minWidth: 28,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#1a1a1a',
    fontSize: 11,
    fontWeight: '800',
  },
  badgeTextSmall: {
    color: '#1a1a1a',
    fontSize: 10,
    fontWeight: '800',
  },
});
