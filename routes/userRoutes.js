const express = require('express');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');
const { generateVerificationEmail, generatePasswordResetEmail } = require('../utils/emailTemplates');
const { protect, admin } = require('../middleware/authMiddleware');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const buildUserPayload = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  isAdmin: user.isAdmin,
  role: user.role || (user.isAdmin ? 'MANAGER' : 'CUSTOMER'),
  phone: user.phone || '',
  address: user.address || '',
  city: user.city || '',
  postalCode: user.postalCode || '',
  country: user.country || 'Kenya',
});



// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
router.post('/login', async (req, res) => {
  const { password } = req.body;
  const email = req.body.email ? req.body.email.toLowerCase().trim() : '';

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    if (!user.isVerified) {
      return res.status(401).json({ message: 'Please verify your email address to log in.', notVerified: true });
    }

    const isIncompleteProfile = !user.phone || !user.city;
    const token = generateToken(user._id);
    res.json({
      ...buildUserPayload(user),
      token,
      isIncompleteProfile
    });
  } else {
    res.status(401).json({ message: 'Invalid email or password' });
  }
});

// @desc    Auth user with Google & get token
// @route   POST /api/users/google
// @access  Public
router.post('/google', async (req, res) => {
  const { idToken } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, name, picture } = payload;
    const email = payload.email ? payload.email.toLowerCase().trim() : '';

    let isNewUser = false;
    let user = await User.findOne({ 
      $or: [{ googleId }, { email }] 
    });

    if (user) {
      // If user exists but doesn't have googleId linked (e.g. signed up with email before)
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }

      if (!user.isVerified) {
        return res.status(401).json({ message: 'Please verify your email address to log in.', notVerified: true });
      }

      const isIncompleteProfile = !user.phone || !user.city;
      const token = generateToken(user._id);
      return res.json({
        ...buildUserPayload(user),
        token,
        isNewUser: isIncompleteProfile,
      });
    }

    // Create new user (unverified by default now)
    user = await User.create({
      name,
      email,
      googleId,
      isVerified: false,
    });

    const verifyToken = crypto.randomBytes(20).toString('hex');
    user.verificationToken = verifyToken;
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify/${verifyToken}`;
    const message = generateVerificationEmail(user, verifyUrl);

    try {
      await sendEmail({
        to: user.email,
        subject: 'Verify your CaseProz Account',
        html: message,
      });
      return res.status(201).json({ message: 'Registration successful! Please check your email to verify your account.', success: true });
    } catch (error) {
      console.error(error);
      user.verificationToken = undefined;
      await user.save();
      return res.status(500).json({ message: 'Account created but verification email could not be sent. Please contact support.' });
    }
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
router.post('/', async (req, res) => {
  const { name, password, phone, city, address } = req.body;
  const email = req.body.email ? req.body.email.toLowerCase().trim() : '';

  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400).json({ message: 'User already exists' });
    return;
  }

  const user = await User.create({
    name,
    email,
    password,
    phone,
    city,
    address,
  });

  if (user) {
    const verifyToken = crypto.randomBytes(20).toString('hex');
    user.verificationToken = verifyToken;
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify/${verifyToken}`;
    const message = generateVerificationEmail(user, verifyUrl);

    try {
      await sendEmail({
        to: user.email,
        subject: 'Verify your CaseProz Account',
        html: message,
      });
      res.status(201).json({ message: 'Registration successful! Please check your email to verify your account.', success: true });
    } catch (error) {
      console.error(error);
      user.verificationToken = undefined;
      await user.save();
      res.status(500).json({ message: 'Account created but verification email could not be sent. Please contact support.' });
    }
  } else {
    res.status(400).json({ message: 'Invalid user data' });
  }
});

// @desc    Verify user email
// @route   GET /api/users/verify/:token
// @access  Public
router.get('/verify/:token', async (req, res) => {
  const user = await User.findOne({ verificationToken: req.params.token });
  if (!user) {
    // Try to find a user who is already verified (token may have been cleared)
    const alreadyVerifiedUser = await User.findOne({ verificationToken: undefined, isVerified: true });
    if (alreadyVerifiedUser) {
      return res.status(200).json({ message: 'Account already verified. Please log in.' });
    }
    return res.status(400).json({ message: 'Invalid or expired verification token' });
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  await user.save();

  const token = generateToken(user._id);
  res.json({
    ...buildUserPayload(user),
    token,
    message: 'Email verified successfully',
  });
});

// @desc    Forgot Password
// @route   POST /api/users/forgot-password
// @access  Public
router.post('/forgot-password', async (req, res) => {
  const email = req.body.email ? req.body.email.toLowerCase().trim() : '';
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'There is no user with that email' });

  const resetToken = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  await user.save();

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
  const message = generatePasswordResetEmail(user, resetUrl);

  try {
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html: message,
    });
    res.status(200).json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error(error);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    res.status(500).json({ message: 'Email could not be sent' });
  }
});

