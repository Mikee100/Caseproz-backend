const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Product = require('./models/Product');

dotenv.config();

const MODELS = [
  'iPhone 17 Pro Max',
  'iPhone 17 Pro',
  'iPhone 17',
  'iPhone 16 Pro Max',
  'iPhone 16 Pro',
  'iPhone 16',
  'iPhone 15 Pro Max',
  'iPhone 15 Pro',
];

const STYLE_CONFIGS = [
  {
    style: 'Silicone',
    titleSuffix: 'Silicone Case',
    subCategory: (model) => `${model} Case`,
    categories: ['Silicone case', 'iPhone Case'],
    keyFeatures: ['Soft-touch finish', 'Drop protection', 'Raised camera lip'],
    basePrice: 1800,
    colors: ['Midnight Black', 'Stone Grey', 'Navy Blue', 'Pink Sand'],
  },
  {
    style: 'Leopard',
    titleSuffix: 'Leopard Case',
    subCategory: (model) => `${model} Case`,
    categories: ['Leopard case', 'iPhone Case'],
    keyFeatures: ['Statement print', 'Shock-absorbing edge', 'Slim grip profile'],
    basePrice: 2100,
    colors: ['Classic Leopard', 'Pink Leopard', 'Mono Leopard'],
  },
  {
    style: 'MagSafe Clear',
    titleSuffix: 'MagSafe Clear Case',
    subCategory: (model) => `${model} Case`,
    categories: ['MagSafe case', 'Clear case', 'iPhone Case'],
    keyFeatures: ['MagSafe ring', 'Anti-yellow clear back', 'Reinforced corners'],
    basePrice: 2300,
    colors: ['Crystal Clear', 'Smoked Clear', 'Clear Black Rim'],
  },
];

const BASE_IMAGES = {
  Silicone: '/uploads/imported-products/iphone-phone-cases-1.jpg',
  Leopard: '/uploads/imported-products/iphone-phone-cases-2.png',
  'MagSafe Clear': '/uploads/imported-products/iphone-phone-cases-1.jpg',
};

const slugify = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const shortModelCode = (model) =>
  model
    .toLowerCase()
    .replace('iphone', 'IP')
    .replace(/\s+/g, '')
    .replace('promax', 'PM')
    .replace('pro', 'P');

const shortStyleCode = (style) =>
  style
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);

const shortColorCode = (color) =>
  color
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);

function buildProduct(model, styleConfig) {
  const fullName = `${model} ${styleConfig.titleSuffix}`;
  const slug = slugify(fullName);
  const style = styleConfig.style;
  const mainImage = BASE_IMAGES[style] || '/uploads/imported-products/iphone-phone-cases-1.jpg';

  const variants = styleConfig.colors.map((color, idx) => {
    const sku = `CP-${shortModelCode(model)}-${shortStyleCode(style)}-${shortColorCode(color)}`;
    return {
      label: color,
      color,
      style,
      image: mainImage,
      price: styleConfig.basePrice + idx * 100,
      stock: 20,
      sku,
    };
  });

  const productSku = `CP-${shortModelCode(model)}-${shortStyleCode(style)}-BASE`;

  return {
    name: fullName,
    slug,
    description:
      `${style} protection for ${model}. Designed with premium materials, slim profile, and daily drop defense.`,
    price: Math.min(...variants.map((v) => v.price)),
    originalPrice: styleConfig.basePrice + 500,
    category: 'iPhone Cases',
    subCategory: styleConfig.subCategory(model),
    images: [mainImage],
    stock: variants.reduce((sum, v) => sum + v.stock, 0),
    lowStockThreshold: 5,
    isFeatured: model.includes('17') || model.includes('16 Pro Max'),
    onSale: true,
    isActive: true,
    keyFeatures: styleConfig.keyFeatures,
    sku: productSku,
    brand: 'CaseProz',
    variants,
    categories: styleConfig.categories,
  };
}

async function upsertProduct(payload) {
  const existing = await Product.findOne({ slug: payload.slug });

  if (!existing) {
    await Product.create(payload);
    return 'created';
  }

  existing.name = payload.name;
  existing.description = payload.description;
  existing.price = payload.price;
  existing.originalPrice = payload.originalPrice;
  existing.category = payload.category;
  existing.subCategory = payload.subCategory;
  existing.images = payload.images;
  existing.stock = payload.stock;
  existing.lowStockThreshold = payload.lowStockThreshold;
  existing.isFeatured = payload.isFeatured;
  existing.onSale = payload.onSale;
  existing.isActive = payload.isActive;
  existing.keyFeatures = payload.keyFeatures;
  existing.sku = payload.sku;
  existing.brand = payload.brand;
  existing.variants = payload.variants;
  existing.categories = payload.categories;
  await existing.save();
  return 'updated';
}

async function run() {
  try {
    await connectDB();

    const products = [];
    for (const model of MODELS) {
      for (const styleConfig of STYLE_CONFIGS) {
        products.push(buildProduct(model, styleConfig));
      }
    }

    let created = 0;
    let updated = 0;

    for (const product of products) {
      // eslint-disable-next-line no-await-in-loop
      const action = await upsertProduct(product);
      if (action === 'created') created += 1;
      if (action === 'updated') updated += 1;
    }

    console.log('Bulk iPhone case seed complete.');
    console.log(
      JSON.stringify(
        {
          totalPrepared: products.length,
          created,
          updated,
          models: MODELS.length,
          styles: STYLE_CONFIGS.map((s) => s.style),
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error('Bulk iPhone case seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

run();
