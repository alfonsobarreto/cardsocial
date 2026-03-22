const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
    notes: { type: String, default: '' },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

contactSchema.index({ owner: 1, card: 1 }, { unique: true });

module.exports = mongoose.model('Contact', contactSchema);
