'use strict';

/** Filtro estricto por tarjeta: solo eventos cuyo `cardId` canonical coincide. */
function cardAnalyticsCardIdFilter(cardRef) {
  const k = String(cardRef || '').trim();
  if (!k) {
    return null;
  }
  return { cardId: k };
}

/** Clave Mongo usada en `cardId` al registrar eventos (sid smart, bId negocio). */
function canonicalCardAnalyticsKey(owned, cardRef) {
  const ref = String(cardRef || '').trim();
  if (!owned?.row) {
    return ref;
  }
  const row = owned.row;
  if (owned.isBiz) {
    return String(row.bId || ref).trim();
  }
  return String(row.sid || row.bId || ref).trim();
}

module.exports = {
  cardAnalyticsCardIdFilter,
  canonicalCardAnalyticsKey,
};
