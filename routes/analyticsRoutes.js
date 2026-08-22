const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const AuditLog = require('../models/AuditLog');
const DiscountCode = require('../models/DiscountCode');
const Section = require('../models/Section');
const SiteConfig = require('../models/SiteConfig');
const mongoose = require('mongoose');
const { protect, admin } = require('../middleware/authMiddleware');

// @desc    Get audit logs
// @route   GET /api/analytics/audit-logs
// @access  Private/Admin
router.get('/audit-logs', protect, admin, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 30,
      action,
      entityType,
      actorEmail,
      q,
      from,
      to,
    } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limit = Math.min(100, Math.max(1, Number(pageSize) || 30));
    const skip = (pageNumber - 1) * limit;

    const filter = {};

    if (action) {
      filter.action = String(action).trim();
    }

    if (entityType) {
      filter.entityType = String(entityType).trim();
    }

    if (actorEmail) {
      filter['actor.email'] = { $regex: String(actorEmail).trim(), $options: 'i' };
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
          filter.createdAt.$gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = toDate;
        }
      }

      if (Object.keys(filter.createdAt).length === 0) {
        delete filter.createdAt;
      }
    }

    if (q) {
      const queryText = String(q).trim();
      filter.$or = [
        { action: { $regex: queryText, $options: 'i' } },
        { entityType: { $regex: queryText, $options: 'i' } },
        { entityId: { $regex: queryText, $options: 'i' } },
        { 'actor.name': { $regex: queryText, $options: 'i' } },
        { 'actor.email': { $regex: queryText, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: {
        page: pageNumber,
        pageSize: limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

const asNumber = (value) => (Number.isFinite(value) ? value : 0);

const buildSector = ({ key, title, status, summary, metrics }) => ({
  key,
  title,
  status,
  summary,
  metrics,
});

const getLowStockProducts = async () => {
  const siteConfig = await SiteConfig.getSingleton();
  const globalLowStock = typeof siteConfig.globalLowStockThreshold === 'number' ? siteConfig.globalLowStockThreshold : 5;
  const productsAll = await Product.find({}).select('name stock lowStockThreshold images slug variants');
  const lowStockProducts = [];

  productsAll.forEach((product) => {
    const threshold = typeof product.lowStockThreshold === 'number' ? product.lowStockThreshold : globalLowStock;

    if (
      typeof product.stock === 'number' &&
      typeof threshold === 'number' &&
      product.stock <= threshold
    ) {
      lowStockProducts.push({
        _id: product._id,
        name: product.name,
        stock: product.stock,
        lowStockThreshold: threshold,
        images: product.images,
        slug: product.slug,
        isVariant: false,
      });
    }

    if (Array.isArray(product.variants)) {
      product.variants.forEach((variant) => {
        if (
          typeof variant.stock === 'number' &&
          typeof threshold === 'number' &&
          variant.stock <= threshold
        ) {
          lowStockProducts.push({
            _id: product._id,
            name: `${product.name} - ${variant.label || variant.sku}`,
            stock: variant.stock,
            lowStockThreshold: threshold,
            images: [variant.image || product.images?.[0]].filter(Boolean),
            slug: product.slug,
            isVariant: true,
            variantSku: variant.sku,
            variantLabel: variant.label,
            variantColor: variant.color,
            variantStyle: variant.style,
          });
        }
      });
    }
  });

  return lowStockProducts;
};

// @desc    Capture lightweight frontend analytics events
// @route   POST /api/analytics/event
// @access  Public
router.post('/event', async (req, res) => {
  try {
    const {
      eventName,
      page = 'home',
      section,
      label,
      sessionId,
      metadata,
      referrer,
    } = req.body || {};

    if (!eventName || typeof eventName !== 'string') {
      return res.status(400).json({ message: 'eventName is required' });
    }

    await AnalyticsEvent.create({
      eventName: eventName.trim(),
      page,
      section,
      label,
      sessionId,
      metadata,
      referrer,
      userAgent: req.get('user-agent') || '',
      ip: req.ip,
    });

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: 'Failed to record analytics event' });
  }
});

// @desc    Get dashboard analytics
// @route   GET /api/analytics/summary
// @access  Private/Admin
router.get('/summary', protect, admin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    
    const orders = await Order.find({});
    const totalOrders = orders.length;
    
    const totalSales = orders.reduce((acc, order) => {
        // Only count paid orders, or we can count all depending on business logic. 
        // Let's count all totalPrice for now.
        return acc + order.totalPrice;
    }, 0);

    const products = await Product.countDocuments({});

    const lowStockProducts = await getLowStockProducts();

    // Get recent 5 orders
    const recentOrders = await Order.find({}).sort({ createdAt: -1 }).limit(5).populate('user', 'name');

    // Aggregate sales by month (optional, for charts)
    const salesData = await Order.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalSales: { $sum: "$totalPrice" },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);

    res.json({
      totalUsers,
      totalOrders,
      totalSales,
      products,
      recentOrders,
      salesData,
      lowStockProducts
    });

  } catch (error) {
    res.status(500).json({ message: 'Error fetching analytics summary' });
  }
});

