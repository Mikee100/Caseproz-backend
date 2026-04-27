const mongoose = require('mongoose');

const discountCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // e.g. CASE10
    description: { type: String },
    type: {
      type: String,
      enum: ['percent', 'amount'],
      default: 'percent',
    },
    value: { type: Number, required: true }, // percent (e.g. 10) or amount in KSh
    minOrderTotal: { type: Number, default: 0 },
    maxDiscount: { type: Number }, // optional cap
    active: { type: Boolean, default: true },
    startsAt: { type: Date },
    expiresAt: { type: Date },
    maxUses: { type: Number },
    timesUsed: { type: Number, default: 0 },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], // Array of product IDs this discount applies to
  },
  {
    timestamps: true,
  }
);

discountCodeSchema.methods.isCurrentlyValid = function (orderTotal) {
  if (!this.active) return false;

  const now = new Date();
  if (this.startsAt && now < this.startsAt) return false;
  if (this.expiresAt && now > this.expiresAt) return false;

  if (typeof this.maxUses === 'number' && this.maxUses >= 0) {
    if (this.timesUsed >= this.maxUses) return false;
  }

  if (typeof this.minOrderTotal === 'number') {
    if (orderTotal < this.minOrderTotal) return false;
  }

  return true;
};

discountCodeSchema.methods.computeDiscount = function (orderTotal) {
  if (!this.isCurrentlyValid(orderTotal)) {
    return 0;
  }

  let discount = 0;
  if (this.type === 'percent') {
    discount = (orderTotal * this.value) / 100;
  } else if (this.type === 'amount') {
    discount = this.value;
  }

  if (typeof this.maxDiscount === 'number' && this.maxDiscount > 0) {
    discount = Math.min(discount, this.maxDiscount);
  }

  // Discount should never exceed order total
  discount = Math.min(discount, orderTotal);

  return Math.max(0, Math.round(discount));
};

const DiscountCode = mongoose.model('DiscountCode', discountCodeSchema);

module.exports = DiscountCode;

