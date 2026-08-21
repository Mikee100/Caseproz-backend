const mongoose = require('mongoose');

function softDeletePlugin(schema) {
  schema.add({
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  });

  function applyNotDeletedFilter() {
    const options = this.getOptions ? this.getOptions() : {};
    if (options && options.includeDeleted) {
      return;
    }

    const filter = this.getFilter ? this.getFilter() : {};
    if (filter && Object.prototype.hasOwnProperty.call(filter, 'deletedAt')) {
      return;
    }

    this.where({ deletedAt: null });
  }

  schema.pre('find', applyNotDeletedFilter);
  schema.pre('findOne', applyNotDeletedFilter);
  schema.pre('countDocuments', applyNotDeletedFilter);
  schema.pre('findOneAndUpdate', applyNotDeletedFilter);
  schema.pre('updateOne', applyNotDeletedFilter);
  schema.pre('updateMany', applyNotDeletedFilter);

  schema.pre('aggregate', function aggregateSoftDeleteFilter() {
    const pipeline = this.pipeline();
    const firstStage = pipeline[0];

    // $geoNear must stay first if present.
    if (firstStage && firstStage.$geoNear) {
      pipeline.splice(1, 0, { $match: { deletedAt: null } });
    } else {
      pipeline.unshift({ $match: { deletedAt: null } });
    }

  });

  schema.methods.softDelete = async function softDelete(userId) {
    this.deletedAt = new Date();
    if (userId) {
      this.deletedBy = userId;
    }
    return this.save();
  };

  schema.methods.restore = async function restore() {
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
  };
}

module.exports = softDeletePlugin;
