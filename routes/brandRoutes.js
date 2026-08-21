const express = require('express');
const Brand = require('../models/Brand');
const { protect, admin } = require('../middleware/authMiddleware');
const router = express.Router();

// Get all brands
router.get('/', async (req, res) => {
  try {
    const brands = await Brand.find();
    res.json(brands);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new brand
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    const brand = new Brand({ name, description });
    await brand.save();
    res.status(201).json(brand);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a brand
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true }
    );
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    res.json(brand);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a brand
router.delete('/:id', async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    await brand.softDelete();
    res.json({ message: 'Brand archived' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List archived brands
router.get('/archived/list', protect, admin, async (req, res) => {
  try {
    const brands = await Brand.find({ deletedAt: { $ne: null } })
      .setOptions({ includeDeleted: true })
      .sort({ deletedAt: -1 });
    res.json(brands);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Restore archived brand
router.put('/:id/restore', protect, admin, async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id).setOptions({ includeDeleted: true });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    if (!brand.deletedAt) return res.status(400).json({ message: 'Brand is not archived' });
    await brand.restore();
    res.json({ message: 'Brand restored' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Permanently delete brand
router.delete('/:id/purge', protect, admin, async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id).setOptions({ includeDeleted: true });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    await Brand.deleteOne({ _id: brand._id });
    res.json({ message: 'Brand permanently deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
