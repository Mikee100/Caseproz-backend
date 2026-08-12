require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const samsung = await Product.find({ category: 'Samsung Cases' }).select('name slug images variants');
  samsung.forEach((p) => {
    console.log('\n' + p.slug + ' -> ' + (p.images?.[0] || 'NO_IMAGE'));
    (p.variants || []).slice(0, 3).forEach((v, i) => {
      console.log('  variant' + (i + 1) + ':', v.label, '=>', v.image || 'NO_IMAGE');
    });
  });
  await mongoose.connection.close();
})();
