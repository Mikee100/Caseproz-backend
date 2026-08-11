const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Category = require('./models/Category');

dotenv.config();

const CASE_CATEGORY_SEED = [
  {
    name: 'Most searched',
    subCategories: [
      'iPhone 17 Pro Case',
      'iPhone 17 Pro Max Case',
      'iPhone Air Case',
      'iPhone 16 Pro Case',
      'iPhone 16 Pro Max Case',
      'iPhone 15 Pro Max Case',
      'Silicone case',
      'iPhone Case',
      'Samsung galaxy Case',
      'galaxy S26 Case',
    ],
  },
  {
    name: 'iPhone Cases',
    subCategories: [
      'iPhone 17 Pro Case',
      'iPhone 17 Pro Max Case',
      'iPhone 16 Pro Case',
      'iPhone 16 Pro Max Case',
      'iPhone 15 Pro Case',
      'iPhone 15 Pro Max Case',
      'iPhone 14 Pro Case',
      'iPhone 14 Pro Max Case',
      'iPhone Air Case',
      'iPhone Case',
    ],
  },
  {
    name: 'Case Styles',
    subCategories: [
      'Silicone case',
      'Leopard case',
      'Clear case',
      'Matte case',
      'MagSafe case',
      'Shockproof case',
      'Leather case',
      'Wallet case',
    ],
  },
  {
    name: 'Samsung Cases',
    subCategories: [
      'Samsung galaxy Case',
      'galaxy S26 Case',
      'Galaxy S25 Case',
      'Galaxy S24 Case',
      'Galaxy Z Fold Case',
      'Galaxy Z Flip Case',
    ],
  },
];

const normalize = (v) => String(v || '').trim();

async function upsertCategory(entry) {
  const categoryName = normalize(entry.name);
  const nextSubs = [...new Set((entry.subCategories || []).map(normalize).filter(Boolean))];

  if (!categoryName) return { category: '', addedSubs: 0, created: false };

  let category = await Category.findOne({ name: categoryName });
  let created = false;

  if (!category) {
    category = new Category({
      name: categoryName,
      subCategories: nextSubs.map((name) => ({ name })),
    });
    await category.save();
    return { category: categoryName, addedSubs: nextSubs.length, created: true };
  }

  const existingSet = new Set((category.subCategories || []).map((s) => normalize(s.name).toLowerCase()));
  let addedSubs = 0;

  for (const sub of nextSubs) {
    const key = sub.toLowerCase();
    if (!existingSet.has(key)) {
      category.subCategories.push({ name: sub });
      existingSet.add(key);
      addedSubs += 1;
    }
  }

  if (addedSubs > 0) {
    await category.save();
  }

  return { category: categoryName, addedSubs, created };
}

async function run() {
  try {
    await connectDB();

    const results = [];
    for (const entry of CASE_CATEGORY_SEED) {
      // eslint-disable-next-line no-await-in-loop
      const result = await upsertCategory(entry);
      results.push(result);
    }

    const summary = {
      processedCategories: results.length,
      createdCategories: results.filter((r) => r.created).length,
      addedSubCategories: results.reduce((sum, r) => sum + (r.addedSubs || 0), 0),
      details: results,
    };

    console.log('Case category seed complete.');
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error('Case category seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

run();
