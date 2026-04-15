const express = require('express');
const Brand = require('../models/Brand');
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
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    res.json({ message: 'Brand deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
