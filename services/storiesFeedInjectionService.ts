/**
 * Stories Feed Injection Service
 * Inyecta historias de negocios en el feed de usuarios cercanos (15 millas)
 * Estrategia de monetización: Business Cards pagan por visibilidad en el feed
 */

import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { BusinessCard, BusinessCardSearchResult } from '@/types/businessCard';

export interface StoryInjectionParams {
  userLatitude: number;
  userLongitude: number;
  radiusMiles: number; // Por defecto 15 millas
  userId: string;
}

export interface InjectedStory {
  id: string;
  businessName: string;
  businessCardId: string;
  ownerName: string;
  storyImageUrl: string;
  storyType: 'vip' | 'organic'; // VIP = pagada (7 días fija), Organic = prueba
  duration: number; // segundos
  createdAt: Date;
  expiresAt: Date;
  distanceMiles: number;
  ctaData?: {
    type: string;
    value: string;
  };
  isSponsored: boolean; // Si fue pagada
  viewCount: number;
}

export interface FeedWithInjectedStories {
  organicStories: InjectedStory[];
  injectedStories: InjectedStory[]; // Negocio cercanos (inyectados)
  totalStories: number;
}

/**
 * Calcula distancia entre dos coordenadas (Haversine)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Radio de la Tierra en millas
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Obtiene historias de negocios cercanos para inyectar en el feed del usuario
 * 
 * Lógica:
 * 1. Obtiene todas las Business Cards publicadas en el Social Market
 * 2. Filtra por distancia (15 millas)
 * 3. Filtra por Business Cards que tienen stories activas (VIP o pagadas)
 * 4. Ordena por cercanía
 * 5. Limita a 3-5 historias para no saturar el feed
 * 
 * Restricción: NUNCA inyecta historias de negocios que ya están en los contactos del usuario
 */
export async function getFeedInjectableStories(
  params: StoryInjectionParams
): Promise<InjectedStory[]> {
  const { userLatitude, userLongitude, radiusMiles = 15, userId } = params;

  try {
    // 1. Query: Obtener todas las Business Cards publicadas
    const businessCardsRef = collection(db, 'businessCards');
    const q = query(
      businessCardsRef,
      where('isActive', '==', true),
      where('isPublishedToMarket', '==', true),
      where('kycVerified', '==', true)
    );

    const snapshot = await getDocs(q);
    const allCards: BusinessCard[] = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as BusinessCard)
    );

    // 2. Query: Obtener todas las historias VIP activas
    const storiesRef = collection(db, 'stories');
    const storiesQuery = query(
      storiesRef,
      where('isActive', '==', true),
      where('storyType', '==', 'vip'),
      orderBy('createdAt', 'desc'),
      limit(50) // Obtener suficientes para filtrar
    );

    const storiesSnapshot = await getDocs(storiesQuery);
    const allStories = storiesSnapshot.docs.map((doc) => doc.data());

    // 3. Crear map de cardId → stories para lookup rápido
    const storiesByCardId = new Map<string, any[]>();
    allStories.forEach((story) => {
      if (!storiesByCardId.has(story.businessCardId)) {
        storiesByCardId.set(story.businessCardId, []);
      }
      storiesByCardId.get(story.businessCardId)!.push(story);
    });

    // 4. Filtrar Business Cards por cercanía
    const cardsWithDistances = allCards
      .map((card) => ({
        card,
        distanceMiles: calculateDistance(
          userLatitude,
          userLongitude,
          card.latitude || 0,
          card.longitude || 0
        ),
      }))
      .filter((item) => item.distanceMiles <= radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 10); // Top 10 más cercanos

    // 5. Construir historias inyectables
    const injectableStories: InjectedStory[] = [];

    const contactCardIds = await loadContactCardIds(userId);

    for (const { card, distanceMiles } of cardsWithDistances) {
      const stories = storiesByCardId.get(card.id) || [];

      for (const story of stories) {
        // Verificar que la historia NO sea de un contacto del usuario
        if (!(await isContactOfUser(card.id, userId, contactCardIds))) {
          injectableStories.push({
            id: story.id,
            businessName: card.businessName,
            businessCardId: card.id,
            ownerName: card.ownerName,
            storyImageUrl: story.mediaUrl || '',
            storyType: 'vip',
            duration: story.duration || 30,
            createdAt: new Date(story.createdAt),
            expiresAt: new Date(story.expiresAt),
            distanceMiles,
            ctaData: story.ctaData,
            isSponsored: true,
            viewCount: story.viewCount || 0,
          });
        }
      }
    }

    // 6. Límite: máximo 5 historias inyectadas para no saturar
    return injectableStories.slice(0, 5);
  } catch (error) {
    console.error('Error getting feed injectable stories:', error);
    return [];
  }
}

