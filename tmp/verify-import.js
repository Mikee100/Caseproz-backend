require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const total = await Product.countDocuments();
  const imported = await Product.countDocuments({
    $or: [{ slug: /anker/i }, { slug: /soundcore/i }, { slug: /iphone-phone-cases/i }, { slug: /mag-go/i }],
  });
  const noImages = await Product.countDocuments({
    $and: [
      { $or: [{ slug: /anker/i }, { slug: /soundcore/i }, { slug: /iphone-phone-cases/i }, { slug: /mag-go/i }] },
      { $or: [{ images: { $exists: false } }, { images: { $size: 0 } }] },
    ],
  });

  console.log('Total products:', total);
  console.log('Imported-like products:', imported);
  console.log('Imported-like with no images:', noImages);
  await mongoose.connection.close();
})();
