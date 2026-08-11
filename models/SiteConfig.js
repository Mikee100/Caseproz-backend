const mongoose = require('mongoose');

const heroSlideSchema = new mongoose.Schema(
  {
    title: String,
    subtitle: String,
    image: String,
    cta: String,
    link: String,
    color: String,
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const curatedCollectionSchema = new mongoose.Schema(
  {
    id: String,
    title: String,
    tagline: String,
    query: String,
  },
  { _id: false }
);

const deliveryRouteItemSchema = new mongoose.Schema(
  {
    location: String,
    price: Number,
  },
  { _id: false }
);

const deliveryRouteGroupSchema = new mongoose.Schema(
  {
    road: String,
    items: [deliveryRouteItemSchema],
  },
  { _id: false }
);

const siteConfigSchema = new mongoose.Schema(
  {
    taxRate: { type: Number, default: 0.16 }, // 16% VAT by default
    promoBarText: { type: String, default: '' },
    promoBarLink: { type: String },
    heroSlides: [heroSlideSchema],
    curatedCollections: [curatedCollectionSchema],
    homeShowcaseCategories: [{ type: String }],
    deliveryRouteGroups: [deliveryRouteGroupSchema],
    globalLowStockThreshold: { type: Number, default: 5 },
  },
  {
    timestamps: true,
  }
);

siteConfigSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({});
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

const SiteConfig = mongoose.model('SiteConfig', siteConfigSchema);

module.exports = SiteConfig;

