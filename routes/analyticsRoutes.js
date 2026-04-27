const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/authMiddleware');

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

    // Find products and variants at or below their low-stock threshold (use global if not set)
    const SiteConfig = require('../models/SiteConfig');
    const siteConfig = await SiteConfig.getSingleton();
    const globalLowStock = typeof siteConfig.globalLowStockThreshold === 'number' ? siteConfig.globalLowStockThreshold : 5;
    const productsAll = await Product.find({}).select('name stock lowStockThreshold images slug variants');
    const lowStockProducts = [];
    productsAll.forEach(product => {
      const threshold = typeof product.lowStockThreshold === 'number' ? product.lowStockThreshold : globalLowStock;
      // Main product stock
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
          isVariant: false
        });
      }
      // Variants
      if (Array.isArray(product.variants)) {
        product.variants.forEach(variant => {
          if (
            typeof variant.stock === 'number' &&
            typeof threshold === 'number' &&
            variant.stock <= threshold
          ) {
            lowStockProducts.push({
              _id: product._id,
              name: product.name + ' - ' + (variant.label || variant.sku),
              stock: variant.stock,
              lowStockThreshold: threshold,
              images: [variant.image || product.images?.[0]].filter(Boolean),
              slug: product.slug,
              isVariant: true,
              variantSku: variant.sku,
              variantLabel: variant.label,
              variantColor: variant.color,
              variantStyle: variant.style
            });
          }
        });
      }
    });

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

module.exports = router;
