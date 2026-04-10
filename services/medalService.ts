/**
 * Medal Service
 * Sistema de medallas/kudos para tarjetas sociales y de negocio.
 *
 * Firestore structure:
 *   medals/{cardId}                    → { counts: { [medalKey]: number } }
 *   medals/{cardId}/votes/{userId}     → { medal: string, votedAt: Timestamp }
 *
 * Reglas de voto:
 *   - Tap misma medalla  → quita el voto (toggle off)
 *   - Tap diferente      → cambia voto (quita anterior, pone nueva)
 *   - Tap sin voto previo → agrega voto
 *   - Un solo voto por usuario por tarjeta
 */

import { db } from '@/services/firebaseConfig';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';

// ─── Definiciones de medallas ────────────────────────────────────────────────

export type BusinessMedalKey =
  | 'compromiso'
  | 'servicio'
  | 'confianza'
  | 'prestigio'
  | 'excelencia';

export type SocialMedalKey =
  | 'creativo'
  | 'conector'
  | 'visionario'
  | 'conversador'
  | 'guru';

export type MedalKey = BusinessMedalKey | SocialMedalKey;

export interface MedalDef {
  key: MedalKey;
  labelEs: string;
  labelEn: string;
  icon: string; // MaterialCommunityIcons name
}

export const BUSINESS_MEDALS: readonly MedalDef[] = [
  { key: 'compromiso', labelEs: 'Compromiso',  labelEn: 'Commitment',  icon: 'handshake'     },
  { key: 'servicio',   labelEs: 'Servicio',    labelEn: 'Service',     icon: 'star-circle'   },
  { key: 'confianza',  labelEs: 'Confianza',   labelEn: 'Trust',       icon: 'shield-check'  },
  { key: 'prestigio',  labelEs: 'Prestigio',   labelEn: 'Prestige',    icon: 'crown'         },
  { key: 'excelencia', labelEs: 'Excelencia',  labelEn: 'Excellence',  icon: 'trophy'        },
];

export const SOCIAL_MEDALS: readonly MedalDef[] = [
  { key: 'creativo',    labelEs: 'Mente Creativa',   labelEn: 'Creative Mind',          icon: 'lightbulb-on'  },
  { key: 'conector',    labelEs: 'Súper Conector',   labelEn: 'Super Connector',        icon: 'account-group' },
  { key: 'visionario',  labelEs: 'Visionario',       labelEn: 'Visionary',              icon: 'eye-circle'    },
  { key: 'conversador', labelEs: 'Buen Conversador', labelEn: 'Good Conversationalist', icon: 'message-star'  },
  { key: 'guru',        labelEs: 'Gurú Tech',        labelEn: 'Tech Guru',              icon: 'laptop'        },
];

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface MedalCounts {
  [key: string]: number;
}

export interface MedalData {
  myVote: MedalKey | null;
  counts: MedalCounts;
  totalVotes: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sumCounts(counts: MedalCounts): number {
  return Object.values(counts).reduce((acc, n) => acc + (n ?? 0), 0);
}

// ─── Funciones públicas ───────────────────────────────────────────────────────

/**
 * Lee el voto actual del usuario + conteos de medallas de una tarjeta.
 */
export async function getMedalData(
  cardId: string,
  userId: string,
): Promise<MedalData> {
  if (!cardId || !userId) return { myVote: null, counts: {}, totalVotes: 0 };

  const countsRef = doc(db, 'medals', cardId);
  const voteRef   = doc(db, 'medals', cardId, 'votes', userId);

  const [countsSnap, voteSnap] = await Promise.all([
    getDoc(countsRef),
    getDoc(voteRef),
  ]);

  const counts: MedalCounts = countsSnap.exists()
    ? (countsSnap.data()?.counts ?? {})
    : {};
  const myVote: MedalKey | null = voteSnap.exists()
    ? (voteSnap.data()?.medal as MedalKey)
    : null;

  return { myVote, counts, totalVotes: sumCounts(counts) };
}

/**
 * Envía, cambia o retira un voto de medalla (transacción atómica).
 * Retorna el estado resultante.
 */
export async function submitMedalVote(
  cardId: string,
  userId: string,
  medal: MedalKey,
): Promise<MedalData> {
  if (!cardId || !userId) throw new Error('cardId y userId son requeridos');

  const countsRef = doc(db, 'medals', cardId);
  const voteRef   = doc(db, 'medals', cardId, 'votes', userId);

  let resultMyVote: MedalKey | null = null;
  let resultCounts: MedalCounts = {};

  await runTransaction(db, async (tx) => {
    const [countsSnap, voteSnap] = await Promise.all([
      tx.get(countsRef),
      tx.get(voteRef),
    ]);

    const currentCounts: MedalCounts = countsSnap.exists()
      ? (countsSnap.data()?.counts ?? {})
      : {};
    const previousVote: MedalKey | null = voteSnap.exists()
      ? (voteSnap.data()?.medal as MedalKey)
      : null;

    const newCounts: MedalCounts = { ...currentCounts };

    if (previousVote === medal) {
      // Toggle off — quitar voto
      newCounts[medal] = Math.max(0, (newCounts[medal] ?? 0) - 1);
      tx.delete(voteRef);
      resultMyVote = null;
    } else {
      // Si había voto anterior distinto, decrementar
      if (previousVote) {
        newCounts[previousVote] = Math.max(0, (newCounts[previousVote] ?? 0) - 1);
      }
      // Incrementar nueva medalla
      newCounts[medal] = (newCounts[medal] ?? 0) + 1;
      tx.set(voteRef, { medal, votedAt: serverTimestamp() });
      resultMyVote = medal;
    }

    tx.set(countsRef, { counts: newCounts }, { merge: true });
    resultCounts = newCounts;
  });

  return {
    myVote: resultMyVote,
    counts: resultCounts,
    totalVotes: sumCounts(resultCounts),
  };
}
