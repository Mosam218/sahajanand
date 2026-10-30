const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    shortName: {
      type: String,
      trim: true,
      default: '',
      maxlength: 40,
    },
    tagline: {
      type: String,
      trim: true,
      default: '',
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    image: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    // Wide banner photo behind the category page header
    scene: {
      type: String,
      trim: true,
      default: '',
    },
    subcategories: [{ type: String, trim: true }],
    isFeatured: {
      type: Boolean,
      default: false,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
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

// Generate the slug once. It is kept when the category is renamed so that
// existing links and search results keep working.
categorySchema.pre('save', async function (next) {
  if (!this.slug) {
    let baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;

    // Check for collision and add numeric suffix
    while (await mongoose.model('Category').findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }
  next();
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
