import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

export type UserRole = 'user' | 'admin' | 'super_admin';

/**
 * Obtiene el rol del usuario actual desde Firestore
 */
export const getUserRole = async (userId: string): Promise<UserRole> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return (userDoc.data().role as UserRole) || 'user';
    }
    return 'user';
  } catch (error) {
    console.error('Error fetching user role:', error);
    return 'user';
  }
};

/**
 * Verifica si el usuario es super_admin (Pochobs)
 */
export const isSuperAdmin = async (userId: string): Promise<boolean> => {
  const role = await getUserRole(userId);
  return role === 'super_admin';
};

/**
 * Verifica si el usuario es admin o super_admin
 */
export const isAdmin = async (userId: string): Promise<boolean> => {
  const role = await getUserRole(userId);
  return role === 'admin' || role === 'super_admin';
};

/**
 * Obtiene información del número de QR generados por el usuario
 */
export const getQRGenerationStats = async (userId: string): Promise<{
  totalGenerated: number;
  totalRedeemed: number;
  totalCreditsGifted: number;
}> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        totalGenerated: data.qrStats?.totalGenerated || 0,
        totalRedeemed: data.qrStats?.totalRedeemed || 0,
        totalCreditsGifted: data.qrStats?.totalCreditsGifted || 0,
      };
    }
    return {
      totalGenerated: 0,
      totalRedeemed: 0,
      totalCreditsGifted: 0,
    };
  } catch (error) {
    console.error('Error fetching QR stats:', error);
    return {
      totalGenerated: 0,
      totalRedeemed: 0,
      totalCreditsGifted: 0,
    };
  }
};
