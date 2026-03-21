/**
 * Icon Pack Service
 * Gestiona la economía de packs de iconos comprados con Créditos CS
 * 
 * Modelo de Negocio:
 * - Usuarios GRATIS: Compran packs de iconos con créditos CS
 * - Usuarios PREMIUM: Todos los packs desbloqueados automáticamente
 * - Pochobs (Admin): Crea y sube nuevos packs desde Admin Dashboard
 * 
 * Conversión: 1 Pack ≈ 50-100 Créditos CS (configurable por Pochobs)
 */

import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  increment,
  arrayUnion,
  serverTimestamp,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { deductCredits, recordCreditTransaction } from '@/services/creditsService';

export interface IconPack {
  id: string;
  name: string; // "3D Neon Pack", "Minimal Set", etc.
  description: string;
  category: 'communication' | 'social' | 'payment' | 'custom' | 'premium';
  iconCount: number; // Cuántos iconos incluye
  creditsPrice: number; // Costo en Créditos CS (ej: 75 CS)
  previewImages: string[]; // URLs de preview en Firebase Storage
  folderPath: string; // Ruta en Firebase: premium-icons/3d-neon-pack/
  rarity: 'common' | 'rare' | 'epic' | 'legendary'; // Para hacer coleccionismo
  createdBy: string; // UID de Pochobs (admin uploader)
  createdAt: Timestamp;
  isActive: boolean;
  totalSales: number; // Estadística de popularidad
  isLimitedEdition?: boolean;
  stockTotal?: number;
  stockRemaining?: number;
  max_supply?: number;
  current_supply?: number;
  brand?: string;
  dropLabel?: string;
  isCollectible?: boolean;
  storeSection?: 'featured' | 'newest' | 'most_popular' | 'collectible' | 'out_of_stock' | 'retail';
}

export interface UserIconPack {
  packId: string;
  packName: string;
  purchasedAt: Timestamp;
  creditsSpent: number;
}

export interface CollectibleOwnership {
  ownershipId: string;
  userId: string;
  packId: string;
  packName: string;
  serialNumber: number;
  totalSupply: number;
  assetToken: string;
  certificateLabel: string;
  authenticityText: string;
  mintedAt: string;
  tradable: boolean;
  marketStatus: 'held' | 'listed' | 'sold';
}

function normalizeSection(pack: IconPack): IconPack['storeSection'] {
  const limited = Boolean(pack.isLimitedEdition);
  const currentSupply = Math.max(0, Number(pack.current_supply ?? pack.stockRemaining ?? 0));
  if (limited && currentSupply <= 0) return 'out_of_stock';
  if (Boolean(pack.isCollectible) || limited) return 'collectible';
  return 'retail';
}

/**
 * ADMIN ONLY: Crear un nuevo Icon Pack
 * Se llama desde AdminDashboard cuando Pochobs sube un pack completo
 */
export async function createIconPack(
  userId: string,
  packData: Omit<IconPack, 'id' | 'createdAt' | 'createdBy' | 'totalSales'>,
): Promise<string | null> {
  try {
    // Validar que es admin
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists() || userSnap.data().role !== 'super_admin') {
      console.error('❌ Only admins can create icon packs');
      return null;
    }

    const packsCollection = collection(db, 'icon_packs');
    const stockTotal = Math.max(0, Number(packData.stockTotal ?? 0));
    const isLimitedEdition = Boolean(packData.isLimitedEdition) || stockTotal > 0;
    const newPackRef = await addDoc(packsCollection, {
      ...packData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      totalSales: 0,
      isLimitedEdition,
      stockTotal,
      stockRemaining: Math.max(0, Number(packData.stockRemaining ?? stockTotal)),
      max_supply: stockTotal,
      current_supply: Math.max(0, Number(packData.stockRemaining ?? stockTotal)),
      brand: packData.brand || 'Card-Social',
      dropLabel: packData.dropLabel || null,
      isCollectible: Boolean((packData as any).isCollectible) || isLimitedEdition,
      storeSection: (packData as any).storeSection || (isLimitedEdition ? 'collectible' : 'retail'),
    });

    console.log(`✅ Icon Pack creado: ${newPackRef.id}`);
    return newPackRef.id;
  } catch (error) {
    console.error('Error creating icon pack:', error);
    return null;
  }
}

/**
 * Obtiene TODOS los packs disponibles para comprar
 * Usuarios GRATIS ven packs pero no desbloqueados
 * Usuarios PREMIUM: Todos automáticamente desbloqueados
 */
