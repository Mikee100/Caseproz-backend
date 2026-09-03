const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const DiscountCode = require('../models/DiscountCode');
const SiteConfig = require('../models/SiteConfig');
const { protect, admin } = require('../middleware/authMiddleware');
const sendEmail = require('../utils/sendEmail');
const { generateOrderConfirmationEmail } = require('../utils/emailTemplates');
const { logAuditEvent, buildActorFromReq } = require('../utils/auditLogger');
// const { SHIPPING_ZONES } = require('../utils/shippingZones');

const DEFAULT_PICKUP_LOCATION = 'CaseProz Shop, Simara Mall, 5th Floor, Shop No. 5, Tom Mboya Street';
const DEFAULT_PICKUP_CITY = 'Nairobi';
const DEFAULT_PICKUP_POSTAL_CODE = '00100';
const DEFAULT_PICKUP_COUNTRY = 'Kenya';

const VALID_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const isValidObjectId = (value) => typeof value === 'string' && OBJECT_ID_REGEX.test(value);
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

// Helper to build a Mongo query object from common admin filter params
const buildOrderAdminQuery = async (req) => {
  const {
    status,
    from,
    to,
    email,
    paymentMethod,
    minTotal,
    maxTotal,
  } = req.query;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (paymentMethod) {
    filter.paymentMethod = paymentMethod;
  }

  if (minTotal || maxTotal) {
    filter.totalPrice = {};
    if (minTotal) {
      filter.totalPrice.$gte = Number(minTotal);
    }
    if (maxTotal) {
      filter.totalPrice.$lte = Number(maxTotal);
    }
  }

  if (from || to) {
    filter.createdAt = {};
    if (from) {
      filter.createdAt.$gte = new Date(from);
    }
    if (to) {
      // Include the entire end day by setting to end of day if date-only string
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }
  }

  // Filter by customer email (case-insensitive)
  if (email) {
    const users = await User.find({
      email: { $regex: email, $options: 'i' },
    }).select('_id');

    const userIds = users.map((u) => u._id);

    if (!userIds.length) {
      // No matching users: ensure query returns empty set
      filter.user = { $in: [] };
    } else {
      filter.user = { $in: userIds };
    }
  }

  return filter;
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
router.post('/', protect, async (req, res) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
    fulfillmentMethod,
    discountCode: rawDiscountCode,
    // shippingZoneId, // No longer using static zone IDs
  } = req.body;

  if (!Array.isArray(orderItems) || orderItems.length === 0 || orderItems.length > 100) {
    return res.status(400).json({ message: 'orderItems must contain between 1 and 100 items' });
  }

  for (const item of orderItems) {
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ message: 'Invalid order item payload' });
    }

    if (!isValidObjectId(String(item.product || ''))) {
      return res.status(400).json({ message: 'Invalid product identifier in order item' });
    }

    const qty = Number(item.qty);
    if (!isPositiveInteger(qty) || qty > 50) {
      return res.status(400).json({ message: 'Each item quantity must be an integer between 1 and 50' });
    }

    if (item.variantSku && String(item.variantSku).length > 120) {
      return res.status(400).json({ message: 'Invalid variant selection' });
    }
  }

  if (paymentMethod && String(paymentMethod).trim().length > 60) {
    return res.status(400).json({ message: 'Invalid payment method' });
  }

  if (rawDiscountCode && String(rawDiscountCode).trim().length > 64) {
    return res.status(400).json({ message: 'Invalid discount code' });
  }

  if (!shippingAddress || typeof shippingAddress !== 'object') {
    return res.status(400).json({ message: 'Shipping or pickup details are required' });
  }

  const requestedFulfillment =
    fulfillmentMethod === 'pickup' || shippingAddress.isPickup ? 'pickup' : 'delivery';
  const isPickup = requestedFulfillment === 'pickup';

  const normalizedShippingAddress = {
    name: shippingAddress.name ? String(shippingAddress.name).trim() : '',
    phone: shippingAddress.phone ? String(shippingAddress.phone).trim() : '',
    address: shippingAddress.address ? String(shippingAddress.address).trim() : '',
    city: shippingAddress.city ? String(shippingAddress.city).trim() : '',
    postalCode: shippingAddress.postalCode ? String(shippingAddress.postalCode).trim() : '',
    country: shippingAddress.country ? String(shippingAddress.country).trim() : 'Kenya',
    region: shippingAddress.region ? String(shippingAddress.region).trim() : '',
    location: shippingAddress.location ? String(shippingAddress.location).trim() : '',
    isPickup,
    pickupLocation: shippingAddress.pickupLocation ? String(shippingAddress.pickupLocation).trim() : '',
  };

  if (!normalizedShippingAddress.name || !normalizedShippingAddress.phone) {
    return res.status(400).json({ message: 'Recipient name and phone are required' });
  }

  if (isPickup) {
    normalizedShippingAddress.pickupLocation = normalizedShippingAddress.pickupLocation || DEFAULT_PICKUP_LOCATION;
    normalizedShippingAddress.region = 'PICKUP';
    normalizedShippingAddress.location = normalizedShippingAddress.pickupLocation;
    normalizedShippingAddress.address = normalizedShippingAddress.address || normalizedShippingAddress.pickupLocation;
    normalizedShippingAddress.city = normalizedShippingAddress.city || DEFAULT_PICKUP_CITY;
    normalizedShippingAddress.postalCode = normalizedShippingAddress.postalCode || DEFAULT_PICKUP_POSTAL_CODE;
    normalizedShippingAddress.country = normalizedShippingAddress.country || DEFAULT_PICKUP_COUNTRY;
  } else {
    if (
      !normalizedShippingAddress.address ||
      !normalizedShippingAddress.city ||
      !normalizedShippingAddress.postalCode ||
      !normalizedShippingAddress.country
    ) {
      return res.status(400).json({ message: 'Complete delivery address is required' });
    }

    if (!normalizedShippingAddress.region || !normalizedShippingAddress.location) {
      return res.status(400).json({ message: 'Delivery region and location are required' });
    }
  }

  try {
    // ── 1. Validate stock & build trusted order items with DB prices ──
    const trustedItems = [];
    for (const item of orderItems) {
      const product = await Product.findById(item.product);

      if (!product) {
        return res.status(404).json({ message: `Product not found for item "${item.name}"` });
      }
      if (!product.isActive) {
        return res.status(400).json({ message: `"${product.name}" is no longer available.` });
      }
      let trustedPrice = product.price;
      let trustedImage = product.images && product.images[0] ? product.images[0] : '';
      let variantSku;
      let variantLabel;
      let variantColor;
      let variantStyle;

      if (item.variantSku) {
        const selectedVariant = (product.variants || []).find(
          (variant) =>
            variant.sku &&
            String(variant.sku).toLowerCase() === String(item.variantSku).toLowerCase()
        );

        if (!selectedVariant) {
          return res.status(400).json({
            message: `Selected variant is no longer available for "${product.name}".`,
          });
        }

        if (selectedVariant.stock < item.qty) {
          return res.status(400).json({
            message: `Not enough stock for "${product.name}" (${selectedVariant.label}). Available: ${selectedVariant.stock}, requested: ${item.qty}`,
          });
        }

        trustedPrice = selectedVariant.price;
        trustedImage = selectedVariant.image || trustedImage;
        variantSku = selectedVariant.sku;
        variantLabel = selectedVariant.label;
        variantColor = selectedVariant.color;
        variantStyle = selectedVariant.style;
      } else if (product.stock < item.qty) {
        return res.status(400).json({
          message: `Not enough stock for "${product.name}". Available: ${product.stock}, requested: ${item.qty}`,
        });
      }

      trustedItems.push({
        product: product._id,
        name: product.name,
        image: trustedImage,
        qty: item.qty,
        // Use the real DB price — never trust client price
        price: trustedPrice,
        variantSku,
        variantLabel,
        variantColor,
        variantStyle,
      });
    }

    // ── 2. Calculate itemsPrice from trusted DB prices ──
    const itemsPrice = trustedItems.reduce((sum, item) => sum + item.price * item.qty, 0);

    // ── 3. Resolve shipping price from SiteConfig ──
    const siteConfig = await SiteConfig.getSingleton();
    let shippingPrice = 500; // default fallback
    if (isPickup) {
      shippingPrice = 0;
    }

    if (!isPickup && normalizedShippingAddress.region && normalizedShippingAddress.location) {
      const group = (siteConfig.deliveryRouteGroups || []).find(
        (g) => g.road && g.road.trim().toUpperCase() === normalizedShippingAddress.region.trim().toUpperCase()
      );
      if (group) {
        const item = (group.items || []).find(
          (i) => i.location && i.location.trim().toUpperCase() === normalizedShippingAddress.location.trim().toUpperCase()
        );
        if (item) {
          shippingPrice = item.price;
        }
      }
    }

    // ── 4. Tax removed per user request ──
    const taxPrice = 0;
    const taxRate = 0;

    // ── 5. Validate discount code (server-side) ──
    let discountAmount = 0;
    let discountCodeSaved = null;
    if (rawDiscountCode) {
      const normalisedCode = String(rawDiscountCode).trim().toUpperCase();
      const discount = await DiscountCode.findOne({ code: normalisedCode });
      if (discount && discount.isCurrentlyValid(itemsPrice)) {
        let discountBaseTotal = itemsPrice;

        // If this code is scoped to specific products, only discount eligible lines.
        if (Array.isArray(discount.products) && discount.products.length > 0) {
          const eligibleSet = new Set(discount.products.map((id) => String(id)));
          let eligibleSubtotal = 0;

          for (const item of trustedItems) {
            if (!eligibleSet.has(String(item.product))) continue;
            eligibleSubtotal += Number(item.price || 0) * Number(item.qty || 0);
          }

          if (eligibleSubtotal <= 0) {
            discountBaseTotal = 0;
          } else {
            discountBaseTotal = eligibleSubtotal;
          }
        }

        if (discountBaseTotal > 0) {
          discountAmount = discount.computeDiscount(itemsPrice, discountBaseTotal);
        }

        if (discountAmount > 0) {
          discountCodeSaved = normalisedCode;
          // Increment usage counter only when discount actually applies
          discount.timesUsed = (discount.timesUsed || 0) + 1;
          await discount.save();
        }
      }
    }

    // ── 6. Compute authoritative totalPrice ──
    const totalPrice = Math.max(0, itemsPrice + taxPrice + shippingPrice - discountAmount);

    // ── 7. Decrement stock ──
    for (const item of trustedItems) {
      const product = await Product.findById(item.product);
      if (!product) continue;

      let updatedProduct = product;
      let variant = null;
      if (item.variantSku) {
        variant = (product.variants || []).find(
          (entry) =>
            entry.sku &&
            String(entry.sku).toLowerCase() === String(item.variantSku).toLowerCase()
        );
        if (!variant || variant.stock < item.qty) {
          return res.status(400).json({
            message: `Not enough stock for "${item.name}" (${item.variantLabel || item.variantSku}).`,
          });
        }
        variant.stock -= item.qty;
        product.stock = Math.max(0, Number(product.stock || 0) - item.qty);
        updatedProduct = await product.save();
      } else {
        updatedProduct = await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.qty } }, { new: true });
      }

      // ── Low-stock alert logic ──
      if (updatedProduct && typeof updatedProduct.stock === 'number' && typeof updatedProduct.lowStockThreshold === 'number') {
        if (updatedProduct.stock <= updatedProduct.lowStockThreshold) {
          // Send low-stock alert email to admins
          (async () => {
            try {
              const admins = await User.find({ isAdmin: true }).select('email name');
              const adminEmails = admins.map((a) => a.email).filter(Boolean);
              const envAdminEmail = process.env.ADMIN_ORDER_EMAIL;
              const recipientSet = new Set();
              const addRecipient = (email) => { if (email) recipientSet.add(email.toLowerCase()); };
              addRecipient(envAdminEmail);
              adminEmails.forEach(addRecipient);
              const recipients = Array.from(recipientSet);
              if (recipients.length > 0) {
                const subject = `Low Stock Alert: ${updatedProduct.name}`;
                const text = `Product "${updatedProduct.name}" is low on stock.\nCurrent stock: ${updatedProduct.stock}\nThreshold: ${updatedProduct.lowStockThreshold}`;
                await sendEmail({ to: recipients, subject, text, html: `<p>${text.replace(/\n/g, '<br>')}</p>` });
              }
            } catch (err) {
              console.error('Failed to send low-stock alert:', err);
            }
          })();
        }
      }
    }

    // ── 8. Create the order ──
    const order = new Order({
      orderItems: trustedItems,
      user: req.user._id,
      shippingAddress: normalizedShippingAddress,
      fulfillmentMethod: requestedFulfillment,
      paymentMethod,
      status: 'pending',
      statusHistory: [{ status: 'pending', note: 'Order placed' }],
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      discountCode: discountCodeSaved,
      discountAmount,
    });

    const createdOrder = await order.save();

    // ── 9. Send confirmation emails (non-blocking) ──
    (async () => {
      try {
        const user = req.user;
        const admins = await User.find({ isAdmin: true }).select('email name');
        const adminEmails = admins.map((a) => a.email).filter(Boolean);
        const customerEmail = user && user.email ? user.email : null;
        const envAdminEmail = process.env.ADMIN_ORDER_EMAIL;

        const recipientSet = new Set();
        const addRecipient = (email) => { if (email) recipientSet.add(email.toLowerCase()); };
        addRecipient(envAdminEmail);
        adminEmails.forEach(addRecipient);
        addRecipient(customerEmail);

        const recipients = Array.from(recipientSet);
        if (recipients.length === 0) return;

        let recommendedProducts = [];
        try {
          const firstItem = createdOrder.orderItems[0];
          if (firstItem) {
            const product = await Product.findById(firstItem.product);
            if (product) {
              recommendedProducts = await Product.find({
                category: product.category,
                _id: { $nin: [product._id, ...createdOrder.orderItems.map((i) => i.product)] },
                isActive: true,
              }).limit(3).select('name price images slug');
            }
          }
        } catch (recError) {
          console.error('Failed to fetch recommended products:', recError);
        }

        const subject = `CaseProz - New Order ${createdOrder._id}`;
        const itemsText = createdOrder.orderItems
          .map((item) => `${item.qty} x ${item.name} (KSh ${item.price.toLocaleString()})`)
          .join('\n');
        const isPickupOrder =
          createdOrder.fulfillmentMethod === 'pickup' ||
          (createdOrder.shippingAddress && createdOrder.shippingAddress.isPickup);
        const shippingText = createdOrder.shippingAddress
          ? isPickupOrder
            ? `Pickup at ${createdOrder.shippingAddress.pickupLocation || createdOrder.shippingAddress.location || DEFAULT_PICKUP_LOCATION}`
            : `${createdOrder.shippingAddress.address}, ${createdOrder.shippingAddress.city}, ${createdOrder.shippingAddress.postalCode}, ${createdOrder.shippingAddress.country}`
          : 'N/A';

        const textLines = [
          `Thank you for your purchase from CaseProz!`,
          ``,
          `Order ID: ${createdOrder._id}`,
          user ? `Customer: ${user.name} <${user.email}>` : '',
          ``,
          `Payment method: ${createdOrder.paymentMethod || 'N/A'}`,
          `Order status: ${createdOrder.status || 'pending'}`,
          ``,
          `Items:`,
          itemsText,
          ``,
          `Items total: KSh ${createdOrder.itemsPrice.toLocaleString()}`,
          `Shipping: ${isPickupOrder ? 'Pick up (Free)' : `KSh ${createdOrder.shippingPrice.toLocaleString()}`}`,
          `Tax: KSh ${createdOrder.taxPrice.toLocaleString()}`,
        ];

        if (createdOrder.discountAmount && createdOrder.discountAmount > 0) {
          textLines.push(
            `Discount${createdOrder.discountCode ? ` (${createdOrder.discountCode})` : ''}: -KSh ${createdOrder.discountAmount.toLocaleString()}`
          );
        }

        textLines.push(
          `Total: KSh ${createdOrder.totalPrice.toLocaleString()}`,
          ``,
          `${isPickupOrder ? 'Pickup details:' : 'Shipping address:'}`,
          shippingText,
          ``,
          `Thank you for shopping with CaseProz.`,
          `If you have any questions about this order, reply to this email or contact our support team.`
        );

        const text = textLines.filter(Boolean).join('\n');
        const html = generateOrderConfirmationEmail(createdOrder, user, recommendedProducts);

        await sendEmail({ to: recipients, subject, text, html });
      } catch (error) {
        console.error('Failed to send order emails:', error.message || error);
      }
    })();

    res.status(201).json(createdOrder);
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ message: 'Error creating order' });
  }
});


// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
router.get('/myorders', protect, async (req, res) => {
  const orders = await Order.find({ user: req.user._id });
  res.json(orders);
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email phone');

  if (order) {
    res.json(order);
  } else {
    res.status(404).json({ message: 'Order not found' });
  }
});

// @desc    Get all orders (with optional filters for admin)
// @route   GET /api/orders
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const filter = await buildOrderAdminQuery(req);
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate('user', 'id name email');

    res.json(orders);
  } catch (error) {
    console.error('Failed to fetch admin orders:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// @desc    Update order to delivered
// @route   PUT /api/orders/:id/deliver
// @access  Private/Admin
router.put('/:id/deliver', protect, admin, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (order) {
    order.isDelivered = true;
    order.deliveredAt = Date.now();
    order.status = 'delivered';
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: 'delivered',
      note: 'Order marked as delivered',
      updatedAt: new Date(),
    });

    const updatedOrder = await order.save();

    await logAuditEvent({
      req,
      actor: buildActorFromReq(req),
      action: 'order_marked_delivered',
      entityType: 'order',
      entityId: updatedOrder._id,
      details: {
        orderId: String(updatedOrder._id),
        status: updatedOrder.status,
      },
    });

    res.json(updatedOrder);
  } else {
    res.status(404).json({ message: 'Order not found' });
  }
});

