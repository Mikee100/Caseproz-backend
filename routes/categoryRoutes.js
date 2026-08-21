const express = require('express');
const Category = require('../models/Category');
const { protect, admin } = require('../middleware/authMiddleware');
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
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    await category.softDelete();
    res.json({ message: 'Category archived' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List archived categories
router.get('/archived/list', protect, admin, async (req, res) => {
  try {
    const categories = await Category.find({ deletedAt: { $ne: null } })
      .setOptions({ includeDeleted: true })
      .sort({ deletedAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Restore archived category
router.put('/:id/restore', protect, admin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).setOptions({ includeDeleted: true });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    if (!category.deletedAt) return res.status(400).json({ message: 'Category is not archived' });
    await category.restore();
    res.json({ message: 'Category restored' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Permanently delete category
router.delete('/:id/purge', protect, admin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).setOptions({ includeDeleted: true });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    await Category.deleteOne({ _id: category._id });
    res.json({ message: 'Category permanently deleted' });
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

    const targetId = String(req.params.subCategoryId);
    const directSubCategory = category.subCategories.id(targetId);

    if (directSubCategory) {
      category.subCategories.pull({ _id: targetId });
    } else {
      // Backward-compatible fallback: some legacy entries may use `id` instead of `_id`.
      const beforeCount = category.subCategories.length;
      category.subCategories = category.subCategories.filter((sub) => {
        const subId = String(sub?._id || sub?.id || '');
        return subId !== targetId;
      });

      // Idempotent delete: if not found, return success so UI can refresh cleanly.
      if (category.subCategories.length === beforeCount) {
        return res.status(200).json({
          message: 'Subcategory already removed',
          category,
        });
      }
    }

    await category.save();
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
