import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import palette from '../theme';

interface User {
  name: string;
  phone: string;
  ghostLink: string;
}

export default function ProfileScreen() {
  const { id } = useLocalSearchParams();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = palette[isDark ? 'dark' : 'light'];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        },
        title: {
          fontSize: 24,
          fontWeight: 'bold',
          color: shell.textPrimary,
          marginBottom: 10,
        },
        subtitle: {
          fontSize: 16,
          color: shell.refreshAccent,
          marginBottom: 5,
        },
        errorText: {
          fontSize: 18,
          color: shell.danger,
        },
      }),
    [shell]
  );

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', id as string));
        if (userDoc.exists()) {
          setUserData(userDoc.data() as User);
        } else {
          setUserData(null);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchUserData();
    }
  }, [id]);

  if (loading) {
    return (
      <LinearGradient colors={[...shell.tabShellGradient]} style={styles.container}>
        <ActivityIndicator size="large" color={shell.refreshAccent} />
      </LinearGradient>
    );
  }

  if (!userData) {
    return (
      <LinearGradient colors={[...shell.tabShellGradient]} style={styles.container}>
        <Text style={styles.errorText}>{tr('Usuario no encontrado', 'User not found')}</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[...shell.tabShellGradient]} style={styles.container}>
      <Text style={styles.title}>{userData.name}</Text>
      <Text style={styles.subtitle}>
        {tr('Teléfono', 'Phone')}: {userData.phone}
      </Text>
      <Text style={styles.subtitle}>
        {tr('Ghost-Link', 'Ghost-Link')}: {userData.ghostLink}
      </Text>
    </LinearGradient>
  );
}
