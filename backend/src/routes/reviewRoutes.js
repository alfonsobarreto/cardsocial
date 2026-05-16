// routes/reviewRoutes.js
const express = require('express');
const Review = require('../models/review');
const { buildUserFacingJson } = require('../lib/userFacingErrors');

function createReviewRoutes({ storage }) {
  const router = express.Router();

  // POST /api/cards/review
  router.post('/cards/review', async (req, res) => {
    try {
      const { bId, userId, stars, comment } = req.body;
      if (!bId || !userId || !stars) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
      }
      if (stars < 1 || stars > 5) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REVIEW_STARS_INVALID'));
      }
      const db = await storage.connect();
      const now = new Date();
      const review = await db.collection('reviews').findOneAndUpdate(
        { bId, userId },
        {
          $set: { stars, comment: comment || '', updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, returnDocument: 'after' }
      );
      return res.status(200).json({ ok: true, review: review.value });
    } catch (error) {
      console.error('[POST /api/cards/review]', error?.message || error, error?.stack);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  });

  return router;
}

module.exports = createReviewRoutes;
