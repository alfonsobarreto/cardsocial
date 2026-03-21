/**
 * Credits Indicator Component
 * Muestra el balance de créditos en el menú hamburguesa
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getUserCreditsBalance } from '@/services/creditsService';

interface CreditsIndicatorProps {
  userId: string;
  refreshTrigger?: number; // Incrementar para forzar actualización
}

export const CreditsIndicator: React.FC<CreditsIndicatorProps> = ({ userId, refreshTrigger }) => {
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCredits = async () => {
      setLoading(true);
      try {
        const balance = await getUserCreditsBalance(userId);
        setCreditsBalance(balance);
      } catch (error) {
        console.error('Error fetching credits balance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCredits();
  }, [userId, refreshTrigger]);

  return (
    <View style={styles.container}>
      <View style={styles.creditsBox}>
        <MaterialCommunityIcons
          name="cash"
          size={20}
          color="#C5A065"
          style={styles.icon}
        />
        <View>
          <Text style={styles.label}>Créditos CS</Text>
          <Text style={styles.balance}>{creditsBalance}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E8EB',
  },
  creditsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#C5A065',
  },
  icon: {
    marginRight: 10,
  },
  label: {
    fontSize: 12,
    color: '#4A4A4A',
    fontWeight: '500',
  },
  balance: {
    fontSize: 18,
    fontWeight: '800',
    color: '#C5A065',
    marginTop: 2,
  },
});
