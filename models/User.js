const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const softDeletePlugin = require('./plugins/softDelete');

const userSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String }, // Optional for Google Auth users
    googleId: { type: String, unique: true, sparse: true }, // Sparse to allow nulls for standard users
    isAdmin: { type: Boolean, required: true, default: false },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpire: { type: Date },
    // Role-based access for admin area
    role: {
      type: String,
      enum: ['CUSTOMER', 'SUPER_ADMIN', 'MANAGER', 'SUPPORT'],
      default: 'CUSTOMER',
    },
    // Simple notes/tags used in admin for user management
    notes: { type: String },
    tags: [{ type: String }],
    favourites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    cartItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        qty: { type: Number, required: true, min: 1 },
        variantSku: { type: String },
        variantLabel: { type: String },
        variantColor: { type: String },
        variantStyle: { type: String },
        // Optional denormalized fields for quicker reads / analytics
        priceAtAdd: { type: Number },
        nameAtAdd: { type: String },
        imageAtAdd: { type: String },
        slugAtAdd: { type: String },
      },
    ],
    // Shipping Information
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    postalCode: { type: String },
    country: { type: String, default: 'Kenya' },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.plugin(softDeletePlugin);

const User = mongoose.model('User', userSchema);

module.exports = User;
