// models/review.js
const { Schema, model } = require('mongoose');

const reviewSchema = new Schema({
  cardId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  stars: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

reviewSchema.index({ cardId: 1, userId: 1 }, { unique: true });

module.exports = model('Review', reviewSchema);