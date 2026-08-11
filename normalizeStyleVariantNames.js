require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const STYLE_SLUGS = ['leopard-case', 'silicone-case', 'clear-case', 'magsafe-case'];

const CANONICAL_COLOR_MAP = new Map([
  ['stone gray', 'Stone Gray'],
  ['stone grey', 'Stone Gray'],
  ['midnight blue', 'Midnight Blue'],
  ['navy blue', 'Midnight Blue'],
  ['smoke clear', 'Smoked Clear'],
  ['smoked clear', 'Smoked Clear'],
  ['transparent', 'Crystal Clear'],
  ['crystal clear', 'Crystal Clear'],
  ['clear black rim', 'Clear Black Rim'],
  ['pink sand', 'Pink Sand'],
  ['black', 'Black'],
  ['grey', 'Gray'],
  ['gray', 'Gray'],
  ['blue', 'Blue'],
  ['classic leopard', 'Classic Leopard'],
  ['pink leopard', 'Pink Leopard'],
  ['mono leopard', 'Mono Leopard'],
  ['snow leopard', 'Snow Leopard'],
  ['purple leopard', 'Purple Leopard'],
  ['black magsafe', 'Black MagSafe'],
  ['clear magsafe', 'Clear MagSafe'],
  ['midnight blue magsafe', 'Midnight Blue MagSafe'],
]);

const normalizeName = (value) => String(value || '').trim().toLowerCase();

const canonicalizeColor = (variant) => {
  const raw = normalizeName(variant.color || variant.label);
  if (!raw) return '';
  return CANONICAL_COLOR_MAP.get(raw) || String(variant.color || variant.label).trim();
};

const mergeVariants = (variants, slug) => {
  const merged = new Map();

  for (const variant of variants || []) {
    const canonicalColor = canonicalizeColor(variant);
    if (!canonicalColor) continue;

    const key = normalizeName(canonicalColor);
    if (!merged.has(key)) {
      merged.set(key, {
        label: canonicalColor,
        color: canonicalColor,
        style: String(variant.style || '').trim() || 'Style',
        image: String(variant.image || '').trim(),
        price: Number(variant.price) || 0,
        stock: Math.max(0, Number(variant.stock) || 0),
      });
      continue;
    }

    const existing = merged.get(key);
    existing.stock += Math.max(0, Number(variant.stock) || 0);

    const nextPrice = Number(variant.price);
    if (Number.isFinite(nextPrice) && nextPrice > 0) {
      if (!existing.price || nextPrice < existing.price) {
        existing.price = nextPrice;
      }
    }

    if (!existing.image && variant.image) {
      existing.image = String(variant.image).trim();
    }
  }

  let index = 1;
  return Array.from(merged.values()).map((v) => ({
    ...v,
    sku: `CP-${slug.replace(/-case$/i, '').replace(/-/g, '').toUpperCase()}-IP-SERIES-${String(index++).padStart(2, '0')}`,
  }));
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({ slug: { $in: STYLE_SLUGS } });
  if (products.length === 0) {
    console.log('No canonical style products found.');
    await mongoose.connection.close();
    return;
  }

  for (const product of products) {
    const beforeCount = Array.isArray(product.variants) ? product.variants.length : 0;
    const mergedVariants = mergeVariants(product.variants, product.slug);

    if (mergedVariants.length === 0) {
      console.log(`Skipping ${product.slug}: no variants after merge.`);
      continue;
    }

    const minPrice = Math.min(...mergedVariants.map((v) => Number(v.price) || 0).filter((n) => n > 0));
    const stockTotal = mergedVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

    product.variants = mergedVariants;
    product.price = Number.isFinite(minPrice) ? minPrice : product.price;
    product.stock = stockTotal;

    await product.save();

    console.log(`${product.slug}: ${beforeCount} -> ${mergedVariants.length} variants`);
  }

  await mongoose.connection.close();
};

run().catch(async (err) => {
  console.error('Variant normalization failed:', err);
  await mongoose.connection.close();
  process.exit(1);
});
