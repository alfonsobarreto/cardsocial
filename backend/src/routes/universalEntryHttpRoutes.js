/**
 * Entrada HTTP GET /u/:token en el mismo proceso que la API (Azure).
 * Valida temporary_access (24h); si es válido sirve la Web de Cortesía completa (clon de la tarjeta).
 * Si el token está expirado/inválido muestra una página de error bilingüe.
 *
 * Enrutamiento sugerido (Azure Front Door / Application Gateway / nginx):
 * - Enviar https://cardsocial.me/u/* a este backend.
 */

'use strict';

const express = require('express');
const { parseAndValidateTemporaryAccess } = require('../lib/temporaryAccessToken');
const { buildCourtesyHtml, buildExpiredHtml } = require('../lib/universalCourtesyHtml');

function createUniversalEntryHttpRoutes({ storage }) {
  const router = express.Router();

  router.get('/u/:token', async (req, res) => {
    const acceptLanguage = req.headers['accept-language'] || '';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    try {
      const token = String(req.params.token || '').trim();

      if (!token) {
        return res.status(400).send(buildExpiredHtml(acceptLanguage));
      }

      const db = await storage.connect();
      const validation = await parseAndValidateTemporaryAccess(db, token);

      if (!validation.ok) {
        return res.status(200).send(buildExpiredHtml(acceptLanguage));
      }

      const { ownerUid, cardId } = validation;

      // Fetch card data to build the courtesy mirror
      const cardDoc = await db.collection('smart_cards').findOne(
        { ownerUid, cardId },
        {
          projection: {
            name: 1,
            ownerDisplayName: 1,
            ownerNickname: 1,
            ownerPhotoUrl: 1,
            ownerOccupation: 1,
            publicCardSlots: 1,
            holdersCount: 1,
            ratingAvg: 1,
          },
        },
      );

      if (!cardDoc) {
        return res.status(200).send(buildExpiredHtml(acceptLanguage));
      }

      const slots = Array.isArray(cardDoc.publicCardSlots) ? cardDoc.publicCardSlots : [];
      const publicSlots = slots
        .filter((s) => !s.isPrivate && String(s.visibility || '').toLowerCase() !== 'private')
        .slice(0, 8)
        .map((s) => ({
          type: String(s.type || 'link').trim(),
          label: String(s.label || '').trim(),
          value: String(s.value || '').trim(),
        }));

      const html = buildCourtesyHtml({
        token,
        ownerDisplayName: String(cardDoc.ownerDisplayName || cardDoc.ownerNickname || 'Card-Social'),
        ownerNickname: cardDoc.ownerNickname ? String(cardDoc.ownerNickname) : null,
        ownerOccupation: cardDoc.ownerOccupation ? String(cardDoc.ownerOccupation) : null,
        ownerPhotoUrl: cardDoc.ownerPhotoUrl ? String(cardDoc.ownerPhotoUrl) : null,
        cardName: String(cardDoc.name || 'Smart Card'),
        slots: publicSlots,
        holdersCount: Number(cardDoc.holdersCount || 0),
        ratingAvg: Number(cardDoc.ratingAvg || 5),
        acceptLanguage,
      });

      return res.status(200).send(html);
    } catch (error) {
      console.error('[GET /u/:token]', error?.message || error);
      return res.status(500).send(buildExpiredHtml(acceptLanguage));
    }
  });

  return router;
}

module.exports = {
  createUniversalEntryHttpRoutes,
};