// @desc    Update order status / tracking
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
router.put('/:id/status', protect, admin, async (req, res) => {
  const { status, trackingNumber, carrier, note } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid or missing status value' });
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ message: 'Order not found' });
  }

  order.status = status;

  if (trackingNumber !== undefined) {
    order.trackingNumber = trackingNumber;
  }

  if (carrier !== undefined) {
    order.carrier = carrier;
  }

  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({
    status,
    note: note || undefined,
    updatedAt: new Date(),
  });

  if (status === 'delivered') {
    order.isDelivered = true;
    order.deliveredAt = new Date();
  }

  const updatedOrder = await order.save();

  await logAuditEvent({
    req,
    actor: buildActorFromReq(req),
    action: 'order_status_updated',
    entityType: 'order',
    entityId: updatedOrder._id,
    details: {
      orderId: String(updatedOrder._id),
      status,
      trackingNumber: trackingNumber || '',
      carrier: carrier || '',
      note: note || '',
    },
  });

  res.json(updatedOrder);
});

// @desc    Bulk update order status
// @route   PUT /api/orders/bulk/status
// @access  Private/Admin
router.put('/bulk/status', protect, admin, async (req, res) => {
  const { orderIds, status, note } = req.body;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({ message: 'orderIds array is required' });
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid or missing status value' });
  }

  try {
    const orders = await Order.find({ _id: { $in: orderIds } });

    const now = new Date();
    const statusEntry = {
      status,
      note: note || undefined,
      updatedAt: now,
    };

    for (const order of orders) {
      order.status = status;
      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push(statusEntry);

      if (status === 'delivered') {
        order.isDelivered = true;
        order.deliveredAt = now;
      }
    }

    const updatedOrders = await Promise.all(orders.map((o) => o.save()));

    await logAuditEvent({
      req,
      actor: buildActorFromReq(req),
      action: 'orders_bulk_status_updated',
      entityType: 'order',
      details: {
        orderIds: updatedOrders.map((o) => String(o._id)),
        updatedCount: updatedOrders.length,
        status,
        note: note || '',
      },
    });

    res.json({
      updatedCount: updatedOrders.length,
      orders: updatedOrders,
    });
  } catch (error) {
    console.error('Failed to bulk update order status:', error);
    res.status(500).json({ message: 'Failed to bulk update order status' });
  }
});

