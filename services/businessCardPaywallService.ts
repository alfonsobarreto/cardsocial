/**
 * Business Card Paywall Service
 * Licencia anual por tarjeta: precio publicado en `system_config/tiers` → `business.annualPriceUsd`.
 * Cashback al confirmar: monto en CS publicado en `system_config/cs_economy`.
 */

import Purchases from 'react-native-purchases';
import { CARD_SOCIAL_PRO_ENTITLEMENT_LOOKUP_KEYS } from '@/constants/revenueCat';
import { addCredits } from '@/services/creditsService';
import { activateOrRenewBusinessLicense } from '@/services/businessLicenseService';
import { getCsEconomyConfig } from '@/services/csEconomyConfigService';
import { getTiersConfig } from '@/services/tiersConfigService';

export interface BusinessCardPackage {
  productId: string;
  platform: 'ios' | 'android';
  title: string;
  description: string;
  priceUsd: number;
  priceBefore?: number;
  discount?: number;
  billingPeriod: 'annual' | 'monthly';
  features: string[];
}

export interface PriceCalculation {
  originalPrice: number;
  discountPercentage: number;
  discountAmount: number;
  finalPrice: number;
  savingsLabel: string;
}

export interface BusinessCardPurchaseState {
  userId: string;
  isPremiumUser: boolean;
  hasActiveSubscription: boolean;
  expirationDate?: Date;
  bId?: string;
  purchaseId?: string;
}

const PREMIUM_ENTITLEMENT_KEYS = [...CARD_SOCIAL_PRO_ENTITLEMENT_LOOKUP_KEYS, 'premium', 'premium_card', 'card_social_premium'];

type BusinessCardTemplate = Omit<BusinessCardPackage, 'priceUsd'>;

const BUSINESS_CARD_PACKAGE_TEMPLATES: Record<string, BusinessCardTemplate> = {
  ios_business_card_annual: {
    productId: 'card_social_business_annual_ios',
    platform: 'ios',
    title: 'Tarjeta de Negocio - Anual',
    description: 'Publica tu negocio en el Social Market por 1 año',
    billingPeriod: 'annual',
    features: [
      '✓ Publicación en Social Market',
      '✓ Visibilidad en Social Market durante 1 año',
      '✓ QR Branded con logo',
      '✓ Analytics de vistas',
      '✓ Soporte prioritario',
    ],
  },
  android_business_card_annual: {
    productId: 'card_social_business_annual_android',
    platform: 'android',
    title: 'Tarjeta de Negocio - Anual',
    description: 'Publica tu negocio en el Social Market por 1 año',
    billingPeriod: 'annual',
    features: [
      '✓ Publicación en Social Market',
      '✓ Visibilidad en Social Market durante 1 año',
      '✓ QR Branded con logo',
      '✓ Analytics de vistas',
      '✓ Soporte prioritario',
    ],
  },
};

export function calculatePriceWithPremiumDiscount(
  basePrice: number,
  isPremium: boolean,
  cashbackCs: number,
): PriceCalculation {
  void isPremium;
  const discountAmount = 0;
  const finalPrice = basePrice;
  const cs = Math.max(0, Math.floor(cashbackCs));

  return {
    originalPrice: basePrice,
    discountPercentage: 0,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    finalPrice: parseFloat(finalPrice.toFixed(2)),
    savingsLabel: `Cashback de ${cs.toLocaleString('es-MX')} CS al confirmar compra`,
  };
}

/**
 * Solo valores publicados en CMS; `null` si no hay doc tiers o el precio anual business es 0.
 */
export async function loadBusinessCardAnnualPriceUsdFromCms(): Promise<number | null> {
  const tiers = await getTiersConfig();
  if (!tiers) return null;
  const n = Math.max(0, tiers.business.annualPriceUsd);
  return n > 0 ? n : null;
}

export async function loadBusinessCardPackageForPlatform(
  platform: 'ios' | 'android',
): Promise<BusinessCardPackage | null> {
  const key = `${platform}_business_card_annual`;
  const tpl = BUSINESS_CARD_PACKAGE_TEMPLATES[key];
  if (!tpl) return null;
  const tiers = await getTiersConfig();
  if (!tiers) return null;
  const priceUsd = Math.max(0, tiers.business.annualPriceUsd);
  if (priceUsd <= 0) return null;
  return { ...tpl, priceUsd };
}

export function getBusinessCardProductId(platform: 'ios' | 'android'): string {
  const key = `${platform}_business_card_annual`;
  const tpl = BUSINESS_CARD_PACKAGE_TEMPLATES[key];
  if (!tpl) {
    throw new Error(`No business card package found for platform: ${platform}`);
  }
  return tpl.productId;
}

export async function getRealtimePremiumStatus(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const activeEntitlements = (customerInfo as any)?.entitlements?.active || {};

    for (const key of PREMIUM_ENTITLEMENT_KEYS) {
      if (activeEntitlements[key]) {
        return true;
      }
    }

    return Object.keys(activeEntitlements).length > 0;
  } catch (error) {
    console.warn('RevenueCat getCustomerInfo failed:', error);
    return false;
  }
}

