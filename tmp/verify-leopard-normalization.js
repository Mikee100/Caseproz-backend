require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const leopard = await Product.findOne({ slug: 'leopard-case' }).select('name slug category subCategory price stock variants images');
  if (!leopard) {
    console.log('leopard-case not found');
    await mongoose.connection.close();
    return;
  }

  console.log('name:', leopard.name);
  console.log('slug:', leopard.slug);
  console.log('category:', leopard.category);
  console.log('subCategory:', leopard.subCategory);
  console.log('price:', leopard.price);
  console.log('stock:', leopard.stock);
  console.log('images:', leopard.images?.length || 0);
  console.log('variants:', leopard.variants?.length || 0);

  (leopard.variants || []).forEach((v, i) => {
    console.log(`${i + 1}. ${v.label} | style=${v.style || ''} | color=${v.color || ''} | sku=${v.sku} | stock=${v.stock}`);
  });

  const allLeopard = await Product.find({
    $or: [{ name: /leopard/i }, { slug: /leopard/i }, { 'variants.style': /leopard/i }]
  }).select('slug name');
  console.log('total leopard-related products:', allLeopard.length);

  await mongoose.connection.close();
})();