/**
 * Helper: Verifica si una Business Card pertenece a un contacto del usuario
 * (PLACEHOLDER - en producción consultarías Firestore)
 */
async function isContactOfUser(
  businessCardId: string,
  userId: string,
  cachedContactCardIds?: Set<string>
): Promise<boolean> {
  if (cachedContactCardIds && cachedContactCardIds.has(businessCardId)) {
    return true;
  }

  try {
    const contactsRef = collection(db, 'users', userId, 'contacts');

    const qByCardId = query(contactsRef, where('cardId', '==', businessCardId), limit(1));
    const byCardIdSnapshot = await getDocs(qByCardId);
    if (!byCardIdSnapshot.empty) {
      return true;
    }

    const qByBusinessCardId = query(
      contactsRef,
      where('businessCardId', '==', businessCardId),
      limit(1)
    );
    const byBusinessCardIdSnapshot = await getDocs(qByBusinessCardId);
    return !byBusinessCardIdSnapshot.empty;
  } catch (error) {
    console.warn('Error checking user contact relationship:', error);
    return false;
  }
}

async function loadContactCardIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();

  try {
    const contactsRef = collection(db, 'users', userId, 'contacts');
    const snapshot = await getDocs(contactsRef);

    snapshot.forEach((doc) => {
      const data = doc.data() as Record<string, any>;
      const cardId = typeof data.cardId === 'string' ? data.cardId : '';
      const businessCardId = typeof data.businessCardId === 'string' ? data.businessCardId : '';

      if (cardId) {
        ids.add(cardId);
      }
      if (businessCardId) {
        ids.add(businessCardId);
      }
    });
  } catch (error) {
    console.warn('Error loading contact card ids:', error);
  }

  return ids;
}

/**
 * Combina historias orgánicas del usuario con historias inyectadas de negocios cercanos
 */
export async function buildFeedWithInjectedStories(
  organicStories: InjectedStory[],
  params: StoryInjectionParams
): Promise<FeedWithInjectedStories> {
  const injectedStories = await getFeedInjectableStories(params);

  // Algoritmo de intercalado:
  // Por cada 3 historias orgánicas, intercalar 1 historia inyectada
  const combined: InjectedStory[] = [];
  let injectedIndex = 0;

  for (let i = 0; i < organicStories.length; i++) {
    combined.push(organicStories[i]);

    // Cada 3 historias, intercalar 1 inyectada si disponible
    if ((i + 1) % 3 === 0 && injectedIndex < injectedStories.length) {
      combined.push(injectedStories[injectedIndex]);
      injectedIndex++;
    }
  }

  // Agregar historias inyectadas restantes al final
  while (injectedIndex < injectedStories.length) {
    combined.push(injectedStories[injectedIndex]);
    injectedIndex++;
  }

  return {
    organicStories,
    injectedStories: injectedStories.slice(0, 5),
    totalStories: combined.length,
  };
}

/**
 * Log de vista de historia (para tracking de visibilidad de anuncios)
 */
export async function logStoryView(storyId: string, businessCardId: string): Promise<void> {
  try {
    // En producción:
    // const storyRef = doc(db, 'stories', storyId);
    // await updateDoc(storyRef, {
    //   viewCount: increment(1),
    //   lastViewedAt: serverTimestamp(),
    // });
    console.log(`📊 Story view logged: ${businessCardId}`);
  } catch (error) {
    console.error('Error logging story view:', error);
  }
}

/**
 * Obtiene analytics de visibilidad para una Business Card
 */
export interface StoryAnalytics {
  totalViews: number;
  impressions: number; // Veces que apareció en feed
  ctr: number; // Click-through rate (%)
  revenue: number; // Ingresos estimados
}

export async function getBusinessCardAnalytics(
  businessCardId: string
): Promise<StoryAnalytics> {
  try {
    // En producción:
    // const storiesRef = collection(db, 'stories');
    // const q = query(storiesRef, where('businessCardId', '==', businessCardId));
    // const snapshot = await getDocs(q);

    return {
      totalViews: 0,
      impressions: 0,
      ctr: 0,
      revenue: 0,
    };
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return {
      totalViews: 0,
      impressions: 0,
      ctr: 0,
      revenue: 0,
    };
  }
}
