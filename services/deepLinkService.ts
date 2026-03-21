import * as Linking from 'expo-linking';
import { redeemQRGift } from './qrGiftService';

const prefix = Linking.createURL('/');

export const linking = {
  prefixes: [prefix, 'cardsocial://', 'exp://'],
  config: {
    screens: {
      redeem: 'redeem/:code',
      // Agregar otras rutas según sea necesario
    },
  },
};

/**
 * Maneja deep links de redención de QR
 * Extrae el código y realiza el canje
 */
export async function handleDeepLinkRedeem(code: string, userId: string): Promise<boolean> {
  try {
    if (!code || !userId) {
      throw new Error('Código de usuario inválido');
    }

    // Realizar canje
    const success = await redeemQRGift(code, userId);

    if (success) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error handling deep link redeem:', error);
    throw error;
  }
}

/**
 * Parser de URL para extraer parámetros de deep link
 */
export function parseDeepLinkURL(url: string): { code?: string; userId?: string } {
  try {
    const parsed = Linking.parse(url);
    const queryParams = parsed.queryParams;
    
    if (!queryParams) {
      return {};
    }

    const code = Array.isArray(queryParams.code) ? queryParams.code[0] : queryParams.code;

    return { code: code as string };
  } catch (error) {
    console.error('Error parsing deep link:', error);
    return {};
  }
}