// @desc    Get admin health summary across core system sectors
// @route   GET /api/analytics/health
// @access  Private/Admin
router.get('/health', protect, admin, async (req, res) => {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      verifiedUsers,
      adminUsers,
      totalOrders,
      pendingOrders,
      processingOrders,
      unpaidOldOrders,
      totalProducts,
      activeProducts,
      sectionCount,
      totalDiscounts,
      activeDiscounts,
      expiringDiscounts,
      lowStockProducts,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ isAdmin: true }),
      Order.countDocuments({}),
      Order.countDocuments({ status: { $in: ['pending', 'confirmed'] } }),
      Order.countDocuments({ status: { $in: ['processing', 'dispatched', 'in_transit', 'out_for_delivery'] } }),
      Order.countDocuments({ isPaid: false, createdAt: { $lte: twentyFourHoursAgo } }),
      Product.countDocuments({}),
      Product.countDocuments({ isActive: true }),
      Section.countDocuments({}),
      DiscountCode.countDocuments({}),
      DiscountCode.countDocuments({
        active: true,
        $and: [
          { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }] },
        ],
      }),
      DiscountCode.countDocuments({
        active: true,
        expiresAt: { $gte: now, $lte: sevenDaysAhead },
      }),
      getLowStockProducts(),
    ]);

    const unverifiedUsers = asNumber(totalUsers) - asNumber(verifiedUsers);
    const inactiveProducts = asNumber(totalProducts) - asNumber(activeProducts);
    const lowStockCount = Array.isArray(lowStockProducts) ? lowStockProducts.length : 0;
    const dbConnected = mongoose?.connection?.readyState === 1;

    const ordersStatus =
      pendingOrders > 60 || unpaidOldOrders > 25
        ? 'critical'
        : pendingOrders > 20 || unpaidOldOrders > 5
          ? 'warning'
          : 'healthy';

    const inventoryStatus =
      lowStockCount > 45 || inactiveProducts > activeProducts
        ? 'critical'
        : lowStockCount > 0 || inactiveProducts > 0
          ? 'warning'
          : 'healthy';

    const usersStatus =
      totalUsers > 0 && unverifiedUsers > verifiedUsers
        ? 'warning'
        : 'healthy';

    const discountsStatus =
      activeDiscounts === 0
        ? 'warning'
        : expiringDiscounts > 0
          ? 'warning'
          : 'healthy';

    const contentStatus = sectionCount === 0 ? 'warning' : 'healthy';

    const sectors = [
      buildSector({
        key: 'database',
        title: 'Database',
        status: dbConnected ? 'healthy' : 'critical',
        summary: dbConnected ? 'Database connection is stable.' : 'Database is disconnected.',
        metrics: [
          { label: 'Connection state', value: dbConnected ? 'Connected' : 'Disconnected' },
          { label: 'Node uptime', value: `${Math.round(process.uptime())}s` },
        ],
      }),
      buildSector({
        key: 'orders',
        title: 'Orders Pipeline',
        status: ordersStatus,
        summary:
          ordersStatus === 'healthy'
            ? 'Order processing volume is within normal range.'
            : 'Order backlog needs attention.',
        metrics: [
          { label: 'Total orders', value: totalOrders },
          { label: 'Pending + confirmed', value: pendingOrders },
          { label: 'In progress', value: processingOrders },
          { label: 'Unpaid older than 24h', value: unpaidOldOrders },
        ],
      }),
      buildSector({
        key: 'inventory',
        title: 'Inventory',
        status: inventoryStatus,
        summary:
          inventoryStatus === 'healthy'
            ? 'Inventory health is good.'
            : 'Low stock or inactive products detected.',
        metrics: [
          { label: 'Total products', value: totalProducts },
          { label: 'Active products', value: activeProducts },
          { label: 'Inactive products', value: inactiveProducts },
          { label: 'Low stock items', value: lowStockCount },
        ],
      }),
      buildSector({
        key: 'customers',
        title: 'Customers',
        status: usersStatus,
        summary:
          usersStatus === 'healthy'
            ? 'Customer verification trend looks healthy.'
            : 'Unverified users are high compared to verified users.',
        metrics: [
          { label: 'Total users', value: totalUsers },
          { label: 'Verified users', value: verifiedUsers },
          { label: 'Unverified users', value: unverifiedUsers },
          { label: 'Admin users', value: adminUsers },
        ],
      }),
      buildSector({
        key: 'discounts',
        title: 'Discount Programs',
        status: discountsStatus,
        summary:
          discountsStatus === 'healthy'
            ? 'Discount setup is healthy.'
            : 'Discount coverage or expiry needs review.',
        metrics: [
          { label: 'Total discount codes', value: totalDiscounts },
          { label: 'Currently active', value: activeDiscounts },
          { label: 'Expiring in 7 days', value: expiringDiscounts },
        ],
      }),
      buildSector({
        key: 'content',
        title: 'Content & Sections',
        status: contentStatus,
        summary:
          contentStatus === 'healthy'
            ? 'Homepage sections are configured.'
            : 'No homepage sections found.',
        metrics: [
          { label: 'Configured sections', value: sectionCount },
        ],
      }),
    ];

    const severityScore = sectors.reduce((score, sector) => {
      if (sector.status === 'critical') return score + 2;
      if (sector.status === 'warning') return score + 1;
      return score;
    }, 0);

    const overallStatus =
      severityScore >= 5
        ? 'critical'
        : severityScore >= 2
          ? 'warning'
          : 'healthy';

    return res.json({
      generatedAt: now.toISOString(),
      overallStatus,
      uptimeSeconds: Math.round(process.uptime()),
      sectors,
      lowStockPreview: lowStockProducts.slice(0, 8),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching system health summary' });
  }
});

module.exports = router;
