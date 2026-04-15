const express = require('express');
const Category = require('../models/Category');
const router = express.Router();

// Get all categories (with subcategories)
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new category
router.post('/', async (req, res) => {
  try {
    const { name, subCategories } = req.body;
    const category = new Category({ name, subCategories });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a category
router.put('/:id', async (req, res) => {
  try {
    const { name, subCategories } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, subCategories },
      { new: true }
    );
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a category
router.delete('/:id', async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a subcategory to a category
router.post('/:id/subcategories', async (req, res) => {
  try {
    const { name } = req.body;
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    category.subCategories.push({ name });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a subcategory
router.put('/:categoryId/subcategories/:subCategoryId', async (req, res) => {
  try {
    const { name } = req.body;
    const category = await Category.findById(req.params.categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    const subCategory = category.subCategories.id(req.params.subCategoryId);
    if (!subCategory) return res.status(404).json({ message: 'Subcategory not found' });
    subCategory.name = name;
    await category.save();
    res.json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a subcategory
router.delete('/:categoryId/subcategories/:subCategoryId', async (req, res) => {
  try {
    const category = await Category.findById(req.params.categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    category.subCategories.id(req.params.subCategoryId).remove();
    await category.save();
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