// @desc    Reset Password
// @route   PUT /api/users/reset-password/:token
// @access  Public
router.put('/reset-password/:token', async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired reset token' });
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  const token = generateToken(user._id);
  res.json({
    ...buildUserPayload(user),
    token,
    message: 'Password has been reset successfully',
  });
});

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json(buildUserPayload(user));
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// @desc    Update logged in user profile
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  user.name = req.body.name || user.name;
  user.email = req.body.email || user.email;

  if (req.body.password) {
    user.password = req.body.password;
  }

  // Shipping information
  user.phone = req.body.phone !== undefined ? req.body.phone : user.phone;
  user.address = req.body.address !== undefined ? req.body.address : user.address;
  user.city = req.body.city !== undefined ? req.body.city : user.city;
  user.postalCode = req.body.postalCode !== undefined ? req.body.postalCode : user.postalCode;
  user.country = req.body.country !== undefined ? req.body.country : user.country;

  const updatedUser = await user.save();
  const token = generateToken(updatedUser._id);
  res.json({
    ...buildUserPayload(updatedUser),
    token,
  });
});

// @desc    Get logged in user's favourite products
// @route   GET /api/users/favourites
// @access  Private
router.get('/favourites', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('favourites');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user.favourites || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get logged in user's cart (account-linked)
// @route   GET /api/users/cart
// @access  Private
router.get('/cart', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('cartItems.product');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const items = (user.cartItems || []).map((item) => {
      const product = item.product;
      if (!product) {
        return null;
      }

      const variant = item.variantSku
        ? (product.variants || []).find(
            (entry) =>
              entry.sku &&
              String(entry.sku).toLowerCase() === String(item.variantSku).toLowerCase()
          )
        : null;

      const resolvedPrice = variant ? variant.price : product.price;
      const resolvedImage = variant?.image || (product.images || [])[0];
      const resolvedStock = variant ? variant.stock : product.stock;

      return {
        _id: product._id,
        name: product.name,
        price: resolvedPrice,
        originalPrice: product.originalPrice,
        images: resolvedImage ? [resolvedImage, ...(product.images || [])] : product.images || [],
        slug: product.slug,
        stock: resolvedStock,
        quantity: item.qty,
        variantSku: item.variantSku || '',
        variantLabel: item.variantLabel || variant?.label || '',
        variantColor: item.variantColor || variant?.color || '',
        variantStyle: item.variantStyle || variant?.style || '',
      };
    }).filter(Boolean);

    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Logout user (clear auth cookie)
// @route   POST /api/users/logout
// @access  Public (just clears cookie)
router.post('/logout', (req, res) => {
  // Token invalidation is handled client-side (localStorage cleared)
  res.status(200).json({ message: 'Logged out' });
});

// @desc    Replace or merge logged in user's cart with provided items
// @route   PUT /api/users/cart
// @access  Private
router.put('/cart', protect, async (req, res) => {
  try {
    const { items, merge } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'items array is required' });
    }

    const sanitizedMap = new Map();

    for (const item of items) {
      const { productId, quantity, variantSku } = item || {};

      if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }

      const product = await Product.findById(productId);

      if (!product || !product.isActive || product.stock <= 0) {
        continue;
      }

      const selectedVariant = variantSku
        ? (product.variants || []).find(
            (entry) =>
              entry.sku &&
              String(entry.sku).toLowerCase() === String(variantSku).toLowerCase()
          )
        : null;

      if (variantSku && !selectedVariant) {
        continue;
      }

      const stockLimit = selectedVariant ? selectedVariant.stock : product.stock;
      if (stockLimit <= 0) continue;

      const safeQty = Math.min(quantity, stockLimit);
      const mapKey = `${String(product._id)}::${selectedVariant?.sku || ''}`;

      const existing = sanitizedMap.get(mapKey);
      const mergedQty = existing ? Math.min(existing.qty + safeQty, stockLimit) : safeQty;

      sanitizedMap.set(mapKey, {
        product: product._id,
        qty: mergedQty,
        variantSku: selectedVariant?.sku,
        variantLabel: selectedVariant?.label,
        variantColor: selectedVariant?.color,
        variantStyle: selectedVariant?.style,
        priceAtAdd: selectedVariant ? selectedVariant.price : product.price,
        nameAtAdd: product.name,
        imageAtAdd: selectedVariant?.image || (product.images && product.images[0]),
        slugAtAdd: product.slug,
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newItems = Array.from(sanitizedMap.values());

    if (merge && Array.isArray(user.cartItems) && user.cartItems.length > 0) {
      const existingMap = new Map();

      for (const item of user.cartItems) {
        const key = `${String(item.product)}::${item.variantSku || ''}`;
        existingMap.set(key, {
          product: item.product,
          qty: item.qty,
          variantSku: item.variantSku,
          variantLabel: item.variantLabel,
          variantColor: item.variantColor,
          variantStyle: item.variantStyle,
          priceAtAdd: item.priceAtAdd,
          nameAtAdd: item.nameAtAdd,
          imageAtAdd: item.imageAtAdd,
          slugAtAdd: item.slugAtAdd,
        });
      }

      for (const incoming of newItems) {
        const key = `${String(incoming.product)}::${incoming.variantSku || ''}`;
        const existing = existingMap.get(key);
        if (existing) {
          const mergedQty = existing.qty + incoming.qty;
          existingMap.set(key, { ...incoming, qty: mergedQty });
        } else {
          existingMap.set(key, incoming);
        }
      }

      user.cartItems = Array.from(existingMap.values());
    } else {
      user.cartItems = newItems;
    }

    await user.save();

    res.status(200).json({ message: 'Cart updated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Add a product to favourites
// @route   POST /api/users/favourites
// @access  Private
router.post('/favourites', protect, async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: 'productId is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { favourites: productId } },
      { new: true }
    ).populate('favourites');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(201).json(user.favourites || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Remove a product from favourites
// @route   DELETE /api/users/favourites/:productId
// @access  Private
router.delete('/favourites/:productId', protect, async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { favourites: productId } },
      { new: true }
    ).populate('favourites');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.favourites || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  const users = await User.find({});
  res.json(users);
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
router.get('/:id', protect, admin, async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    const {
      name,
      email,
      isAdmin,
      role,
      notes,
      tags,
    } = req.body;

    user.name = name || user.name;
    user.email = email || user.email;

    if (typeof isAdmin === 'boolean') {
      user.isAdmin = isAdmin;
    }

    if (role) {
      user.role = role;
      // Keep boolean in sync for admin-only routes
      if (role === 'CUSTOMER') {
        user.isAdmin = false;
      } else if (!user.isAdmin) {
        user.isAdmin = true;
      }
    }

    if (notes !== undefined) {
      user.notes = notes;
    }

    if (Array.isArray(tags)) {
      user.tags = tags;
    }

    // Shipping information
    user.phone = req.body.phone !== undefined ? req.body.phone : user.phone;
    user.address = req.body.address !== undefined ? req.body.address : user.address;
    user.city = req.body.city !== undefined ? req.body.city : user.city;
    user.postalCode = req.body.postalCode !== undefined ? req.body.postalCode : user.postalCode;
    user.country = req.body.country !== undefined ? req.body.country : user.country;

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      role: updatedUser.role || (updatedUser.isAdmin ? 'MANAGER' : 'CUSTOMER'),
      notes: updatedUser.notes || '',
      tags: updatedUser.tags || [],
      phone: updatedUser.phone || '',
      address: updatedUser.address || '',
      city: updatedUser.city || '',
      postalCode: updatedUser.postalCode || '',
      country: updatedUser.country || 'Kenya',
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      await user.softDelete(req.user?._id);
      res.json({ message: 'User archived' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    List archived users
// @route   GET /api/users/archived/list
// @access  Private/Admin
router.get('/archived/list', protect, admin, async (req, res) => {
  try {
    const users = await User.find({ deletedAt: { $ne: null } })
      .setOptions({ includeDeleted: true })
      .sort({ deletedAt: -1 })
      .select('-password');

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load archived users' });
  }
});

// @desc    Restore archived user
// @route   PUT /api/users/:id/restore
// @access  Private/Admin
router.put('/:id/restore', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).setOptions({ includeDeleted: true });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.deletedAt) {
      return res.status(400).json({ message: 'User is not archived' });
    }

    await user.restore();

    res.json({ message: 'User restored' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to restore user' });
  }
});

// @desc    Permanently delete user
// @route   DELETE /api/users/:id/purge
// @access  Private/Admin
router.delete('/:id/purge', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).setOptions({ includeDeleted: true });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.deleteOne({ _id: user._id });
    res.json({ message: 'User permanently deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to permanently delete user' });
  }
});

module.exports = router;
