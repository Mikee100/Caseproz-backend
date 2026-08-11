const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Product = require('./models/Product');

dotenv.config();

const BASE_IMAGE = '/uploads/imported-products/iphone-phone-cases-1.jpg';

const CASE_PRODUCTS = [
  {
    name: 'iPhone 17 Pro Max Silicone Case',
    slug: 'iphone-17-pro-max-silicone-case',
    description:
      'Premium silicone case for iPhone 17 Pro Max with raised camera lip and soft-touch finish.',
    category: 'iPhone Cases',
    subCategory: 'iPhone 17 Pro Max Case',
    price: 1800,
    originalPrice: 2200,
    stock: 90,
    onSale: true,
    brand: 'CaseProz',
    sku: 'CP-IP17PM-SIL',
    keyFeatures: ['Shock absorbent', 'Camera protection', 'Soft-touch silicone'],
    categories: ['Silicone case', 'iPhone Case'],
    images: [BASE_IMAGE],
    variants: [
      { label: 'Black', color: 'Black', style: 'Silicone', image: BASE_IMAGE, price: 1800, stock: 30, sku: 'CP-IP17PM-SIL-BLK' },
      { label: 'Navy', color: 'Navy', style: 'Silicone', image: BASE_IMAGE, price: 1800, stock: 30, sku: 'CP-IP17PM-SIL-NAV' },
      { label: 'Pink', color: 'Pink', style: 'Silicone', image: BASE_IMAGE, price: 1800, stock: 30, sku: 'CP-IP17PM-SIL-PNK' },
    ],
  },
  {
    name: 'iPhone 17 Pro Leopard Case',
    slug: 'iphone-17-pro-leopard-case',
    description:
      'Leopard pattern statement case for iPhone 17 Pro with reinforced edge protection.',
    category: 'iPhone Cases',
    subCategory: 'iPhone 17 Pro Case',
    price: 2000,
    originalPrice: 2400,
    stock: 60,
    onSale: true,
    brand: 'CaseProz',
    sku: 'CP-IP17P-LEO',
    keyFeatures: ['Leopard print', 'Drop protection', 'Slim profile'],
    categories: ['Leopard case', 'iPhone Case'],
    images: [BASE_IMAGE],
    variants: [
      { label: 'Classic Leopard', color: 'Brown', style: 'Leopard', image: BASE_IMAGE, price: 2000, stock: 20, sku: 'CP-IP17P-LEO-CL' },
      { label: 'Pink Leopard', color: 'Pink', style: 'Leopard', image: BASE_IMAGE, price: 2000, stock: 20, sku: 'CP-IP17P-LEO-PK' },
      { label: 'Mono Leopard', color: 'Black', style: 'Leopard', image: BASE_IMAGE, price: 2000, stock: 20, sku: 'CP-IP17P-LEO-MO' },
    ],
  },
  {
    name: 'iPhone 16 Pro Max MagSafe Silicone Case',
    slug: 'iphone-16-pro-max-magsafe-silicone-case',
    description:
      'MagSafe-ready silicone case for iPhone 16 Pro Max with strong magnetic ring and anti-slip grip.',
    category: 'iPhone Cases',
    subCategory: 'iPhone 16 Pro Max Case',
    price: 2200,
    originalPrice: 2600,
    stock: 75,
    onSale: true,
    brand: 'CaseProz',
    sku: 'CP-IP16PM-MGS',
    keyFeatures: ['MagSafe compatible', 'Anti-slip texture', 'Shock corners'],
    categories: ['Silicone case', 'MagSafe case', 'iPhone Case'],
    images: [BASE_IMAGE],
    variants: [
      { label: 'Black', color: 'Black', style: 'MagSafe Silicone', image: BASE_IMAGE, price: 2200, stock: 25, sku: 'CP-IP16PM-MGS-BLK' },
      { label: 'Stone Grey', color: 'Grey', style: 'MagSafe Silicone', image: BASE_IMAGE, price: 2200, stock: 25, sku: 'CP-IP16PM-MGS-GRY' },
      { label: 'Sky Blue', color: 'Blue', style: 'MagSafe Silicone', image: BASE_IMAGE, price: 2200, stock: 25, sku: 'CP-IP16PM-MGS-BLU' },
    ],
  },
  {
    name: 'iPhone 15 Pro Max Clear Shield Case',
    slug: 'iphone-15-pro-max-clear-shield-case',
    description:
      'Crystal clear shield case for iPhone 15 Pro Max that keeps the original phone look.',
    category: 'iPhone Cases',
    subCategory: 'iPhone 15 Pro Max Case',
    price: 1600,
    originalPrice: 2000,
    stock: 70,
    onSale: true,
    brand: 'CaseProz',
    sku: 'CP-IP15PM-CLR',
    keyFeatures: ['Ultra clear back', 'Anti-yellow coating', 'Raised bezels'],
    categories: ['Clear case', 'iPhone Case'],
    images: [BASE_IMAGE],
    variants: [
      { label: 'Clear', color: 'Transparent', style: 'Clear', image: BASE_IMAGE, price: 1600, stock: 35, sku: 'CP-IP15PM-CLR-TR' },
      { label: 'Clear Black Rim', color: 'Black', style: 'Clear', image: BASE_IMAGE, price: 1700, stock: 35, sku: 'CP-IP15PM-CLR-BK' },
    ],
  },
  {
    name: 'Samsung Galaxy S26 Rugged Case',
    slug: 'samsung-galaxy-s26-rugged-case',
    description:
      'Heavy-duty rugged protection case for Samsung Galaxy S26 with textured grip and reinforced corners.',
    category: 'Samsung Cases',
    subCategory: 'galaxy S26 Case',
    price: 2300,
    originalPrice: 2800,
    stock: 55,
    onSale: false,
    brand: 'CaseProz',
    sku: 'CP-S26-RGD',
    keyFeatures: ['Dual-layer shell', 'Grip texture', 'Drop tested'],
    categories: ['Shockproof case', 'Samsung galaxy Case'],
    images: [BASE_IMAGE],
    variants: [
      { label: 'Black', color: 'Black', style: 'Rugged', image: BASE_IMAGE, price: 2300, stock: 20, sku: 'CP-S26-RGD-BLK' },
      { label: 'Green', color: 'Green', style: 'Rugged', image: BASE_IMAGE, price: 2300, stock: 20, sku: 'CP-S26-RGD-GRN' },
      { label: 'Blue', color: 'Blue', style: 'Rugged', image: BASE_IMAGE, price: 2300, stock: 15, sku: 'CP-S26-RGD-BLU' },
    ],
  },
];

async function upsertProduct(entry) {
  const existing = await Product.findOne({ slug: entry.slug });

  if (!existing) {
    await Product.create(entry);
    return { slug: entry.slug, action: 'created' };
  }

  existing.name = entry.name;
  existing.description = entry.description;
  existing.category = entry.category;
  existing.subCategory = entry.subCategory;
  existing.price = entry.price;
  existing.originalPrice = entry.originalPrice;
  existing.stock = entry.stock;
  existing.onSale = entry.onSale;
  existing.brand = entry.brand;
  existing.sku = entry.sku;
  existing.keyFeatures = entry.keyFeatures;
  existing.categories = entry.categories;
  existing.images = entry.images;
  existing.variants = entry.variants;

  await existing.save();
  return { slug: entry.slug, action: 'updated' };
}

async function run() {
  try {
    await connectDB();
    const results = [];

    for (const product of CASE_PRODUCTS) {
      // eslint-disable-next-line no-await-in-loop
      const result = await upsertProduct(product);
      results.push(result);
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.action === 'created').length,
      updated: results.filter((r) => r.action === 'updated').length,
      slugs: results.map((r) => r.slug),
    };

    console.log('Case product seed complete.');
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error('Case product seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

run();
