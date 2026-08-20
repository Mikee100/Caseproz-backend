const express = require('express');
const DiscountCode = require('../models/DiscountCode');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// @desc    List all discount codes (admin)
// @route   GET /api/discounts
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const codes = await DiscountCode.find({}).sort({ createdAt: -1 });
    res.json(codes);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load discount codes' });
  }
});

// @desc    Create a discount code
// @route   POST /api/discounts
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  try {
    const {
      code,
      description,
      type,
      value,
      minOrderTotal,
      maxDiscount,
      active,
      startsAt,
      expiresAt,
      maxUses,
      products, // array of product IDs
    } = req.body;

    if (!code || typeof value !== 'number') {
      return res.status(400).json({ message: 'Code and numeric value are required' });
    }

    const normalisedCode = String(code).trim().toUpperCase();

    const existing = await DiscountCode.findOne({ code: normalisedCode });
    if (existing) {
      return res.status(400).json({ message: 'A discount with that code already exists' });
    }

    const discount = await DiscountCode.create({
      code: normalisedCode,
      description,
      type: type || 'percent',
      value,
      minOrderTotal,
      maxDiscount,
      active,
      startsAt,
      expiresAt,
      maxUses,
      products: Array.isArray(products) ? products : [],
    });

    res.status(201).json(discount);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to create discount code' });
  }
});

// @desc    Update a discount code
// @route   PUT /api/discounts/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const discount = await DiscountCode.findById(req.params.id);
    if (!discount) {
      return res.status(404).json({ message: 'Discount code not found' });
    }

    const {
      code,
      description,
      type,
      value,
      minOrderTotal,
      maxDiscount,
      active,
      startsAt,
      expiresAt,
      maxUses,
      products, // array of product IDs
    } = req.body;

    if (code !== undefined) {
      discount.code = String(code).trim().toUpperCase();
    }
    if (description !== undefined) discount.description = description;
    if (type !== undefined) discount.type = type;
    if (typeof value === 'number') discount.value = value;
    if (minOrderTotal !== undefined) discount.minOrderTotal = minOrderTotal;
    if (maxDiscount !== undefined) discount.maxDiscount = maxDiscount;
    if (typeof active === 'boolean') discount.active = active;
    if (startsAt !== undefined) discount.startsAt = startsAt;
    if (expiresAt !== undefined) discount.expiresAt = expiresAt;
    if (maxUses !== undefined) discount.maxUses = maxUses;
    if (products !== undefined) discount.products = Array.isArray(products) ? products : [];

    const updated = await discount.save();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to update discount code' });
  }
});

// @desc    Delete a discount code
// @route   DELETE /api/discounts/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const discount = await DiscountCode.findById(req.params.id);
    if (!discount) {
      return res.status(404).json({ message: 'Discount code not found' });
    }

    await discount.deleteOne();
    res.json({ message: 'Discount code removed' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to delete discount code' });
  }
});

// @desc    Validate and compute discount for an order total
// @route   POST /api/discounts/apply
// @access  Public (no auth required)
router.post('/apply', async (req, res) => {
  try {
    const { code, itemsTotal, cartProductIds, cartItems } = req.body;

    if (!code || typeof itemsTotal !== 'number') {
      return res
        .status(400)
        .json({ message: 'Code and numeric itemsTotal are required' });
    }

    const normalisedCode = String(code).trim().toUpperCase();

    const discount = await DiscountCode.findOne({ code: normalisedCode });
    if (!discount) {
      return res.status(404).json({ message: 'Discount code not found' });
    }

    if (!discount.isCurrentlyValid(itemsTotal)) {
      return res.status(400).json({ message: discount.getInvalidReason(itemsTotal) || 'Discount code is not valid for this order' });
    }

    let discountBaseTotal = itemsTotal;

    // When cartItems are provided, compute authoritative totals from DB prices.
    if (Array.isArray(cartItems) && cartItems.length > 0) {
      const normalizedItems = cartItems
        .map((item) => ({
          product: item?.product || item?._id,
          qty: Number(item?.qty || 0),
        }))
        .filter((item) => item.product && Number.isFinite(item.qty) && item.qty > 0);

      if (normalizedItems.length > 0) {
        const productIds = [...new Set(normalizedItems.map((item) => String(item.product)))];
        const dbProducts = await Product.find({ _id: { $in: productIds } }).select('_id price');
        const priceById = new Map(dbProducts.map((p) => [String(p._id), Number(p.price || 0)]));

        let computedItemsTotal = 0;
        for (const item of normalizedItems) {
          const unitPrice = priceById.get(String(item.product));
          if (Number.isFinite(unitPrice)) {
            computedItemsTotal += unitPrice * item.qty;
          }
        }

        if (computedItemsTotal > 0) {
          if (!discount.isCurrentlyValid(computedItemsTotal)) {
            return res.status(400).json({ message: discount.getInvalidReason(computedItemsTotal) || 'Discount code is not valid for this order' });
          }
        }

        if (Array.isArray(discount.products) && discount.products.length > 0) {
          const eligibleSet = new Set(discount.products.map((id) => String(id)));
          let eligibleSubtotal = 0;

          for (const item of normalizedItems) {
            if (!eligibleSet.has(String(item.product))) continue;
            const unitPrice = priceById.get(String(item.product));
            if (Number.isFinite(unitPrice)) {
              eligibleSubtotal += unitPrice * item.qty;
            }
          }

          discountBaseTotal = eligibleSubtotal;
        } else if (computedItemsTotal > 0) {
          discountBaseTotal = computedItemsTotal;
        }
      }
    }

    // If discount.products is set (not empty), require at least one cart product to match
    if (Array.isArray(discount.products) && discount.products.length > 0) {
      if (!Array.isArray(cartProductIds) || cartProductIds.length === 0) {
        return res.status(400).json({ message: 'This discount only applies to specific products in your cart.' });
      }
      const eligible = cartProductIds.some(pid => discount.products.map(id => String(id)).includes(String(pid)));
      if (!eligible) {
        return res.status(400).json({ message: 'This discount does not apply to any products in your cart.' });
      }

      if (discountBaseTotal <= 0) {
        return res.status(400).json({ message: 'No eligible product amount found for this discount code.' });
      }
    }

    const discountAmount = discount.computeDiscount(itemsTotal, discountBaseTotal);

    res.json({
      code: discount.code,
      type: discount.type,
      value: discount.value,
      discountAmount,
      minOrderTotal: discount.minOrderTotal,
      maxDiscount: discount.maxDiscount,
      message: `Discount of KSh ${discountAmount.toLocaleString()} applied.`,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to apply discount code' });
  }
});

module.exports = router;

