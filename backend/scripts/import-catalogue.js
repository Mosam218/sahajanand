/**
 * One-shot catalogue import.
 *
 * Creates categories, uploads photos, then creates products. Safe to run
 * again: a category that already exists (same slug) and a product that
 * already exists (same slug, SKU, or model) are left untouched.
 *
 * From backend/:
 *
 *   npm run import:catalogue -- --json /path/to/products.json --photos /path/to/photos.zip
 *   npm run import:catalogue -- --json /path/to/products.json --photos /path/to/photos-folder --dry-run
 *
 * --dry-run checks the JSON and matches every photo. It does not write to
 * the database and does not upload anything.
 *
 * JSON shape (categories may be omitted; they are created from the category
 * names on the products):
 *
 * {
 *   "categories": [
 *     {
 *       "name": "Deep Freezers",
 *       "slug": "deep-freezers",
 *       "shortName": "Freezers",
 *       "description": "",
 *       "image": "freezer.jpg",
 *       "subcategories": ["Chest", "Upright"],
 *       "sortOrder": 1
 *     }
 *   ],
 *   "products": [
 *     {
 *       "name": "Chest Freezer 300 L",
 *       "model": "CF 300",
 *       "sku": "CF-300",
 *       "brand": "",
 *       "category": "deep-freezers",
 *       "subcategory": "Chest",
 *       "description": "",
 *       "price": 45000,
 *       "mrp": 52000,
 *       "stock": 0,
 *       "images": ["cf-300-front.jpg", "cf-300-side.jpg"],
 *       "specs": [{ "key": "Capacity", "value": "300 L" }],
 *       "features": [],
 *       "warrantyMonths": 12
 *     }
 *   ]
 * }
 *
 * An image value is a file name from the zip (matched by file name, ignoring
 * case and folders) or an https URL stored as-is. "image" may be a string
 * or a list. specs may be { key, value } objects or a plain object.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const slugify = require('slugify');
const config = require('../src/config/env');
const cloudinaryService = require('../src/integrations/cloudinary/cloudinary.service');
const { UPLOADS_DIR } = require('../src/middleware/upload.middleware');
const { Category, Product } = require('../src/models');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) return '';
  return process.argv[i + 1];
}

const jsonPath = arg('--json') ? path.resolve(arg('--json')) : '';
const photosPath = arg('--photos') ? path.resolve(arg('--photos')) : '';
const dryRun = process.argv.includes('--dry-run');

function slugOf(value) {
  return slugify(String(value || ''), { lower: true, strict: true });
}

function asList(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function titleCase(value) {
  const text = String(value || '').trim();
  if (!text || text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/(^|[^a-z0-9])([a-z])/g, (match, sep, letter) => sep + letter.toUpperCase())
    .replace(/\bSs\b/g, 'SS');
}

function tempFromSpecs(specs) {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return undefined;
  const entry = Object.entries(specs).find(([key]) => /temp/i.test(key));
  if (!entry) return undefined;
  const nums = String(entry[1]).match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return undefined;
  const a = Number(nums[0]);
  const b = Number(nums[1]);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  let tempClass = 'Chiller';
  if (min >= 30) tempClass = 'Heated';
  else if (min <= -40) tempClass = 'Ultra-low';
  else if (min < 0 && max > 0) tempClass = 'Dual / convertible';
  else if (max <= 0) tempClass = 'Freezer';
  return { temp: { min, max }, tempClass };
}

function capacityFromSpecs(specs) {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return null;
  const entry = Object.entries(specs).find(([key]) => /capacity/i.test(key));
  if (!entry) return null;
  const match = String(entry[1]).match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

// The Elanpro export nests products inside categories and uses model_no /
// product_description instead of the store's field names. Flatten that into
// the same shape as a hand-written catalogue file.
function flattenElanpro(raw) {
  const brand = raw.brand || '';
  const categories = [];
  const products = [];
  raw.categories.forEach((cat, index) => {
    const name = String(cat.category || cat.name || '').trim();
    const nested = cat.products || [];
    const subcategories = [];
    for (const product of nested) {
      for (const sub of product.website_categories || []) {
        const label = String(sub || '').trim();
        if (label && !subcategories.includes(label)) subcategories.push(label);
      }
    }
    categories.push({
      name,
      sortOrder: index + 1,
      subcategories,
    });
    nested.forEach((product, productIndex) => {
      const specs = product.specifications || product.specs || {};
      const range = tempFromSpecs(specs);
      const capacityL = capacityFromSpecs(specs);
      const hasPrice = product.price != null || product.sellingPrice != null;
      const price = Number(product.price ?? product.sellingPrice ?? 0);
      const mrp = Number(product.mrp ?? product.MRP ?? price);
      products.push({
        name: titleCase(product.product_description || product.website_name || product.model_no),
        model: product.model_no || product.model || '',
        brand: product.brand || brand,
        category: name,
        subcategory: (product.website_categories && product.website_categories[0]) || '',
        price,
        mrp,
        priceSource: hasPrice ? product.priceSource || 'confirmed' : 'indicative',
        stock: product.stock ?? 0,
        images: product.images || [],
        specs,
        features: product.features || [],
        isFeatured: product.product_type === 'HERO',
        sortOrder: productIndex + 1,
        temp: range && range.temp,
        tempClass: range && range.tempClass,
        ...(capacityL == null ? {} : { capacityL }),
      });
    });
  });
  return { categories, products };
}

function loadCatalogue(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const nested = !Array.isArray(raw) && Array.isArray(raw.categories) && raw.categories.some((cat) => Array.isArray(cat.products));
  if (nested) return flattenElanpro(raw);
  const products = Array.isArray(raw) ? raw : raw.products;
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('JSON must contain a non-empty "products" array');
  }
  return { categories: Array.isArray(raw) ? [] : raw.categories || [], products };
}

function collectFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__MACOSX' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  };
  walk(root);
  return files;
}

function openPhotos(source) {
  if (!source) return { root: '', files: [], cleanup() {} };
  if (!fs.existsSync(source)) throw new Error(`Photos not found: ${source}`);
  if (fs.statSync(source).isDirectory()) {
    return { root: source, files: collectFiles(source), cleanup() {} };
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-'));
  execFileSync('unzip', ['-q', '-o', source, '-d', root]);
  return {
    root,
    files: collectFiles(root),
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function modelKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function fileModelKey(file) {
  const base = path.basename(file, path.extname(file));
  return modelKey(base.replace(/[_-]?\d+$/, ''));
}

function indexPhotos(root, files) {
  const byPath = new Map();
  const byName = new Map();
  const byModel = new Map();
  for (const file of files) {
    const rel = root ? path.relative(root, file).split(path.sep).join('/').toLowerCase() : '';
    const base = path.basename(file).toLowerCase();
    if (rel) byPath.set(rel, file);
    if (!byName.has(base)) byName.set(base, []);
    byName.get(base).push(file);
    const key = fileModelKey(file);
    if (!key) continue;
    if (!byModel.has(key)) byModel.set(key, []);
    byModel.get(key).push(file);
  }
  for (const list of byModel.values()) list.sort();
  return { byPath, byName, byModel };
}

function matchPhoto(ref, index, label) {
  const text = String(ref || '').trim();
  if (!text) return { error: `${label}: empty image name` };
  if (/^https?:\/\//i.test(text)) return { remote: text };
  const key = text.split(/[\\/]/).join('/').toLowerCase();
  if (index.byPath.get(key)) return { file: index.byPath.get(key) };
  const matches = index.byName.get(path.basename(key)) || [];
  if (matches.length === 1) return { file: matches[0] };
  if (matches.length > 1) {
    return { error: `${label}: "${text}" matches ${matches.length} photos — use the folder path inside the zip` };
  }
  return { error: `${label}: photo not found: ${text}` };
}

function imageRefs(value) {
  return asList(value)
    .map((item) => (item && typeof item === 'object' ? item.url || item.file || item.src || item.name || '' : item))
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function planImages(refs, index, label) {
  const images = [];
  const errors = [];
  for (const ref of refs) {
    const found = matchPhoto(ref, index, label);
    if (found.error) errors.push(found.error);
    else images.push(found);
  }
  return { images, errors };
}

function normaliseSpecs(specs) {
  if (!specs) return [];
  if (Array.isArray(specs)) {
    return specs
      .map((item) =>
        item && typeof item === 'object'
          ? { key: String(item.key || item.label || '').trim(), value: String(item.value ?? '').trim() }
          : null
      )
      .filter((item) => item && item.key);
  }
  if (typeof specs === 'object') {
    return Object.entries(specs)
      .map(([key, value]) => ({ key: String(key).trim(), value: String(value ?? '').trim() }))
      .filter((item) => item.key);
  }
  return [];
}

function normaliseTemp(temp) {
  if (!temp) return undefined;
  if (Array.isArray(temp) && temp.length >= 2) return { min: Number(temp[0]), max: Number(temp[1]) };
  if (typeof temp === 'object' && temp.min != null && temp.max != null) {
    return { min: Number(temp.min), max: Number(temp.max) };
  }
  return undefined;
}

function categoryKey(value) {
  const raw = typeof value === 'object' && value ? value.slug || value.name : value;
  return slugOf(raw);
}

function categoryName(value, slug) {
  if (typeof value === 'object' && value) return String(value.name || value.slug || slug).trim();
  const text = String(value || '').trim();
  return text || slug;
}

async function storeImage(file, folder) {
  if (!config.cloudinary.enabled) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const name = `${crypto.randomBytes(16).toString('hex')}${path.extname(file).toLowerCase()}`;
    fs.copyFileSync(file, path.join(UPLOADS_DIR, name));
    return { url: `${config.publicApiUrl}/uploads/${name}`, publicId: `local:${name}` };
  }
  const staged = path.join(os.tmpdir(), `${crypto.randomBytes(8).toString('hex')}${path.extname(file)}`);
  fs.copyFileSync(file, staged);
  return cloudinaryService.uploadImage(staged, folder);
}

async function materialise(planned, folder) {
  const images = [];
  for (const item of planned) {
    if (item.remote) images.push({ url: item.remote, publicId: '' });
    else images.push(await storeImage(item.file, folder));
  }
  return images;
}

async function main() {
  if (!jsonPath) throw new Error('Pass --json /path/to/products.json');
  if (!fs.existsSync(jsonPath)) throw new Error(`JSON not found: ${jsonPath}`);

  const catalogue = loadCatalogue(jsonPath);
  const photos = openPhotos(photosPath);
  try {
    const index = indexPhotos(photos.root, photos.files);
    const errors = [];
    const warnings = [];

    console.log(`Products in JSON: ${catalogue.products.length}`);
    console.log(`Categories in JSON: ${catalogue.categories.length}`);
    console.log(`Photos found: ${photos.files.length}`);
    console.log(config.cloudinary.enabled ? 'Images: Cloudinary' : `Images: local uploads (${config.publicApiUrl}/uploads)`);
    if (dryRun) console.log('Dry run: nothing will be written.');

    const categoryPlan = [];
    const seenCategory = new Set();

    for (const [i, data] of catalogue.categories.entries()) {
      const name = String(data.name || '').trim();
      const slug = slugOf(data.slug || name);
      if (!name || !slug) {
        errors.push(`categories[${i}]: name is required`);
        continue;
      }
      seenCategory.add(slug);
      const imageValue = data.image && typeof data.image === 'object' ? data.image.url : data.image || data.photo;
      const planned = planImages(imageRefs(imageValue), index, `category "${name}"`);
      errors.push(...planned.errors);
      let scene = '';
      if (typeof data.scene === 'string' && data.scene.trim()) {
        if (/^https?:\/\//i.test(data.scene) || data.scene.startsWith('/')) scene = data.scene.trim();
        else {
          const scenePlan = planImages([data.scene], index, `category "${name}" scene`);
          errors.push(...scenePlan.errors);
          scene = scenePlan.images[0] || '';
        }
      }
      categoryPlan.push({
        slug,
        image: planned.images[0] || null,
        scene,
        doc: {
          name,
          slug,
          shortName: data.shortName || '',
          tagline: data.tagline || '',
          description: data.description || '',
          subcategories: asList(data.subcategories).map((s) => String(s).trim()).filter(Boolean),
          isFeatured: Boolean(data.isFeatured ?? data.featured),
          isActive: data.isActive !== false,
          sortOrder: Number(data.sortOrder || i + 1),
        },
      });
    }

    for (const data of catalogue.products) {
      const raw = data.category || data.categoryName || data.categorySlug || '';
      const slug = categoryKey(raw);
      if (!slug || seenCategory.has(slug)) continue;
      seenCategory.add(slug);
      categoryPlan.push({
        slug,
        image: null,
        scene: '',
        doc: {
          name: categoryName(raw, slug),
          slug,
          sortOrder: categoryPlan.length + 1,
          isActive: true,
        },
      });
    }

    const productPlan = [];
    for (const [i, data] of catalogue.products.entries()) {
      const name = String(data.name || data.title || '').trim();
      const model = String(data.model || data.modelNo || data.modelNumber || '').trim();
      const label = model || name || `products[${i}]`;
      const price = Number(data.price ?? data.sellingPrice);
      const mrp = Number(data.mrp ?? data.MRP ?? data.price ?? data.sellingPrice);
      const category = categoryKey(data.category || data.categoryName || data.categorySlug || '');
      const rowErrors = [];
      if (!name && !model) rowErrors.push(`${label}: name or model is required`);
      if (!category) rowErrors.push(`${label}: category is required`);
      if (!Number.isFinite(price) || price < 0) rowErrors.push(`${label}: price must be a number`);
      if (!Number.isFinite(mrp) || mrp < 0) rowErrors.push(`${label}: mrp must be a number`);
      if (Number.isFinite(price) && Number.isFinite(mrp) && price > mrp) {
        rowErrors.push(`${label}: price cannot be greater than mrp`);
      }

      const local = model ? index.byModel.get(modelKey(model)) || [] : [];
      let planned;
      if (local.length) {
        planned = { images: local.slice(0, 8).map((file) => ({ file })), errors: [] };
      } else {
        const refs = imageRefs(data.images || data.photos || data.image);
        planned = planImages(refs, index, label);
        if (!planned.images.length && !planned.errors.length) {
          warnings.push(`${label}: no photo in the zip or the JSON — the store will show a placeholder`);
        }
      }
      rowErrors.push(...planned.errors);
      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      productPlan.push({
        label,
        slug: slugOf(data.slug || model || name),
        sku: String(data.sku || data.SKU || '').trim(),
        model,
        category,
        images: planned.images,
        doc: {
          name: name || model,
          model,
          slug: data.slug ? slugOf(data.slug) : undefined,
          description: data.description || '',
          shortDescription: data.shortDescription || data.summary || '',
          brand: data.brand || '',
          subcategory: data.subcategory || '',
          familyId: data.familyId || '',
          familyName: data.familyName || '',
          price,
          mrp,
          priceSource: ['confirmed', 'listed', 'indicative'].includes(data.priceSource)
            ? data.priceSource
            : 'confirmed',
          stock: Number.isFinite(Number(data.stock)) ? Number(data.stock) : 0,
          sku: String(data.sku || data.SKU || '').trim() || undefined,
          specs: normaliseSpecs(data.specs || data.specifications),
          warrantyMonths: Number(data.warrantyMonths || 0),
          features: asList(data.features).map((s) => String(s).trim()).filter(Boolean),
          applications: asList(data.applications).map((s) => String(s).trim()).filter(Boolean),
          badges: asList(data.badges).map((s) => String(s).trim()).filter(Boolean),
          temp: normaliseTemp(data.temp),
          tempClass: data.tempClass || '',
          ...(data.capacityL == null || data.capacityL === '' ? {} : { capacityL: Number(data.capacityL) }),
          refrigerant: data.refrigerant || '',
          cooling: data.cooling || '',
          tags: asList(data.tags).map((s) => String(s).trim()).filter(Boolean),
          isFeatured: Boolean(data.isFeatured ?? data.featured),
          isActive: data.isActive !== false,
          sortOrder: Number(data.sortOrder || i + 1),
        },
      });
    }

    for (const category of categoryPlan) {
      if (category.image) continue;
      const donor = productPlan.find((item) => item.category === category.slug && item.images[0]);
      if (donor) category.image = donor.images[0];
    }

    if (warnings.length) {
      console.log(`\n${warnings.length} product(s) have no photo:`);
      for (const warning of warnings) console.log(`  - ${warning}`);
    }

    if (errors.length) {
      console.error(`\n${errors.length} problem(s):\n`);
      for (const error of errors) console.error(`  - ${error}`);
      throw new Error('Fix the JSON or the photo names, then run again');
    }

    console.log(`\nReady: ${categoryPlan.length} categories, ${productPlan.length} products.`);
    if (dryRun) {
      for (const item of productPlan) {
        console.log(`  ${item.label} → ${item.category} (${item.images.length} photo(s))`);
      }
      return;
    }

    await mongoose.connect(config.mongo.uri);
    console.log('Connected to MongoDB\n');

    const categoryIds = {};
    let categoriesCreated = 0;
    for (const item of categoryPlan) {
      let category = await Category.findOne({ slug: item.slug });
      if (!category) category = await Category.findOne({ name: item.doc.name });
      if (category) {
        categoryIds[item.slug] = category._id;
        console.log(`  = Category exists: ${category.name}`);
        continue;
      }
      const image = item.image ? (await materialise([item.image], `sahajanand/categories/${item.slug}`))[0] : { url: '', publicId: '' };
      let scene = '';
      if (item.scene && typeof item.scene === 'object') {
        scene = (await materialise([item.scene], `sahajanand/categories/${item.slug}`))[0].url;
      } else scene = item.scene || '';
      category = await Category.create({ ...item.doc, image, scene });
      categoryIds[item.slug] = category._id;
      categoriesCreated++;
      console.log(`  + Category: ${category.name}`);
    }

    let created = 0;
    let skipped = 0;
    for (const item of productPlan) {
      const categoryId = categoryIds[item.category];
      const existing = await Product.findOne({
        $or: [
          item.slug ? { slug: item.slug } : null,
          item.sku ? { sku: item.sku } : null,
          item.model ? { model: item.model } : null,
        ].filter(Boolean),
      });
      if (existing) {
        skipped++;
        console.log(`  = Product exists: ${item.label}`);
        continue;
      }
      const images = await materialise(item.images, `sahajanand/products/${item.category}`);
      await Product.create({ ...item.doc, category: categoryId, images });
      created++;
      console.log(`  + Product: ${item.label}`);
    }

    console.log(`\nDone. Categories added: ${categoriesCreated}. Products added: ${created}. Already present: ${skipped}.`);
    console.log('Stock is whatever the JSON says (0 when omitted). Change it later from the admin panel.');
  } finally {
    photos.cleanup();
    if (mongoose.connection.readyState) await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(`\nImport failed: ${err.message}`);
  process.exitCode = 1;
});
