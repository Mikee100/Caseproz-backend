require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({
    $or: [
      { images: { $elemMatch: { $regex: '^/uploads/' } } },
      { 'variants.image': { $regex: '^/uploads/' } }
    ]
  }).select('slug');

  console.log('products still using /uploads refs:', products.length);

  const sample = await Product.findOne({ slug: 'soundcore-r50i-nc-blue' }).select('slug images');
  if (sample) {
    console.log('sample slug:', sample.slug);
    console.log('sample first image:', sample.images?.[0] || 'none');
  }

  await mongoose.connection.close();
})();
