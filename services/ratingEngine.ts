/**
 * ratingEngine.ts — Sistema de rating Bayesiano para Card Social.
 *
 * Dos niveles de calificación:
 *   1. Card Rating  → promedio de reseñas de una tarjeta específica.
 *   2. User Rating  → promedio ponderado de todas las tarjetas del usuario.
 *
 * Bayesian Average:
 *   displayRating = (numRatings × avgRating + priorWeight × defaultRating) / (numRatings + priorWeight)
 *
 * Con 0 reseñas → 3.0 estrellas (neutral).
 * Con 1 reseña de 1★ → 2.67 (no catastrófico).
 * Con 20 reseñas de 5★ → 4.60 (alto pero requiere volumen).
 */

/** Default "phantom" rating when no reviews exist */
const DEFAULT_RATING = 3.0;

/** How many phantom votes at the default rating. Higher = harder to move from 3.0 */
const PRIOR_WEIGHT = 5;

/**
 * Calcula el Bayesian Average para un item (tarjeta o usuario).
 *
 * @param numRatings  Total de reseñas recibidas (0+).
 * @param rawAverage  Promedio aritmético crudo de las reseñas (1–5). Ignorado si numRatings === 0.
 * @param priorWeight Peso del prior (default 5). Más alto = más conservador.
 * @param defaultRating  Rating por defecto sin reseñas (default 3.0).
 * @returns Rating entre 1.0 y 5.0, redondeado a 2 decimales.
 */
export function bayesianRating(
  numRatings: number,
  rawAverage: number,
  priorWeight: number = PRIOR_WEIGHT,
  defaultRating: number = DEFAULT_RATING,
): number {
  if (numRatings <= 0) return defaultRating;
  const weighted = (numRatings * rawAverage + priorWeight * defaultRating) / (numRatings + priorWeight);
  return Math.round(Math.min(5, Math.max(1, weighted)) * 100) / 100;
}

/**
 * Calcula el User Rating como promedio ponderado de sus tarjetas.
 * Cada tarjeta contribuye proporcional a su número de reseñas.
 *
 * @param cards Array de { numRatings, rawAverage } por cada tarjeta del usuario.
 * @returns Rating Bayesiano agregado del usuario (1.0–5.0).
 */
export function userAggregateRating(
  cards: Array<{ numRatings: number; rawAverage: number }>,
): number {
  if (cards.length === 0) return DEFAULT_RATING;

  let totalWeightedSum = 0;
  let totalRatings = 0;

  for (const card of cards) {
    if (card.numRatings > 0) {
      totalWeightedSum += card.numRatings * card.rawAverage;
      totalRatings += card.numRatings;
    }
  }

  return bayesianRating(totalRatings, totalRatings > 0 ? totalWeightedSum / totalRatings : 0);
}

export { DEFAULT_RATING, PRIOR_WEIGHT };