export async function getAvailableIconPacks(userId: string): Promise<IconPack[]> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return [];
    }

    const isPremium = userSnap.data().isPremium || false;

    // Si es Premium, retornar TODOS los packs (están desbloqueados)
    if (isPremium) {
      const packsRef = collection(db, 'icon_packs');
      const q = query(packsRef, where('isActive', '==', true));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((doc) => {
        const row = {
          id: doc.id,
          ...doc.data(),
          totalSales: doc.data().totalSales || 0,
        } as IconPack;
        return {
          ...row,
          max_supply: Number(row.max_supply ?? row.stockTotal ?? 0),
          current_supply: Number(row.current_supply ?? row.stockRemaining ?? 0),
          storeSection: row.storeSection || normalizeSection(row),
        };
      }) as IconPack[];
    }

    // Usuario GRATIS: Retornar packs compatibles (no premium-only)
    const packsRef = collection(db, 'icon_packs');
    const q = query(
      packsRef,
      where('isActive', '==', true),
      where('category', '!=', 'premium'), // Excluir categoría exclusive premium
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
      const row = {
        id: doc.id,
        ...doc.data(),
        totalSales: doc.data().totalSales || 0,
      } as IconPack;
      return {
        ...row,
        max_supply: Number(row.max_supply ?? row.stockTotal ?? 0),
        current_supply: Number(row.current_supply ?? row.stockRemaining ?? 0),
        storeSection: row.storeSection || normalizeSection(row),
      };
    }) as IconPack[];
  } catch (error) {
    console.error('Error getting available icon packs:', error);
    return [];
  }
}

/**
 * Obtiene los packs que el usuario ya ha comprado
 */
export async function getUserPurchasedPacks(userId: string): Promise<UserIconPack[]> {
  try {
    const userPacksRef = doc(db, `users/${userId}/icon_packs/history`);
    const snapshot = await getDoc(userPacksRef);

    if (!snapshot.exists()) {
      return [];
    }

    return snapshot.data().purchases || [];
  } catch (error) {
    console.error('Error getting user purchased packs:', error);
    return [];
  }
}

/**
 * COMPRAR un Icon Pack con créditos CS
 * 
 * Flujo:
 * 1. Validar que el usuario tiene suficientes créditos
 * 2. Deducir créditos
 * 3. Agregar pack a la lista de comprados
 * 4. Incrementar estadística totalSales del pack
 * 5. Registrar transacción
 */
