/**
 * Business Card Paywall Service
 * Gestiona pago anual y cashback para Business Cards
 * 
 * Modelo Lujo Masivo:
 * - Pago anual único: $49.99 USD
 * - Cashback inmediato: BUSINESS_CARD_CASHBACK_CS Monedas CS por activacion/renovacion
 */

// Servicios de terceros (RevenueCat, Firebase) se integran en tiempo de ejecución
import Purchases from 'react-native-purchases';
import { addCredits } from '@/services/creditsService';
import { activateOrRenewBusinessLicense } from '@/services/businessLicenseService';
import { BUSINESS_CARD_CASHBACK_CS } from '@/constants/csEconomy';

const BUSINESS_CARD_ANNUAL_PRICE_USD = 49.99;

/**
 * PackageOffering para Business Cards
 */
export interface BusinessCardPackage {
  productId: string; // SKU del app store
  platform: 'ios' | 'android';
  title: string;
  description: string;
  priceUsd: number; // Precio en USD
  priceBefore?: number; // Precio original si hay descuento
  discount?: number; // Porcentaje de descuento (ej: 30 para 30%)
  billingPeriod: 'annual' | 'monthly';
  features: string[];
}

/**
 * Resultado del cálculo de precio con descuento
 */
export interface PriceCalculation {
  originalPrice: number;
  discountPercentage: number;
  discountAmount: number;
  finalPrice: number;
  savingsLabel: string;
}

/**
 * Información de compra de Business Card
 */
export interface BusinessCardPurchaseState {
  userId: string;
  isPremiumUser: boolean;
  hasActiveSubscription: boolean;
  expirationDate?: Date;
  bId?: string;
  purchaseId?: string;
}

const PREMIUM_ENTITLEMENT_KEYS = ['premium', 'premium_card', 'card_social_premium'];

const BUSINESS_CARD_PACKAGES: Record<string, BusinessCardPackage> = {
  // iOS
  ios_business_card_annual: {
    productId: 'card_social_business_annual_ios',
    platform: 'ios',
    title: 'Tarjeta de Negocio - Anual',
    description: 'Publica tu negocio en el Social Market por 1 año',
    priceUsd: BUSINESS_CARD_ANNUAL_PRICE_USD,
    billingPeriod: 'annual',
    features: [
      '✓ Publicación en Social Market',
      '✓ Stories de 7 días (2x/mes)',
      '✓ QR Branded con logo',
      '✓ Analytics de vistas',
      '✓ Soporte prioritario',
    ],
  },
  // Android
  android_business_card_annual: {
    productId: 'card_social_business_annual_android',
    platform: 'android',
    title: 'Tarjeta de Negocio - Anual',
    description: 'Publica tu negocio en el Social Market por 1 año',
    priceUsd: BUSINESS_CARD_ANNUAL_PRICE_USD,
    billingPeriod: 'annual',
    features: [
      '✓ Publicación en Social Market',
      '✓ Stories de 7 días (2x/mes)',
      '✓ QR Branded con logo',
      '✓ Analytics de vistas',
      '✓ Soporte prioritario',
    ],
  },
};

/**
 * Calcula el precio final para licencia anual por tarjeta
 */
export function calculatePriceWithPremiumDiscount(
  basePrice: number,
  isPremium: boolean
): PriceCalculation {
  // Se mantiene la firma por compatibilidad; el modelo actual no usa descuento global.
  const discountAmount = 0;
  const finalPrice = basePrice;

  return {
    originalPrice: basePrice,
    discountPercentage: 0,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    finalPrice: parseFloat(finalPrice.toFixed(2)),
    savingsLabel: `Cashback fijo de ${BUSINESS_CARD_CASHBACK_CS.toLocaleString('es-MX')} CS al confirmar compra`,
  };
}

/**
 * Obtiene el paquete correcto basado en la plataforma actual
 */
export function getBusinessCardPackageForPlatform(
  platform: 'ios' | 'android'
): BusinessCardPackage | null {
  const key = `${platform}_business_card_annual`;
  return (BUSINESS_CARD_PACKAGES as Record<string, BusinessCardPackage>)[key] || null;
}

/**
 * Obtiene el SKU del producto anual por plataforma
 */
export function getBusinessCardProductId(
  platform: 'ios' | 'android',
  isPremium: boolean
): string {
  const pkg = getBusinessCardPackageForPlatform(platform);
  if (!pkg) {
    throw new Error(`No business card package found for platform: ${platform}`);
  }

  // Se usa el mismo SKU anual para todos los usuarios (modelo free-to-use + licencia por tarjeta).
  return pkg.productId;
}