export async function getBusinessCardPurchaseState(
  userId: string,
  isPremiumUser: boolean,
): Promise<BusinessCardPurchaseState> {
  try {
    return {
      userId,
      isPremiumUser,
      hasActiveSubscription: false,
      expirationDate: undefined,
      bId: undefined,
      purchaseId: undefined,
    };
  } catch (error) {
    console.error('Error fetching purchase state:', error);
    return {
      userId,
      isPremiumUser,
      hasActiveSubscription: false,
    };
  }
}

export async function prepareCheckoutData(
  bId: string,
  isPremiumUser: boolean,
  platform: 'ios' | 'android',
): Promise<{
  package: BusinessCardPackage;
  pricing: PriceCalculation;
  checkoutMetadata: Record<string, any>;
}> {
  const pkg = await loadBusinessCardPackageForPlatform(platform);
  if (!pkg) {
    throw new Error(`Business card package not found for: ${platform}`);
  }

  const econ = await getCsEconomyConfig();
  const pricing = calculatePriceWithPremiumDiscount(pkg.priceUsd, isPremiumUser, econ.businessCardCashbackCs);

  const checkoutMetadata = {
    bId,
    packageType: 'business_card_annual',
    premiumDiscount: isPremiumUser,
    normalPrice: pkg.priceUsd,
    finalPrice: pricing.finalPrice,
    discountPercentage: pricing.discountPercentage,
    platform,
    timestamp: new Date().toISOString(),
  };

  return {
    package: pkg,
    pricing,
    checkoutMetadata,
  };
}

export async function purchaseBusinessCard(
  platform: 'ios' | 'android',
  isPremiumUser: boolean,
  bId: string,
  userId?: string,
): Promise<{
  success: boolean;
  purchaseId?: string;
  message: string;
  finalPrice?: number;
  discountPercentage?: number;
  validatedPremium?: boolean;
  welcomeBonusApplied?: boolean;
  cashbackCredits?: number;
}> {
  try {
    const validatedPremium = await getRealtimePremiumStatus();
    const productId = getBusinessCardProductId(platform);
    const listPriceUsd = await loadBusinessCardAnnualPriceUsdFromCms();
    if (listPriceUsd == null) {
      return {
        success: false,
        message: 'La licencia anual no está disponible en este momento. Inténtalo más tarde.',
      };
    }
    const econ = await getCsEconomyConfig();
    const cashbackConfigured = Math.max(0, Math.floor(econ.businessCardCashbackCs));
    const pricing = calculatePriceWithPremiumDiscount(listPriceUsd, false, cashbackConfigured);

    const purchaseResult = await Purchases.purchaseProduct(productId);

    const purchaseId =
      String((purchaseResult as any)?.customerInfo?.originalAppUserId || '') ||
      String((purchaseResult as any)?.productIdentifier || '') ||
      `purchase_${Date.now()}`;

    console.log(`Compra iniciada: ${productId}`);
    console.log(`Precio CMS (referencia): $${pricing.finalPrice.toFixed(2)}`);
    console.log(`   🎫 bId: ${bId}`);
    if (validatedPremium !== isPremiumUser) {
      console.log(`Premium local desfasado. Local=${isPremiumUser} RevenueCat=${validatedPremium}`);
    }

    let welcomeBonusApplied = false;
    let cashbackCredits = 0;
    if (userId) {
      try {
        cashbackCredits = cashbackConfigured;
        await addCredits(userId, cashbackCredits, 'business_card_annual_cashback');
        await activateOrRenewBusinessLicense({
          uid: userId,
          bId,
          purchaseId,
          platform,
          annualPriceUsd: pricing.finalPrice,
          cashbackCreditsGranted: cashbackCredits,
        });
        welcomeBonusApplied = true;
        if (welcomeBonusApplied) {
          console.log(`✅ Cashback applied to ${userId}: ${cashbackCredits} CS`);
        }
      } catch (bonusError) {
        console.error('Error applying annual cashback:', bonusError);
      }
    }

    return {
      success: true,
      purchaseId,
      message: 'Compra de Tarjeta de Negocio procesada',
      finalPrice: pricing.finalPrice,
      discountPercentage: pricing.discountPercentage,
      validatedPremium,
      welcomeBonusApplied,
      cashbackCredits,
    };
  } catch (error) {
    console.error('Purchase error:', error);
    return {
      success: false,
      message: `Error en la compra: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function validateBusinessCardPurchaseEligibility(
  userId: string,
  isPremiumUser: boolean,
): Promise<{ eligible: boolean; reason?: string }> {
  void isPremiumUser;
  if (!userId) {
    return { eligible: false, reason: 'Usuario no autenticado' };
  }

  return { eligible: true };
}

export function formatPriceDisplay(priceUsd: number): string {
  return `$${priceUsd.toFixed(2)} USD`;
}

export function generateDiscountLabel(discount: PriceCalculation): string {
  if (discount.discountPercentage === 0) {
    return '';
  }

  return `🎁 AHORRO: ${discount.savingsLabel}`;
}

export function getMainBenefit(isPremiumUser: boolean, cashbackCs: number): string {
  void isPremiumUser;
  const cs = Math.max(0, Math.floor(cashbackCs));
  return `Licencia anual por tarjeta: Social Market destacado + ${cs.toLocaleString('es-MX')} CS cashback`;
}
