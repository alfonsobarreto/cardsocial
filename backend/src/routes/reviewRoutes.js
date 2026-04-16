// routes/reviewRoutes.js
const express = require('express');
const Review = require('../models/review');

function createReviewRoutes({ storage }) {
  const router = express.Router();

  // POST /api/cards/review
  router.post('/cards/review', async (req, res) => {
    try {
      const { bId, userId, stars, comment } = req.body;
      if (!bId || !userId || !stars) {
        return res.status(400).json({ ok: false, error: 'bId, userId y stars son obligatorios' });
      }
      if (stars < 1 || stars > 5) {
        return res.status(400).json({ ok: false, error: 'stars debe estar entre 1 y 5' });
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
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = createReviewRoutes;