export async function purchaseIconPack(userId: string, packId: string): Promise<boolean> {
  try {
    const alreadyOwned = await hasUserPurchasedPack(userId, packId);
    if (alreadyOwned) {
      console.warn('Pack already purchased by user');
      return true;
    }

    // 1. Obtener datos del pack
    const packRef = doc(db, 'icon_packs', packId);
    const packSnap = await getDoc(packRef);

    if (!packSnap.exists()) {
      console.error('❌ Pack no encontrado');
      return false;
    }

    const pack = packSnap.data() as IconPack;
    const isLimitedEdition = Boolean(pack.isLimitedEdition);
    const currentStock = Math.max(0, Number(pack.current_supply ?? pack.stockRemaining ?? 0));
    const maxSupply = Math.max(0, Number(pack.max_supply ?? pack.stockTotal ?? 0));

    if (isLimitedEdition && currentStock <= 0) {
      console.error('❌ Pack agotado');
      return false;
    }

    const costInCredits = pack.creditsPrice;

    // 2. Validar créditos
    const userCreditsRef = doc(db, `users/${userId}/credits/balance`);
    const userCreditsSnap = await getDoc(userCreditsRef);

    if (!userCreditsSnap.exists()) {
      console.error('❌ No credits record found for user');
      return false;
    }

    const currentBalance = userCreditsSnap.data().creditsBalance || 0;

    if (currentBalance < costInCredits) {
      console.error(`❌ Insufficient credits. Need ${costInCredits}, have ${currentBalance}`);
      return false;
    }

    // 3. Deducir créditos (usar el servicio existente)
    const deductSuccess = await deductCredits(userId, costInCredits, `icon_pack_purchase:${packId}`);

    if (!deductSuccess) {
      console.error('❌ Failed to deduct credits');
      return false;
    }

    // 4. Agregar pack a lista de comprados
    const userPacksRef = doc(db, `users/${userId}/icon_packs/history`);
    const userPacksSnap = await getDoc(userPacksRef);

    const newPurchase: UserIconPack = {
      packId,
      packName: pack.name,
      purchasedAt: Timestamp.now(),
      creditsSpent: costInCredits,
    };

    if (userPacksSnap.exists()) {
      // Actualizar array existente
      await updateDoc(userPacksRef, {
        purchases: arrayUnion(newPurchase),
      });
    } else {
      // Crear documento nuevo
      await setDoc(userPacksRef, {
        purchases: [newPurchase],
        userId,
        createdAt: serverTimestamp(),
      });
    }

    // 5. Incrementar totalSales del pack (estadística)
    await updateDoc(packRef, {
      totalSales: increment(1),
      ...(isLimitedEdition
        ? { stockRemaining: increment(-1), current_supply: increment(-1) }
        : {}),
    });

    if (Boolean(pack.isCollectible) || isLimitedEdition) {
      const serialNumber = Math.max(1, (maxSupply || currentStock) - currentStock + 1);
      const assetToken = `CS-ICON-${String(packId).slice(-3).toUpperCase()}-${String(serialNumber).padStart(3, '0')}`;
      const total = maxSupply || currentStock || serialNumber;
      const cert: CollectibleOwnership = {
        ownershipId: `${packId}_${userId}_${Date.now()}`,
        userId,
        packId,
        packName: pack.name,
        serialNumber,
        totalSupply: total,
        assetToken,
        certificateLabel: `Poseedor #${serialNumber}/${total} - Autentico Pochobs Design`,
        authenticityText: 'Autentico Pochobs Design',
        mintedAt: new Date().toISOString(),
        tradable: true,
        marketStatus: 'held',
      };

      await setDoc(doc(db, 'users', userId, 'collectible_assets', cert.ownershipId), cert);
      await setDoc(doc(db, 'users', userId, 'vault_certificates', cert.ownershipId), {
        id: cert.ownershipId,
        title: `Certificado ${pack.name}`,
        type: 'Collectible Certificate',
        value: cert.certificateLabel,
        assetToken: cert.assetToken,
        packId,
        tradable: true,
        createdAt: cert.mintedAt,
      });
    }

    // 6. Registrar transacción
    await recordCreditTransaction(
      userId,
      'spend',
      costInCredits,
      `icon_pack_purchase:${pack.name}`,
    );

    console.log(`✅ Icon Pack comprado: ${pack.name} | Usuario: ${userId}`);
    return true;
  } catch (error) {
    console.error('Error purchasing icon pack:', error);
    return false;
  }
}

/**
 * Obtiene estadísticas de un pack específico
 * (Popularidad, ventas totales, etc.)
 */
export async function getIconPackStats(packId: string): Promise<{
  totalSales: number;
  rarity: string;
  category: string;
} | null> {
  try {
    const packRef = doc(db, 'icon_packs', packId);
    const snapshot = await getDoc(packRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      totalSales: data.totalSales || 0,
      rarity: data.rarity,
      category: data.category,
    };
  } catch (error) {
    console.error('Error getting pack stats:', error);
    return null;
  }
}

/**
 * Obtiene packs RECOMENDADOS basados en lo que el usuario ya tiene
 * (Para cross-selling)
 */
export async function getRecommendedPacks(userId: string, limit: number = 3): Promise<IconPack[]> {
  try {
    const userPurchased = await getUserPurchasedPacks(userId);
    const purchasedIds = userPurchased.map((p) => p.packId);

    const allPacks = await getAvailableIconPacks(userId);

    // Filtrar packs que ya tiene
    const recommended = allPacks
      .filter((pack) => !purchasedIds.includes(pack.id))
      .slice(0, limit);

    return recommended;
  } catch (error) {
    console.error('Error getting recommended packs:', error);
    return [];
  }
}

/**
 * Valida si un usuario ya ha comprado un pack específico
 */
export async function hasUserPurchasedPack(userId: string, packId: string): Promise<boolean> {
  try {
    const userPurchased = await getUserPurchasedPacks(userId);
    return userPurchased.some((p) => p.packId === packId);
  } catch (error) {
    console.error('Error validating pack purchase:', error);
    return false;
  }
}

/**
 * Obtiene el folder path de un pack comprado
 * (Para acceder a los iconos en Firebase Storage después de comprar)
 */
export async function getPackFolderPath(packId: string): Promise<string | null> {
  try {
    const packRef = doc(db, 'icon_packs', packId);
    const snapshot = await getDoc(packRef);

    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.data().folderPath || null;
  } catch (error) {
    console.error('Error getting pack folder path:', error);
    return null;
  }
}
