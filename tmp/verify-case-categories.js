require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const names = ['Most searched', 'iPhone Cases', 'Case Styles', 'Samsung Cases'];
  const rows = await Category.find({ name: { $in: names } }).select('name subCategories');
  rows.forEach((r) => console.log(r.name, '=>', (r.subCategories || []).length, 'subcategories'));
  await mongoose.connection.close();
})();
