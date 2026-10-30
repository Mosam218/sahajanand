const mongoose = require('mongoose');

// Homepage carousel slide. Each slide points at one product.
const bannerSchema = new mongoose.Schema(
  {
    badge: { type: String, trim: true, default: '', maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subtitle: { type: String, trim: true, default: '', maxlength: 300 },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    facts: [{ type: String, trim: true, maxlength: 60 }],
    cta: { type: String, trim: true, default: 'Explore product', maxlength: 40 },
    tone: {
      type: String,
      enum: ['ice', 'steel', 'dark'],
      default: 'ice',
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

bannerSchema.index({ isActive: 1, sortOrder: 1 });

const Banner = mongoose.model('Banner', bannerSchema);

module.exports = Banner;
