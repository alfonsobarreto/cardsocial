const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['open', 'reviewed', 'dismissed'], default: 'open' },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
