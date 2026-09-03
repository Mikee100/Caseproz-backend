const mongoose = require('mongoose');

const orderSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    orderItems: [
      {
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        product: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product' },
        variantSku: { type: String },
        variantLabel: { type: String },
        variantColor: { type: String },
        variantStyle: { type: String },
      },
    ],
    shippingAddress: {
      name: { type: String },
      phone: { type: String },
      address: { type: String, required: true },
      city: { type: String, required: true },
      region: { type: String }, // e.g. WAIYAKI WAY
      location: { type: String }, // e.g. Museum Hill
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
      isPickup: { type: Boolean, default: false },
      pickupLocation: { type: String },
    },
    fulfillmentMethod: {
      type: String,
      enum: ['delivery', 'pickup'],
      default: 'delivery',
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'],
      default: 'pending',
    },
    trackingNumber: { type: String },
    carrier: { type: String },
    statusHistory: [
      {
        status: {
          type: String,
          enum: ['pending', 'confirmed', 'processing', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'],
        },
        note: { type: String },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    paymentMethod: { type: String, required: true },
    paymentResult: {
      id: { type: String },
      status: { type: String },
      update_time: { type: String },
      email_address: { type: String },
    },
    itemsPrice: { type: Number, required: true, default: 0.0 },
    taxPrice: { type: Number, required: true, default: 0.0 },
    shippingPrice: { type: Number, required: true, default: 0.0 },
    totalPrice: { type: Number, required: true, default: 0.0 },
    discountCode: { type: String },
    discountAmount: { type: Number, default: 0.0 },
    isPaid: { type: Boolean, required: true, default: false },
    paidAt: { type: Date },
    isDelivered: { type: Boolean, required: true, default: false },
    deliveredAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
