require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const iphCaseProducts = await Product.find({ category: 'iPhone Cases' }).select('slug variants subCategory');
  const total = iphCaseProducts.length;
  const totalVariants = iphCaseProducts.reduce((sum, p) => sum + ((p.variants || []).length), 0);
  console.log('iPhone Cases products:', total);
  console.log('Total variants across iPhone Cases:', totalVariants);
  iphCaseProducts.slice(0, 12).forEach((p) => console.log('-', p.slug, '|', p.subCategory, '| variants=', (p.variants || []).length));
  await mongoose.connection.close();
})();
