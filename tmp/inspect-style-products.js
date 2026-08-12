require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

const STYLE_TERMS = {
  silicone: [/silicone/i],
  clear: [/\bclear\b/i, /transparent/i],
  magsafe: [/mag\s*safe/i, /magsafe/i],
};

const matchesStyle = (product, style) => {
  const haystack = [
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

  return STYLE_TERMS[style].some((rx) => rx.test(haystack));
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const products = await Product.find({}).select('name slug category subCategory variants images categories keyFeatures').lean();

  for (const style of Object.keys(STYLE_TERMS)) {
    const matched = products.filter((p) => matchesStyle(p, style));
    console.log(`\n=== ${style.toUpperCase()} ===`);
    console.log('matched products:', matched.length);
    matched.forEach((p, idx) => {
      console.log(`${idx + 1}. ${p.slug} | ${p.name} | variants=${(p.variants || []).length}`);
    });
  }

  await mongoose.connection.close();
})();
