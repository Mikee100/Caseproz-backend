const express = require('express');
const SiteConfig = require('../models/SiteConfig');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// @desc    Get public site configuration
// @route   GET /api/site-config
// @access  Public
router.get('/', async (req, res) => {
  try {
    const config = await SiteConfig.getSingleton();
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load site configuration' });
  }
});

// @desc    Update site configuration
// @route   PUT /api/site-config
// @access  Private/Admin
router.put('/', protect, admin, async (req, res) => {
  try {
    const config = await SiteConfig.getSingleton();


    const {
      taxRate,
      promoBarText,
      promoBarLink,
      heroSlides,
      curatedCollections,
      deliveryRouteGroups,
      globalLowStockThreshold,
    } = req.body;

    if (typeof taxRate === 'number') {
      config.taxRate = taxRate;
    }

    if (promoBarText !== undefined) {
      config.promoBarText = promoBarText;
    }

    if (promoBarLink !== undefined) {
      config.promoBarLink = promoBarLink;
    }

    if (Array.isArray(heroSlides)) {
      config.heroSlides = heroSlides;
    }

    if (Array.isArray(curatedCollections)) {
      config.curatedCollections = curatedCollections;
    }

    if (Array.isArray(deliveryRouteGroups)) {
      config.deliveryRouteGroups = deliveryRouteGroups;
    }

    if (typeof globalLowStockThreshold === 'number') {
      config.globalLowStockThreshold = globalLowStockThreshold;
    }

    const updated = await config.save();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to update site configuration' });
  }
});

module.exports = router;

