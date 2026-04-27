const mongoose = require('mongoose');

const variantSchema = mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    color: { type: String, trim: true },
    style: { type: String, trim: true },
    image: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    sku: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const productSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    category: { type: String, required: true },
    subCategory: { type: String },
    images: [{ type: String }],
    stock: { type: Number, default: 0 },
    // Minimum stock before triggering low-stock alert
    lowStockThreshold: { type: Number, default: 5 },
    isFeatured: { type: Boolean, default: false },
    onSale: { type: Boolean, default: false },
    // Whether the product is visible/available for purchase
    isActive: { type: Boolean, default: true },
    keyFeatures: [{ type: String }],
    specs: [{ key: String, value: String }],
    sku: { type: String },
    brand: { type: String },
    // Product variants (e.g. color/style options for one product)
    variants: [variantSchema],
    // Extra taxonomy used for product footer like "Valentine's Day Gifts"
    categories: [{ type: String }],
    featureHeadline: { type: String },
    featureSubtext: { type: String },
    notes: [{ type: String }],
    // Basic SEO fields for product detail page
    metaTitle: { type: String },
    metaDescription: { type: String },
  },
  {
    timestamps: true,
  }
);

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