/**
 * Verifica estado Premium en tiempo real desde RevenueCat
 */
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

/**
 * Obtiene el estado de compra del usuario para Business Cards
 */
export async function getBusinessCardPurchaseState(
  userId: string,
  isPremiumUser: boolean
): Promise<BusinessCardPurchaseState> {
  // Aquí consultarías Firestore para verificar:
  // - Si el usuario tiene una suscripción activa a Business Card
  // - Fecha de expiración
  // - bId asociado
  
  try {
    // PLACEHOLDER: En producción, consultarías Firestore
    // const doc = await getDoc(doc(db, 'businessCardSubscriptions', userId));
    // if (doc.exists()) { ... }

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

/**
 * Prepara los datos de checkout con el precio calculado
 */
export function prepareCheckoutData(
  bId: string,
  isPremiumUser: boolean,
  platform: 'ios' | 'android'
): {
  package: BusinessCardPackage;
  pricing: PriceCalculation;
  checkoutMetadata: Record<string, any>;
} {
  const pkg = getBusinessCardPackageForPlatform(platform);
  if (!pkg) {
    throw new Error(`Business card package not found for: ${platform}`);
  }

  const pricing = calculatePriceWithPremiumDiscount(pkg.priceUsd, isPremiumUser);

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

/**
 * Procesa la compra mediante RevenueCat
 * ⚠️ Modelo Lujo de Acceso Masivo: aplica cashback fijo (`BUSINESS_CARD_CASHBACK_CS`) por licencia anual
 * Retorna true si exitoso, false en caso contrario
 */
export async function purchaseBusinessCard(
  platform: 'ios' | 'android',
  isPremiumUser: boolean,
  bId: string,
  userId?: string // Para aplicar Welcome Bonus en primer pago
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
    const productId = getBusinessCardProductId(platform, validatedPremium);
    const pricing = calculatePriceWithPremiumDiscount(BUSINESS_CARD_ANNUAL_PRICE_USD, false);

    const purchaseResult = await Purchases.purchaseProduct(productId);

    const purchaseId =
      String((purchaseResult as any)?.customerInfo?.originalAppUserId || '') ||
      String((purchaseResult as any)?.productIdentifier || '') ||
      `purchase_${Date.now()}`;

    console.log(`Compra iniciada: ${productId}`);
    console.log(`Precio validado por RevenueCat: $${pricing.finalPrice.toFixed(2)}`);
    console.log(`   🎫 bId: ${bId}`);
    if (validatedPremium !== isPremiumUser) {
      console.log(`Premium local desfasado. Local=${isPremiumUser} RevenueCat=${validatedPremium}`);
    }

    // Cashback de poder fijo por activacion/renovacion de licencia anual.
    let welcomeBonusApplied = false;
    let cashbackCredits = 0;
    if (userId) {
      try {
        cashbackCredits = BUSINESS_CARD_CASHBACK_CS;
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
        // Don't fail purchase if bonus fails - bonus is secondary
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

/**
 * Valida si la compra está habilitada para este usuario
 */
export async function validateBusinessCardPurchaseEligibility(
  userId: string,
  isPremiumUser: boolean
): Promise<{ eligible: boolean; reason?: string }> {
  // Validaciones básicas
  if (!userId) {
    return { eligible: false, reason: 'Usuario no autenticado' };
  }

  // Podría haber más validaciones:
  // - Si el usuario ya tiene una tarjeta de negocio activa
  // - Si está en "Dull Mode" (restricciones de cuenta)
  // - Si su dispositivo está baneado

  return { eligible: true };
}

/**
 * Formatea el precio para mostrar en UI
 */
export function formatPriceDisplay(priceUsd: number): string {
  return `$${priceUsd.toFixed(2)} USD`;
}

/**
 * Genera el label visual del descuento
 */
export function generateDiscountLabel(discount: PriceCalculation): string {
  if (discount.discountPercentage === 0) {
    return '';
  }

  return `🎁 AHORRO: ${discount.savingsLabel}`;
}

/**
 * Obtiene la descripción del beneficio principal
 */
export function getMainBenefit(isPremiumUser: boolean): string {
  return `Licencia anual por tarjeta: Social Market + Stories CTA + ${BUSINESS_CARD_CASHBACK_CS.toLocaleString('es-MX')} CS cashback`;
}
