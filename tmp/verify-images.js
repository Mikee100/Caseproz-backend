require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const total = await Product.countDocuments();
  const withImages = await Product.countDocuments({ images: { $exists: true, $ne: [] } });
  const sample = await Product.find({ images: { $exists: true, $ne: [] } }).select('slug images').limit(5);
  console.log('Total products:', total);
  console.log('Products with images:', withImages);
  sample.forEach((p) => console.log(p.slug, '=>', p.images[0]));
  await mongoose.connection.close();
})();