// @desc    Export orders as CSV (respects same filters as GET /api/orders)
// @route   GET /api/orders/export
// @access  Private/Admin
router.get('/export', protect, admin, async (req, res) => {
  try {
    const filter = await buildOrderAdminQuery(req);
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate('user', 'name email');

    const header = [
      'Order ID',
      'Created At',
      'Customer Name',
      'Customer Email',
      'Status',
      'Payment Method',
      'Items Total',
      'Shipping',
      'Tax',
      'Total',
      'Paid',
      'Delivered',
    ];

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = orders.map((order) => [
      order._id,
      order.createdAt ? order.createdAt.toISOString() : '',
      order.user && order.user.name ? order.user.name : '',
      order.user && order.user.email ? order.user.email : '',
      order.status || '',
      order.paymentMethod || '',
      order.itemsPrice != null ? order.itemsPrice : '',
      order.shippingPrice != null ? order.shippingPrice : '',
      order.taxPrice != null ? order.taxPrice : '',
      order.totalPrice != null ? order.totalPrice : '',
      order.isPaid ? 'Yes' : 'No',
      order.isDelivered ? 'Yes' : 'No',
    ]);

    const csvLines = [
      header.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ];

    const csvContent = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="orders-export.csv"'
    );
    res.send(csvContent);
  } catch (error) {
    console.error('Failed to export orders CSV:', error);
    res.status(500).json({ message: 'Failed to export orders' });
  }
});

module.exports = router;
