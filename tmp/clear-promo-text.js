require('dotenv').config();
const mongoose = require('mongoose');
const SiteConfig = require('../models/SiteConfig');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const doc = await SiteConfig.findOne({});
  if (!doc) {
    const created = await SiteConfig.create({ promoBarText: '', promoBarLink: '' });
    console.log('Created site config with empty promo text:', created._id.toString());
  } else {
    doc.promoBarText = '';
    doc.promoBarLink = '';
    await doc.save();
    console.log('Updated site config promo text to empty for id:', doc._id.toString());
  }
  const verify = await SiteConfig.findOne({}).select('promoBarText promoBarLink');
  console.log('Current promoBarText:', JSON.stringify(verify.promoBarText));
  console.log('Current promoBarLink:', JSON.stringify(verify.promoBarLink));
  await mongoose.connection.close();
})();
