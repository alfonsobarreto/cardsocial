import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getActiveUserId } from '@/services/authSession';
import { redeemQRGift } from '@/services/qrGiftService';
import { redeemVipCampaign, type VipCampaignRedeemResult } from '@/services/vipCampaignService';
import { ConfettiAnimation } from '../components/ConfettiAnimation';
import { useCoreT } from '@/services/coreI18n';
import { useLookMode } from '@/services/lookMode';
import palette from './theme';

interface ConfettiRef {
  trigger: () => void;
}

export default function RedeemScreen() {
  const router = useRouter();
  const { code, campaignCode } = useLocalSearchParams();
  const t = useCoreT();
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
          backgroundColor: 'rgba(47,123,255,0.35)',
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
  const [campaignReward, setCampaignReward] = useState<VipCampaignRedeemResult | null>(null);
  const confettiRef = useRef<ConfettiRef>(null);

  useEffect(() => {
    handleRedemption();
  }, [code, campaignCode]);

  const handleRedemption = async () => {
    try {
      setLoading(true);

      const userId = await getActiveUserId();
      if (!userId) {
        setError(t('redeem_user_unknown'));
        setLoading(false);
        return;
      }

      const giftCode = typeof code === 'string' ? code : '';
      const vipCampaignCode = typeof campaignCode === 'string' ? campaignCode : '';

      if (!giftCode && !vipCampaignCode) {
        setError(t('redeem_invalid_code'));
        setLoading(false);
        return;
      }

      if (vipCampaignCode) {
        const result = await redeemVipCampaign(vipCampaignCode, userId);
        const tierLabel = result.grantedTier === 'business' ? t('sub_tier_business') : t('sub_tier_influencer');
        setCampaignReward(result);
        setSuccess(true);
        setLoading(false);

        Alert.alert(
          t('redeem_congrats_title'),
          t('redeem_vip_upgrade_body', { tier: tierLabel, days: result.durationDays }),
        );

        if (confettiRef.current) {
          confettiRef.current.trigger();
        }

        setTimeout(() => {
          router.back();
        }, 3500);
        return;
      }

      const ok = await redeemQRGift(giftCode, userId);

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
    } catch {
      setError(t('redeem_code_failed'));
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={shell.vipBannerGradient} style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={shell.ctaAccent} />
          <Text style={styles.loadingText}>{t('redeem_validating')}</Text>
        </View>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={shell.vipBannerGradient} style={styles.container}>
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={60} color={shell.danger} />
          <Text style={styles.errorTitle}>{t('redeem_error_title')}</Text>
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

          <Text style={styles.successTitle}>{t('redeem_gift_success_title')}</Text>

          <View style={styles.rewardBox}>
            <View style={styles.rewardItem}>
              <MaterialCommunityIcons name="cash" size={24} color={shell.ctaAccent} />
              <Text style={styles.rewardValue}>{rewardDetails.credits}</Text>
              <Text style={styles.rewardLabel}>{t('redeem_credits_label')}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.rewardItem}>
              <MaterialCommunityIcons name="crown" size={24} color={shell.ctaAccent} />
              <Text style={styles.rewardValue}>{rewardDetails.months}</Text>
              <Text style={styles.rewardLabel}>{t('redeem_months_premium_label')}</Text>
            </View>
          </View>

          <Text style={styles.successMessage}>
            {rewardDetails.months > 1
              ? t('redeem_gift_body_n_months', { credits: rewardDetails.credits, months: rewardDetails.months })
              : t('redeem_gift_body_one_month', { credits: rewardDetails.credits })}
          </Text>

          <Text style={styles.thankYouText}>
            {t('redeem_thanks_community')}
          </Text>

          <Text style={styles.autoCloseText}>{t('redeem_closing_seconds')}</Text>
        </View>
      </LinearGradient>
    );
  }

  if (success && campaignReward) {
    const tierLabel = campaignReward.grantedTier === 'business' ? t('sub_tier_business') : t('sub_tier_influencer');
    return (
      <LinearGradient colors={shell.vipBannerGradient} style={styles.container}>
        <ConfettiAnimation ref={confettiRef} />

        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="crown" size={86} color={shell.ctaAccent} />

          <Text style={styles.successTitle}>{t('redeem_vip_screen_title')}</Text>

          <View style={styles.rewardBox}>
            <View style={styles.rewardItem}>
              <MaterialCommunityIcons name="star-circle" size={28} color={shell.ctaAccent} />
              <Text style={styles.rewardValue}>{tierLabel}</Text>
              <Text style={styles.rewardLabel}>{t('redeem_new_tier')}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.rewardItem}>
              <MaterialCommunityIcons name="calendar-check" size={28} color={shell.ctaAccent} />
              <Text style={styles.rewardValue}>{campaignReward.durationDays}</Text>
              <Text style={styles.rewardLabel}>{t('redeem_days_label')}</Text>
            </View>
          </View>

          <Text style={styles.successMessage}>
            {t('redeem_vip_upgrade_body', { tier: tierLabel, days: campaignReward.durationDays })}
          </Text>

          <Text style={styles.thankYouText}>
            {t('redeem_benefit_active')}
          </Text>

          <Text style={styles.autoCloseText}>{t('redeem_closing_seconds')}</Text>
        </View>
      </LinearGradient>
    );
  }

  return null;
}
