require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const STYLE_CONFIGS = [
  {
    key: 'silicone',
    name: 'Silicone Case',
    slug: 'silicone-case',
    subCategory: 'iPhone 15/16/17 Series',
    terms: [/silicone/i],
    defaultColors: ['Black', 'Midnight Blue', 'Pine Green', 'Stone Gray'],
  },
  {
    key: 'clear',
    name: 'Clear Case',
    slug: 'clear-case',
    subCategory: 'iPhone 15/16/17 Series',
    terms: [/\bclear\b/i, /transparent/i],
    defaultColors: ['Crystal Clear', 'Smoke Clear', 'Frosted Clear'],
  },
  {
    key: 'magsafe',
    name: 'MagSafe Case',
    slug: 'magsafe-case',
    subCategory: 'iPhone 15/16/17 Series',
    terms: [/magsafe/i, /mag\s*safe/i],
    defaultColors: ['Black MagSafe', 'Clear MagSafe', 'Midnight Blue MagSafe'],
  },
];

const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (s) => s.toUpperCase())
    .trim();

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

const buildHaystack = (product) =>
  [
    product.name,
    product.slug,
    product.category,
    product.subCategory,
    ...(product.categories || []),
    ...(product.keyFeatures || []),
    ...((product.variants || []).map((v) => v.label)),
    ...((product.variants || []).map((v) => v.style)),
    ...((product.variants || []).map((v) => v.color)),
  ]
    .filter(Boolean)
    .join(' ');

const matchesStyle = (product, styleConfig) => {
  const haystack = buildHaystack(product);
  return styleConfig.terms.some((rx) => rx.test(haystack));
};

const pickPrimaryImage = (products) => {
  for (const product of products) {
    if (Array.isArray(product.images) && product.images[0]) {
      return product.images[0];
    }
  }
  return '/placeholder-product.svg';
};

const buildStyleVariants = (styleKey, sourceProducts, defaultColors) => {
  const colorToVariant = new Map();

  for (const product of sourceProducts) {
    for (const variant of product.variants || []) {
      const rawColor = variant.color || variant.label;
      const normalized = titleCase(rawColor);
      if (!normalized) continue;

      const looksLikeOtherStyle =
        (styleKey !== 'magsafe' && /magsafe|mag\s*safe/i.test(normalized)) ||
        (styleKey !== 'silicone' && /silicone/i.test(normalized)) ||
        (styleKey !== 'clear' && /clear|transparent/i.test(normalized));

      if (looksLikeOtherStyle) continue;
      if (!colorToVariant.has(normalized)) {
        colorToVariant.set(normalized, variant);
      }
    }
  }

  const discoveredColors = Array.from(colorToVariant.keys());
  const palette = uniqueStrings([...discoveredColors, ...defaultColors]).slice(0, 8);

  return palette.map((colorName, index) => {
    const source = colorToVariant.get(colorName) || {};
    const price = Number(source.price);
    const stock = Number(source.stock);

    return {
      label: colorName,
      color: colorName,
      style: styleKey === 'magsafe' ? 'MagSafe' : titleCase(styleKey),
      image: String(source.image || '').trim(),
      price: Number.isFinite(price) ? price : 5990,
      stock: Number.isFinite(stock) && stock > 0 ? stock : 12,
      sku: `CP-${styleKey.toUpperCase()}-IP-SERIES-${String(index + 1).padStart(2, '0')}`,
    };
  });
};

const chooseKeeperFromMatches = (matches, keepersInUse) => {
  if (matches.length === 0) return null;

  const sorted = [...matches].sort((a, b) => {
    const aVariants = Array.isArray(a.variants) ? a.variants.length : 0;
    const bVariants = Array.isArray(b.variants) ? b.variants.length : 0;
    return bVariants - aVariants;
  });

  const available = sorted.find((p) => !keepersInUse.has(String(p._id)));
  return available || sorted[0];
};

const normalizeStyles = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const allProducts = await Product.find({});
  const keepersByStyle = new Map();

  for (const style of STYLE_CONFIGS) {
    const matches = allProducts.filter((p) => matchesStyle(p, style));
    if (matches.length === 0) {
      console.log(`[${style.key}] no matches found, skipping.`);
      continue;
    }

    const inUse = new Set(Array.from(keepersByStyle.values()).map((p) => String(p._id)));
    const keeper = chooseKeeperFromMatches(matches, inUse);
    if (!keeper) continue;

    keepersByStyle.set(style.key, keeper);

    const variants = buildStyleVariants(style.key, matches, style.defaultColors);
    const minVariantPrice = Math.min(...variants.map((v) => Number(v.price) || 5990));
    const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    const primaryImage = pickPrimaryImage(matches);

    keeper.name = style.name;
    keeper.slug = style.slug;
    keeper.category = 'iPhone Cases';
    keeper.subCategory = style.subCategory;
    keeper.description = `${style.name} for iPhone 15/16/17 series with multiple color options and reliable daily protection.`;
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
      `${style.name} finish`,
      'Multiple color variants',
      'Everyday protection',
    ]);
    keeper.categories = uniqueStrings([
      ...(Array.isArray(keeper.categories) ? keeper.categories : []),
      titleCase(style.key),
      'Case Style',
    ]);

    await keeper.save();
    console.log(`[${style.key}] keeper updated: ${keeper.slug}`);
  }

  const keeperIds = new Set(Array.from(keepersByStyle.values()).map((p) => String(p._id)));
  const idsToDelete = new Set();

  for (const style of STYLE_CONFIGS) {
    const matches = allProducts.filter((p) => matchesStyle(p, style));
    for (const product of matches) {
      const id = String(product._id);
      if (!keeperIds.has(id)) {
        idsToDelete.add(id);
      }
    }
  }

  if (idsToDelete.size > 0) {
    const deleteResult = await Product.deleteMany({ _id: { $in: Array.from(idsToDelete) } });
    console.log(`Removed duplicates across styles: ${deleteResult.deletedCount}`);
  } else {
    console.log('No duplicates to remove.');
  }

  for (const style of STYLE_CONFIGS) {
    const products = await Product.find({
      $or: [
        { slug: style.slug },
        { name: new RegExp(style.key, 'i') },
        { 'variants.style': new RegExp(style.key, 'i') },
      ],
    }).select('name slug subCategory variants');

    console.log(`\n[${style.key}] remaining products: ${products.length}`);
    products.forEach((p) => {
      console.log(`- ${p.slug} | ${p.subCategory} | variants=${(p.variants || []).length}`);
    });
  }

  await mongoose.connection.close();
};

normalizeStyles().catch(async (error) => {
  console.error('Failed to normalize style products:', error);
  await mongoose.connection.close();
  process.exit(1);
});
