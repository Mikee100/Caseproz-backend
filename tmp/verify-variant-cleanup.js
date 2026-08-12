require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const slugs = ['clear-case', 'leopard-case', 'magsafe-case', 'silicone-case'];
  const products = await Product.find({ slug: { $in: slugs } })
    .select('slug name price stock variants')
    .sort({ slug: 1 });

  products.forEach((p) => {
    console.log(`\n${p.slug} | ${p.name}`);
    console.log(`price=${p.price} stock=${p.stock} variants=${(p.variants || []).length}`);
    (p.variants || []).forEach((v, i) => {
      console.log(`${i + 1}. ${v.label} | color=${v.color} | style=${v.style} | sku=${v.sku} | stock=${v.stock}`);
    });
  });

  await mongoose.connection.close();
})();
