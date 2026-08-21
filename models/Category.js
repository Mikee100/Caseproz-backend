const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const subCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  subCategories: [subCategorySchema],
  createdAt: { type: Date, default: Date.now },
});

categorySchema.plugin(softDeletePlugin);

module.exports = mongoose.model('Category', categorySchema);