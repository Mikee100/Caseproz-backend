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
  }).select('name slug images variants');

  let productImageRefs = 0;
  let variantImageRefs = 0;

  products.forEach((p) => {
    productImageRefs += (p.images || []).filter((u) => String(u).startsWith('/uploads/')).length;
    variantImageRefs += (p.variants || []).filter((v) => String(v.image || '').startsWith('/uploads/')).length;
  });

  console.log('products with local image refs:', products.length);
  console.log('product-level /uploads refs:', productImageRefs);
  console.log('variant-level /uploads refs:', variantImageRefs);
  console.log('sample slugs:', products.slice(0, 12).map((p) => p.slug).join(', '));

  await mongoose.connection.close();
})();
