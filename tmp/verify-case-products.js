require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const seeded = await Product.find({ slug: { $in: [
    'iphone-17-pro-max-silicone-case',
    'iphone-17-pro-leopard-case',
    'iphone-16-pro-max-magsafe-silicone-case',
    'iphone-15-pro-max-clear-shield-case',
    'samsung-galaxy-s26-rugged-case'
  ] } }).select('name slug category subCategory variants');

  seeded.forEach((p) => {
    console.log(`${p.slug} | ${p.category} > ${p.subCategory} | variants=${(p.variants || []).length}`);
  });

  await mongoose.connection.close();
})();
