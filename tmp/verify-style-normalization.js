require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const slugs = ['leopard-case', 'silicone-case', 'clear-case', 'magsafe-case'];
  const styles = await Product.find({ slug: { $in: slugs } })
    .select('name slug category subCategory price stock variants images')
    .sort({ slug: 1 });

  console.log('Canonical style products found:', styles.length);
  styles.forEach((p) => {
    console.log(`\n${p.slug}`);
    console.log('  name:', p.name);
    console.log('  category/sub:', p.category, '/', p.subCategory);
    console.log('  price:', p.price, '| stock:', p.stock);
    console.log('  images:', p.images?.length || 0, '| variants:', p.variants?.length || 0);
    (p.variants || []).forEach((v, i) => {
      console.log(`   ${i + 1}. ${v.label} | style=${v.style || ''} | sku=${v.sku}`);
    });
  });

  const leftover = await Product.find({
    $or: [
      { slug: /silicone|magsafe|clear|leopard/i },
      { name: /silicone|magsafe|clear|leopard/i }
    ]
  }).select('slug name').sort({ slug: 1 });

  console.log('\nAll style-related products currently in DB:', leftover.length);
  leftover.forEach((p) => console.log('-', p.slug, '|', p.name));

  await mongoose.connection.close();
})();
