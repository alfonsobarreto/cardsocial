import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getActiveUserId } from '@/services/authSession';
import { redeemQRGift } from '@/services/qrGiftService';
import { ConfettiAnimation } from '../components/ConfettiAnimation';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import palette from './theme';

interface ConfettiRef {
  trigger: () => void;
}

export default function RedeemScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
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
        },
        centerContent: {
          alignItems: 'center',
          paddingHorizontal: 20,
        },
        loadingText: {
          fontSize: 16,
          color: shell.ctaAccent,
          marginTop: 16,
          fontWeight: '600',
        },
        errorTitle: {
          fontSize: 20,
          fontWeight: '700',
          color: shell.fabText,
          marginTop: 16,
        },
        errorText: {
          fontSize: 14,
          color: 'rgba(255,255,255,0.88)',
          marginTop: 12,
          textAlign: 'center',
          lineHeight: 20,
        },
        successTitle: {
          fontSize: 28,
          fontWeight: '700',
          color: shell.fabText,
          marginTop: 16,
          marginBottom: 24,
        },
        rewardBox: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: shell.typeBadgeBg,
          borderRadius: 16,
          paddingVertical: 24,
          paddingHorizontal: 20,
          marginBottom: 24,
          borderWidth: 2,
          borderColor: shell.ctaAccent,
        },
        rewardItem: {
          flex: 1,
          alignItems: 'center',
        },
        divider: {
          width: 1,
          height: 60,
          backgroundColor: 'rgba(212,175,55,0.35)',
          marginHorizontal: 16,
        },
        rewardValue: {
          fontSize: 28,
          fontWeight: '700',
          color: shell.ctaAccent,
          marginTop: 8,
        },
        rewardLabel: {
          fontSize: 12,
          color: 'rgba(255,255,255,0.88)',
          marginTop: 4,
        },
        successMessage: {
          fontSize: 16,
          color: shell.fabText,
          textAlign: 'center',
          lineHeight: 24,
          marginBottom: 16,
        },
        thankYouText: {
          fontSize: 14,
          color: shell.textSecondary,
          textAlign: 'center',
          marginBottom: 20,
        },
        autoCloseText: {
          fontSize: 12,
          color: shell.textMuted,
          fontStyle: 'italic',
        },
      }),
    [shell]
  );

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewardDetails, setRewardDetails] = useState<{ credits: number; months: number } | null>(null);
  const confettiRef = useRef<ConfettiRef>(null);

  useEffect(() => {
    handleRedemption();
  }, [code]);

  const handleRedemption = async () => {
    try {
      setLoading(true);

      const userId = await getActiveUserId();
      if (!userId) {
        setError(tr('No se pudo identificar tu usuario. Por favor, inicia sesión.', 'Could not identify your user. Please sign in.'));
        setLoading(false);
        return;
      }

      if (!code || typeof code !== 'string') {
        setError(tr('Código de regalo inválido', 'Invalid gift code'));
        setLoading(false);
        return;
      }

      const ok = await redeemQRGift(code, userId);

      if (ok) {
        setRewardDetails({ credits: 500, months: 1 });
        setSuccess(true);
        setLoading(false);

        if (confettiRef.current) {
          confettiRef.current.trigger();
        }

        setTimeout(() => {
          router.back();
        }, 3000);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || tr('No se pudo canjear el código. Intenta de nuevo.', 'Could not redeem the code. Try again.'));
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={shell.vipBannerGradient} style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={shell.ctaAccent} />
          <Text style={styles.loadingText}>{tr('Validando regalo...', 'Validating gift...')}</Text>
        </View>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={shell.vipBannerGradient} style={styles.container}>
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={60} color={shell.danger} />
          <Text style={styles.errorTitle}>{tr('❌ No se pudo canjear', '❌ Could not redeem')}</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </LinearGradient>
    );
  }

  if (success && rewardDetails) {
    return (
      <LinearGradient colors={shell.vipBannerGradient} style={styles.container}>
        <ConfettiAnimation ref={confettiRef} />

        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="gift" size={80} color={shell.ctaAccent} />

          <Text style={styles.successTitle}>{tr('🎉 ¡Regalo Canjeado!', '🎉 Gift Redeemed!')}</Text>

          <View style={styles.rewardBox}>
            <View style={styles.rewardItem}>
              <MaterialCommunityIcons name="cash" size={24} color={shell.ctaAccent} />
              <Text style={styles.rewardValue}>{rewardDetails.credits}</Text>
              <Text style={styles.rewardLabel}>{tr('Créditos', 'Credits')}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.rewardItem}>
              <MaterialCommunityIcons name="crown" size={24} color={shell.ctaAccent} />
              <Text style={styles.rewardValue}>{rewardDetails.months}</Text>
              <Text style={styles.rewardLabel}>{tr('Mes(es) Premium', 'Month(s) Premium')}</Text>
            </View>
          </View>

          <Text style={styles.successMessage}>
            {tr(`¡Pochobs te ha regalado ${rewardDetails.credits} CS y ${rewardDetails.months} mes${rewardDetails.months > 1 ? 'es' : ''} de Premium!`, `Pochobs have gifted you ${rewardDetails.credits} CS and ${rewardDetails.months} month${rewardDetails.months > 1 ? 's' : ''} of Premium!`)}
          </Text>

          <Text style={styles.thankYouText}>
            {tr('Gracias por ser parte de la comunidad Card-Social 💙', 'Thank you for being part of the Card-Social community 💙')}
          </Text>

          <Text style={styles.autoCloseText}>{tr('Cerrando en 3 segundos...', 'Closing in 3 seconds...')}</Text>
        </View>
      </LinearGradient>
    );
  }

  return null;
}
