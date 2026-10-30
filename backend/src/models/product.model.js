const mongoose = require('mongoose');
const slugify = require('slugify');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    // Manufacturer model number, e.g. "EGN 1500 C4"
    model: {
      type: String,
      trim: true,
      default: '',
      maxlength: 100,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 5000,
    },
    shortDescription: {
      type: String,
      trim: true,
      default: '',
      maxlength: 300,
    },
    brand: {
      type: String,
      trim: true,
      default: '',
      maxlength: 100,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    subcategory: {
      type: String,
      trim: true,
      default: '',
      maxlength: 100,
    },
    // Products of one series share a family and are listed as variants
    familyId: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    familyName: {
      type: String,
      trim: true,
      default: '',
      maxlength: 200,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    // 'confirmed' = set by the store; 'listed' / 'indicative' = imported
    // reference prices that still need confirming.
    priceSource: {
      type: String,
      enum: ['confirmed', 'listed', 'indicative'],
      default: 'confirmed',
    },
    mrp: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    images: [
      {
        url: { type: String, required: true },
        // Empty for catalogue images referenced by URL (nothing to delete)
        publicId: { type: String, default: '' },
      },
    ],
    specs: [
      {
        key: { type: String, trim: true },
        value: { type: String, trim: true },
      },
    ],
    warrantyMonths: {
      type: Number,
      default: 0,
      min: 0,
    },
    features: [{ type: String, trim: true }],
    applications: [{ type: String, trim: true }],
    badges: [{ type: String, trim: true }],
    // Operating temperature range in °C
    temp: {
      min: { type: Number },
      max: { type: Number },
    },
    tempClass: {
      type: String,
      enum: ['', 'Ultra-low', 'Freezer', 'Dual / convertible', 'Chiller', 'Heated'],
      default: '',
    },
    capacityL: {
      type: Number,
      min: 0,
      default: null,
    },
    refrigerant: {
      type: String,
      trim: true,
      default: '',
    },
    cooling: {
      type: String,
      trim: true,
      default: '',
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    soldCount: {
      type: Number,
      default: 0,
      min: 0,
    },
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

// Validate price <= mrp
productSchema.pre('validate', function (next) {
  // An empty SKU must be stored as "missing": the unique sparse index would
  // otherwise let only one product exist without a SKU.
  if (this.sku === '') this.sku = undefined;
  if (this.price > this.mrp) {
    this.invalidate('price', 'Price cannot be greater than MRP');
  }
  next();
});

// Compute discountPercent and generate slug before saving
productSchema.pre('save', async function (next) {
  // Compute discount
  if (this.mrp > 0 && this.price <= this.mrp) {
    this.discountPercent = Math.round(((this.mrp - this.price) / this.mrp) * 100);
  } else {
    this.discountPercent = 0;
  }

  // Generate the slug once, from the model number when there is one. It is
  // kept on rename so product links stay valid.
  if (!this.slug) {
    let baseSlug = slugify(this.model || this.name, { lower: true, strict: true }) || 'product';
    let slug = baseSlug;
    let counter = 1;

    while (await mongoose.model('Product').findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }

  // Limit images to 8
  if (this.images && this.images.length > 8) {
    this.images = this.images.slice(0, 8);
  }

  next();
});

// Text index for search
productSchema.index(
  { name: 'text', model: 'text', brand: 'text', subcategory: 'text', description: 'text', tags: 'text' },
  { weights: { model: 12, name: 10, brand: 5, subcategory: 4, tags: 3, description: 1 } }
);

// Compound indexes
productSchema.index({ category: 1, price: 1 });
productSchema.index({ isActive: 1, isFeatured: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, soldCount: -1 });
productSchema.index({ isActive: 1, stock: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
