/**
 * Search Service
 * Búsqueda Fuzzy + Social Market con jerarquía de resultados
 */

import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { BusinessCard, BusinessCardSearchResult } from '@/types/businessCard';

/**
 * Link type (from Vault)
 */
export interface Link {
  id: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  isFavorite: boolean;
}

/**
 * Búsqueda Fuzzy - Calcula similitud entre dos strings (Levenshtein distance)
 */
export function fuzzyMatch(searchTerm: string, targetString: string, threshold = 0.6): number {
  const search = searchTerm.toLowerCase();
  const target = targetString.toLowerCase();

  if (target.includes(search)) return 1; // Match exacto
  if (search.includes(target)) return 0.9; // Contiene el término

  // Levenshtein distance
  const longer = search.length > target.length ? search : target;
  const shorter = search.length > target.length ? target : search;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  const maxLength = longer.length;
  return 1 - editDistance / maxLength;
}

// Helper: Levenshtein Distance
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calcular distancia entre dos coordenadas (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Radio de la Tierra en millas
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Social Market Search - Jerarquía:
 * 1. Mis Contactos (con match de keywords)
 * 2. Negocios Cercanos (por distancia + relevancia)
 */
export async function searchSocialMarket(
  searchTerms: string[],
  userContacts: Link[],
  userLatitude?: number,
  userLongitude?: number,
  radiusMiles = 15
): Promise<BusinessCardSearchResult[]> {
  const results: BusinessCardSearchResult[] = [];

  // 1. SEARCH EN MIS CONTACTOS
  const myContactsMatches = userContacts.map((contact) => {
    let totalScore = 0;
    let matchCount = 0;

    searchTerms.forEach((term) => {
      const titleMatch = fuzzyMatch(term, contact.title);
      const typeMatch = fuzzyMatch(term, contact.type);
      
      if (titleMatch > 0.5 || typeMatch > 0.5) {
        totalScore += Math.max(titleMatch, typeMatch);
        matchCount++;
      }
    });

    return {
      contact,
      relevanceScore: matchCount > 0 ? totalScore / matchCount : 0,
      source: 'my_contacts' as const,
    };
  }).filter(m => m.relevanceScore > 0.6);

  // 2. SEARCH EN BUSINESS CARDS (Social Market)
  try {
    const businessCardsRef = collection(db, 'businessCards');
    const q = query(
      businessCardsRef,
      where('isActive', '==', true),
      where('isPublishedToMarket', '==', true),
      where('kycVerified', '==', true),
      limit(50) // Limite para no sobrecargar
    );

    const snapshot = await getDocs(q);
    const businessCards: BusinessCard[] = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as BusinessCard)
    );

    // Filtrar por distancia si tenemos coordinates
    let nearbyCards = businessCards;
    if (userLatitude && userLongitude) {
      nearbyCards = businessCards.filter((card) => {
        const distance = calculateDistance(
          userLatitude,
          userLongitude,
          card.latitude,
          card.longitude
        );
        return distance <= radiusMiles;
      });
    }

    // Calcular relevancia por índice invisible (elevatorPitchWords) con fallback a keywords legacy.
    const businessMatches = nearbyCards.map((card) => {
      let totalScore = 0;
      let matchedKeywords: string[] = [];
      const expiresTs = Date.parse(String((card as any).subscriptionExpires || ''));
      const hasActiveAnnuality = Number.isFinite(expiresTs) && expiresTs > Date.now();
      const indexTerms = ((card as any).elevatorPitchWords as string[] | undefined)?.length
        ? ((card as any).elevatorPitchWords as string[])
        : (card.keywords || []);

      searchTerms.forEach((term) => {
        indexTerms.forEach((indexWord) => {
          const similarity = fuzzyMatch(term, indexWord);
          if (similarity > 0.6) {
            totalScore += similarity;
            matchedKeywords.push(indexWord);
          }
        });
      });

      const distance = userLatitude && userLongitude
        ? calculateDistance(userLatitude, userLongitude, card.latitude, card.longitude)
        : 999;

      return {
        card,
        relevanceScore: totalScore / Math.max(searchTerms.length, 1),
        distanceMiles: distance,
        matchedKeywords: [...new Set(matchedKeywords)],
        source: 'social_market' as const,
        hasActiveAnnuality,
      };
    });

    // 3. CONSOLIDAR RESULTADOS CON JERARQUÍA
    // Primero mis contactos (si tienen match)
    myContactsMatches.forEach((match) => {
      results.push({
        card: match.contact as any, // Type casting
        distanceMiles: 0, // Local
        relevanceScore: match.relevanceScore * 100,
        matchedKeywords: searchTerms.filter((term) =>
          fuzzyMatch(term, match.contact.title) > 0.6
        ),
      });
    });

    // Luego negocios (ordenados por distancia)
    businessMatches
      .filter((m) => m.relevanceScore > 0)
      .sort((a, b) => {
        // Ordenar por: 1) Relevancia, 2) Distancia
        if (a.hasActiveAnnuality !== b.hasActiveAnnuality) {
          return Number(b.hasActiveAnnuality) - Number(a.hasActiveAnnuality);
        }
        if (a.relevanceScore !== b.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        return a.distanceMiles - b.distanceMiles;
      })
      .forEach((match) => {
        results.push({
          card: match.card,
          distanceMiles: match.distanceMiles,
          relevanceScore: match.relevanceScore * 100,
          matchedKeywords: match.matchedKeywords,
        });
      });
  } catch (error) {
    console.error('Error searching Social Market:', error);
  }

  return results;
}

/**
 * Buscar Business Cards por proximidad (GPS)
 */
export async function findNearbyBusinesses(
  userLatitude: number,
  userLongitude: number,
  radiusMiles = 15,
  limit_results = 20
): Promise<BusinessCardSearchResult[]> {
  const results: BusinessCardSearchResult[] = [];

  try {
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

    // Calcular distancia y filtrar
    const withDistances = allCards
      .map((card) => ({
        card,
        distanceMiles: calculateDistance(
          userLatitude,
          userLongitude,
          card.latitude,
          card.longitude
        ),
      }))
      .filter((item) => item.distanceMiles <= radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, limit_results);

    return withDistances.map((item) => ({
      card: item.card,
      distanceMiles: item.distanceMiles,
      relevanceScore: 100 - (item.distanceMiles / radiusMiles) * 50, // Score basado en cercanía
      matchedKeywords: [],
    }));
  } catch (error) {
    console.error('Error finding nearby businesses:', error);
    return [];
  }
}
