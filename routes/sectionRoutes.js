const express = require('express');
const router = express.Router();
const Section = require('../models/Section');
const { protect, admin } = require('../middleware/authMiddleware');

// Create a new section
router.post('/', protect, admin, async (req, res) => {
  try {
    const { name, type, items, description } = req.body;
    const section = new Section({ name, type, items, description });
    await section.save();
    res.status(201).json(section);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all sections
router.get('/', async (req, res) => {
  try {
    const sections = await Section.find().populate('items');
    res.json(sections);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a section
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const section = await Section.findById(req.params.id);
    if (!section) return res.status(404).json({ message: 'Section not found' });
    section.name = req.body.name || section.name;
    section.type = req.body.type || section.type;
    section.items = req.body.items || section.items;
    section.description = req.body.description || section.description;
    await section.save();
    res.json(section);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a section
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const section = await Section.findByIdAndDelete(req.params.id);
    if (!section) return res.status(404).json({ message: 'Section not found' });
    res.json({ message: 'Section removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
