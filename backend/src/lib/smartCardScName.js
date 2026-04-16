'use strict';

/**
 * Título de tarjeta en MongoDB `smart_cards`. Solo `scName` (ejecutar migración si hay docs viejos).
 *
 * @param {object|null|undefined} cardDoc
 * @returns {string}
 */
function readSmartCardScName(cardDoc) {
  if (!cardDoc || typeof cardDoc !== 'object') {
    return '';
  }
  return String(cardDoc.scName || '').trim();
}

module.exports = { readSmartCardScName };
