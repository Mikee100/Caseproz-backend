const mongoose = require('mongoose');
const SiteConfig = require('./backend/models/SiteConfig');
require('dotenv').config();

async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce');
    const config = await SiteConfig.getSingleton();
    console.log('Site Config:', JSON.stringify(config, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
