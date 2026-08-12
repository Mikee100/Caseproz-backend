require('dotenv').config();
const mongoose = require('mongoose');
const SiteConfig = require('../models/SiteConfig');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  let cfg = await SiteConfig.findOne({});
  if (!cfg) {
    cfg = await SiteConfig.create({});
  }

  cfg.homeShowcaseCategories = [
    'iPhone Cases',
    'Audio & Headphones',
    'Phones & Tablets',
    'Samsung Cases'
  ];

  await cfg.save();
  console.log('Updated homeShowcaseCategories:', cfg.homeShowcaseCategories);
  await mongoose.connection.close();
})();
