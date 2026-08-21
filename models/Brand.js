const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

brandSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('Brand', brandSchema);