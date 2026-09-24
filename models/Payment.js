const mongoose = require('mongoose');

const paymentSchema = mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Order', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    provider: { type: String, required: true, enum: ['paystack'], default: 'paystack' },
    providerReference: { type: String, required: true, unique: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, enum: ['KES'], default: 'KES' },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    authorizationUrl: { type: String },
    accessCode: { type: String },
    paidAt: { type: Date },
    providerResponse: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Only one active Paystack attempt is allowed for an order at a time. Failed
// attempts remain as an audit trail and may be retried with a new reference.
paymentSchema.index(
  { order: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;