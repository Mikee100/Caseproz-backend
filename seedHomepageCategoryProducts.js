const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Product = require('./models/Product');
const Category = require('./models/Category');

dotenv.config();

const CATEGORY_DEFS = [
  {
    name: 'Audio & Headphones',
    subs: ['Bluetooth Speakers', 'Earbuds & In-ear', 'Over-ear Headphones'],
  },
  {
    name: 'Phones & Tablets',
    subs: ['Phone Accessories', 'Smartphones', 'iPhones'],
  },
];

const PRODUCT_MAP = [
  { slug: 'soundcore-r50i', category: 'Audio & Headphones', subCategory: 'Earbuds & In-ear', brand: 'Soundcore', isFeatured: true },
  { slug: 'soundcore-r50i-nc-blue', category: 'Audio & Headphones', subCategory: 'Earbuds & In-ear', brand: 'Soundcore', isFeatured: true },
  { slug: 'soundcore-h30i', category: 'Audio & Headphones', subCategory: 'Over-ear Headphones', brand: 'Soundcore', isFeatured: true },
  { slug: 'soundcore-boom-2se', category: 'Audio & Headphones', subCategory: 'Bluetooth Speakers', brand: 'Soundcore', isFeatured: true },
  { slug: 'soundcore-select-go4', category: 'Audio & Headphones', subCategory: 'Bluetooth Speakers', brand: 'Soundcore', isFeatured: true },
  { slug: 'anker-20w-adapter', category: 'Phones & Tablets', subCategory: 'Phone Accessories', brand: 'Anker', isFeatured: true },
  { slug: 'anker-zolo-adapter-30w', category: 'Phones & Tablets', subCategory: 'Phone Accessories', brand: 'Anker', isFeatured: true },
  { slug: 'anker-c-lightning-charger', category: 'Phones & Tablets', subCategory: 'Phone Accessories', brand: 'Anker', isFeatured: true },
];

const norm = (v) => String(v || '').trim();

async function ensureCategories() {
  let created = 0;
  let subsAdded = 0;

  for (const def of CATEGORY_DEFS) {
    const name = norm(def.name);
    let category = await Category.findOne({ name });

    if (!category) {
      category = await Category.create({
        name,
        subCategories: def.subs.map((s) => ({ name: s })),
      });
      created += 1;
      continue;
    }

    const existing = new Set((category.subCategories || []).map((s) => norm(s.name).toLowerCase()));
    let dirty = false;

    for (const sub of def.subs) {
      const key = norm(sub).toLowerCase();
      if (!existing.has(key)) {
        category.subCategories.push({ name: sub });
        existing.add(key);
        subsAdded += 1;
        dirty = true;
      }
    }

    if (dirty) {
      await category.save();
    }
  }

  return { created, subsAdded };
}

async function upsertMappedProducts() {
  let updated = 0;
  let missing = 0;

  for (const row of PRODUCT_MAP) {
    // eslint-disable-next-line no-await-in-loop
    const product = await Product.findOne({ slug: row.slug });
    if (!product) {
      missing += 1;
      continue;
    }

    product.category = row.category;
    product.subCategory = row.subCategory;
    product.brand = row.brand;
    product.isFeatured = row.isFeatured;

    // eslint-disable-next-line no-await-in-loop
    await product.save();
    updated += 1;
  }

  return { updated, missing };
}

async function run() {
  try {
    await connectDB();

    const categorySummary = await ensureCategories();
    const productSummary = await upsertMappedProducts();

    console.log('Homepage category product sync complete.');
    console.log(
      JSON.stringify(
        {
          categorySummary,
          productSummary,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error('Homepage category product sync failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

run();
