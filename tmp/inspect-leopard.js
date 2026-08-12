require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({
    $or: [
      { name: /leopard/i },
      { subCategory: /leopard/i },
      { category: /leopard/i },
      { keyFeatures: { $elemMatch: { $regex: /leopard/i } } },
      { categories: { $elemMatch: { $regex: /leopard/i } } },
      { 'variants.label': /leopard/i },
      { 'variants.style': /leopard/i }
    ]
  }).select('name slug category subCategory variants images');

  console.log('Leopard-related products:', products.length);
  products.forEach((p, idx) => {
    console.log(`\n${idx + 1}. ${p.name}`);
    console.log('   slug:', p.slug);
    console.log('   category/sub:', p.category, '/', p.subCategory || '-');
    console.log('   variants:', (p.variants || []).length);
    (p.variants || []).slice(0, 12).forEach((v, i) => {
      console.log(`     - ${i + 1}: label="${v.label}" style="${v.style || ''}" color="${v.color || ''}" sku="${v.sku}"`);
    });
  });

  await mongoose.connection.close();
})();
