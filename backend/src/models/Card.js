const mongoose = require('mongoose');

const socialLinkSchema = new mongoose.Schema(
  {
    platform: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const cardSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    jobTitle: { type: String, trim: true, default: '' },
    company: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },
    avatar: { type: String, default: '' },
    socialLinks: { type: [socialLinkSchema], default: [] },
    isPublic: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    slug: { type: String, unique: true, sparse: true },
    qrCode: { type: String, default: '' },
    viewCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    moderationNote: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Card', cardSchema);
