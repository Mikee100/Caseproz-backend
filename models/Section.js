const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

// Ensure referenced models are registered before Section
require('./Product');
require('./Category');

const sectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['Product', 'Category'],
    required: true
  },
  items: [{
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'type', // Dynamically reference either Product or Category
    required: true
  }],
  description: {
    type: String
  }
}, {
  timestamps: true
});

sectionSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('Section', sectionSchema);
