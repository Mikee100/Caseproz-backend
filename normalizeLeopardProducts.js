require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const LEOPARD_COLORS = [
  'Classic Leopard',
  'Pink Leopard',
  'Mono Leopard',
  'Snow Leopard',
  'Purple Leopard',
];

const uniqueStrings = (values) => {
  const seen = new Set();
  const result = [];

  values.forEach((value) => {
    const text = String(value || '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });

  return result;
};

const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (s) => s.toUpperCase())
    .trim();

const pickPrimaryImage = (products) => {
  for (const product of products) {
    if (Array.isArray(product.images) && product.images[0]) {
      return product.images[0];
    }
  }
  return '/placeholder-product.svg';
};

const buildVariantPalette = (products) => {
  const colorToVariant = new Map();

  for (const product of products) {
    for (const variant of product.variants || []) {
      const rawColor = variant.color || variant.label;
      const normalized = titleCase(rawColor);
      if (!normalized || !normalized.toLowerCase().includes('leopard')) continue;
      if (!colorToVariant.has(normalized)) {
        colorToVariant.set(normalized, variant);
      }
    }
  }

  const discovered = Array.from(colorToVariant.keys());
  const mergedPalette = uniqueStrings([...LEOPARD_COLORS, ...discovered]);

  return mergedPalette.map((colorName, index) => {
    const source = colorToVariant.get(colorName) || {};
    const fallbackPrice = Number(source.price);
    const fallbackStock = Number(source.stock);

    return {
      label: colorName,
      color: colorName,
      style: 'Leopard',
      image: String(source.image || '').trim(),
      price: Number.isFinite(fallbackPrice) ? fallbackPrice : 5990,
      stock: Number.isFinite(fallbackStock) && fallbackStock > 0 ? fallbackStock : 12,
      sku: `CP-LEOP-IP-SERIES-${String(index + 1).padStart(2, '0')}`,
    };
  });
};

const normalizeLeopardCatalog = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const leopardProducts = await Product.find({
    $or: [
      { name: /leopard/i },
      { slug: /leopard/i },
      { subCategory: /leopard/i },
      { category: /leopard/i },
      { 'variants.label': /leopard/i },
      { 'variants.style': /leopard/i },
      { categories: { $elemMatch: { $regex: /leopard/i } } },
    ],
  }).sort({ createdAt: -1 });

  if (leopardProducts.length === 0) {
    console.log('No leopard products found. Nothing to normalize.');
    await mongoose.connection.close();
    return;
  }

  console.log(`Found ${leopardProducts.length} leopard products.`);

  const preferredKeeper = leopardProducts.find((p) => p.slug === 'iphone-17-pro-leopard-case');
  const keeper = preferredKeeper || leopardProducts[0];
  const duplicates = leopardProducts.filter((p) => String(p._id) !== String(keeper._id));

  const variants = buildVariantPalette(leopardProducts);
  const minVariantPrice = Math.min(...variants.map((v) => Number(v.price) || 5990));
  const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  const primaryImage = pickPrimaryImage(leopardProducts);

  keeper.name = 'Leopard Case';
  keeper.slug = 'leopard-case';
  keeper.category = 'iPhone Cases';
  keeper.subCategory = 'iPhone 15/16/17 Series';
  keeper.description =
    'Signature leopard print iPhone case with multiple colorways and protective everyday build.';
  keeper.images = uniqueStrings([
    primaryImage,
    ...(Array.isArray(keeper.images) ? keeper.images : []),
  ]);
  keeper.variants = variants;
  keeper.price = minVariantPrice;
  keeper.stock = totalStock;
  keeper.isFeatured = true;
  keeper.onSale = false;
  keeper.isActive = true;
  keeper.keyFeatures = uniqueStrings([
    'Leopard pattern style',
    'Multiple colorways',
    'Protective fit',
  ]);
  keeper.categories = uniqueStrings([
    ...(Array.isArray(keeper.categories) ? keeper.categories : []),
    'Leopard',
    'Case Style',
  ]);

  await keeper.save();
  console.log(`Updated keeper: ${keeper.slug} (${keeper._id})`);

  if (duplicates.length > 0) {
    const duplicateIds = duplicates.map((p) => p._id);
    const deleteResult = await Product.deleteMany({ _id: { $in: duplicateIds } });
    console.log(`Removed duplicates: ${deleteResult.deletedCount}`);
  }

  const remaining = await Product.find({
    $or: [{ name: /leopard/i }, { slug: /leopard/i }, { 'variants.style': /leopard/i }],
  }).select('name slug subCategory variants');

  console.log('\nRemaining leopard entries:');
  remaining.forEach((p) => {
    console.log(`- ${p.slug} | ${p.subCategory} | variants=${(p.variants || []).length}`);
  });

  await mongoose.connection.close();
};

normalizeLeopardCatalog().catch(async (error) => {
  console.error('Failed to normalize leopard products:', error);
  await mongoose.connection.close();
  process.exit(1);
});
