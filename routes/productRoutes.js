const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const sendEmail = require('../utils/sendEmail');
const { protect, admin } = require('../middleware/authMiddleware');

// Simple in-memory cache for the full products list (no filters)
let productsCache = {
  data: null,
  timestamp: 0,
};
const PRODUCTS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

const invalidateProductsCache = () => {
  productsCache = { data: null, timestamp: 0 };
};

const toAbsoluteUploadUrl = (value, req) => {
  if (typeof value !== 'string') return value;
  if (!value.startsWith('/uploads/')) return value;
  const host = req.get('host');
  if (!host) return value;
  return `${req.protocol}://${host}${value}`;
};

const serializeProductForClient = (product, req) => {
  const plain = product && typeof product.toObject === 'function'
    ? product.toObject()
    : { ...product };

  if (Array.isArray(plain.images)) {
    plain.images = plain.images.map((img) => toAbsoluteUploadUrl(img, req));
  }

  if (Array.isArray(plain.variants)) {
    plain.variants = plain.variants.map((variant) => ({
      ...variant,
      image: toAbsoluteUploadUrl(variant.image, req),
    }));
  }

  return plain;
};

const normalizeVariants = (variants) => {
  if (!Array.isArray(variants)) return [];

  return variants
    .map((variant) => {
      if (!variant || typeof variant !== 'object') return null;

      const label = String(variant.label || variant.color || '').trim();
      const color = variant.color ? String(variant.color).trim() : '';
      const style = variant.style ? String(variant.style).trim() : '';
      const sku = String(variant.sku || '').trim();
      const image = variant.image ? String(variant.image).trim() : '';
      const price = Number(variant.price);
      const stock = Number(variant.stock);

      if (!label || !sku || !Number.isFinite(price) || !Number.isFinite(stock)) {
        return null;
      }

      return {
        label,
        color,
        style,
        sku,
        image,
        price,
        stock,
      };
    })
    .filter(Boolean);
};

const validateVariants = (variants) => {
  if (!Array.isArray(variants) || variants.length === 0) return null;

  if (variants.some((v) => v.price < 0 || v.stock < 0)) {
    return 'Variant price and stock must be non-negative numbers.';
  }

  const skuSet = new Set();
  for (const variant of variants) {
    const key = variant.sku.toLowerCase();
    if (skuSet.has(key)) {
      return 'Duplicate variant SKU values are not allowed.';
    }
    skuSet.add(key);
  }

  return null;
};

const applyVariantFallbacks = (productPayload) => {
  const normalizedVariants = normalizeVariants(productPayload.variants);
  const variantError = validateVariants(normalizedVariants);
  if (variantError) {
    const error = new Error(variantError);
    error.statusCode = 400;
    throw error;
  }

  const nextPayload = { ...productPayload, variants: normalizedVariants };

  if (normalizedVariants.length > 0) {
    const prices = normalizedVariants.map((v) => v.price);
    const stock = normalizedVariants.reduce((sum, v) => sum + v.stock, 0);
    nextPayload.price = Math.min(...prices);
    nextPayload.stock = stock;
    if (!nextPayload.sku) {
      nextPayload.sku = normalizedVariants[0].sku;
    }
  }

  return nextPayload;
};

// @desc    Fetch products (with optional search, filters, pagination, and sorting)
// @route   GET /api/products
// @access  Public
router.get('/', async (req, res) => {
  try {
    const keywordFilter = req.query.keyword
      ? {
          $or: [
            {
              name: {
                $regex: req.query.keyword,
                $options: 'i',
              },
            },
            {
              description: {
                $regex: req.query.keyword,
                $options: 'i',
              },
            },
            {
              category: {
                $regex: req.query.keyword,
                $options: 'i',
              },
            },
            {
              subCategory: {
                $regex: req.query.keyword,
                $options: 'i',
              },
            },
          ],
        }
      : {};

    const category = req.query.category;
    const subCategory = req.query.subCategory;
    const brand = req.query.brand;
    const variantGroup = req.query.variantGroup;
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;

    const page = req.query.page ? Number(req.query.page) || 1 : 0;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) || 12 : 12;

    let sortOption = { createdAt: -1 };
    const sort = req.query.sort;
    if (sort === 'priceAsc') {
      sortOption = { price: 1 };
    } else if (sort === 'priceDesc') {
      sortOption = { price: -1 };
    } else if (sort === 'nameAsc') {
      sortOption = { name: 1 };
    } else if (sort === 'nameDesc') {
      sortOption = { name: -1 };
    } else if (sort === 'newest') {
      sortOption = { createdAt: -1 };
    }

    let baseQuery = {
      ...keywordFilter,
    };

    if (category) {
      baseQuery = { ...baseQuery, category };
    }

    if (subCategory) {
      baseQuery = { ...baseQuery, subCategory };
    }

    if (variantGroup) {
      baseQuery = { ...baseQuery, variantGroup };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      baseQuery.price = {};
      if (minPrice !== undefined) {
        baseQuery.price.$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        baseQuery.price.$lte = maxPrice;
      }
    }

    let query = baseQuery;

    if (brand) {
      const brandFilter = {
        $or: [
          { category: { $regex: brand, $options: 'i' } },
          { subCategory: { $regex: brand, $options: 'i' } },
          { name: { $regex: brand, $options: 'i' } },
        ],
      };

      query = Object.keys(baseQuery).length
        ? { $and: [baseQuery, brandFilter] }
        : brandFilter;
    }

    const hasFilters =
      req.query.keyword ||
      category ||
      subCategory ||
      brand ||
      minPrice !== undefined ||
      maxPrice !== undefined ||
      sort;

    const isCacheableRequest = !hasFilters && page === 0;

    // If a page is provided, use paginated response shape
    if (page > 0) {
      const count = await Product.countDocuments(query);
      const products = await Product.find(query)
        .sort(sortOption)
        .limit(pageSize)
        .skip(pageSize * (page - 1));

      const serializedProducts = products.map((p) => serializeProductForClient(p, req));

      res.json({
        products: serializedProducts,
        page,
        pages: Math.ceil(count / pageSize),
        total: count,
      });
      return;
    }

    // Fallback: no pagination requested, return full list (sorted) in consistent object shape
    if (isCacheableRequest && productsCache.data) {
      const age = Date.now() - productsCache.timestamp;
      if (age < PRODUCTS_CACHE_TTL_MS) {
        const serializedCached = productsCache.data.map((p) =>
          serializeProductForClient(p, req)
        );
        return res.json({
          products: serializedCached,
          page: 1,
          pages: 1,
          total: serializedCached.length,
        });
      }
    }

    const products = await Product.find(query).sort(sortOption);

    if (isCacheableRequest) {
      productsCache = {
        data: products,
        timestamp: Date.now(),
      };
    }

    res.json({
      products: products.map((p) => serializeProductForClient(p, req)),
      page: 1,
      pages: 1,
      total: products.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Fetch single product by slug
// @route   GET /api/products/:slug
// @access  Public
router.get('/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (product) {
      res.json(serializeProductForClient(product, req));
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      price,
      originalPrice,
      category,
      subCategory,
      images,
      stock,
      lowStockThreshold,
      specs,
      isFeatured,
      onSale,
      isActive,
      keyFeatures,
      sku,
      brand,
      categories,
      featureHeadline,
      featureSubtext,
      notes,
      metaTitle,
      metaDescription,
      variants,
    } = req.body;

    const payload = applyVariantFallbacks({
      name,
      slug,
      description,
      price,
      originalPrice,
      category,
      subCategory,
      images,
      stock,
      lowStockThreshold,
      specs,
      isFeatured,
      onSale,
      isActive,
      keyFeatures,
      sku,
      brand,
      categories,
      featureHeadline,
      featureSubtext,
      notes,
      metaTitle,
      metaDescription,
      variants,
    });

    const product = new Product(payload);

    const createdProduct = await product.save();
    invalidateProductsCache();
    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message });
  }
});

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      price,
      originalPrice,
      category,
      subCategory,
      images,
      stock,
      lowStockThreshold,
      specs,
      isFeatured,
      onSale,
      isActive,
      keyFeatures,
      sku,
      brand,
      categories,
      featureHeadline,
      featureSubtext,
      notes,
      metaTitle,
      metaDescription,
      variants,
    } = req.body;
    const product = await Product.findById(req.params.id);

    if (product) {
      product.name = name || product.name;
      product.slug = slug || product.slug;
      product.description = description || product.description;
      product.price = price ?? product.price;
      product.originalPrice = originalPrice || product.originalPrice;
      product.category = category || product.category;
      product.subCategory = subCategory || product.subCategory;
      product.images = images || product.images;
      product.stock = stock !== undefined ? stock : product.stock;
      if (lowStockThreshold !== undefined) product.lowStockThreshold = lowStockThreshold;
      product.specs = specs || product.specs;
      product.isFeatured = isFeatured !== undefined ? isFeatured : product.isFeatured;
      product.onSale = onSale !== undefined ? onSale : product.onSale;
      if (typeof isActive === 'boolean') {
        product.isActive = isActive;
      }
      if (keyFeatures !== undefined) product.keyFeatures = keyFeatures;
      if (sku !== undefined) product.sku = sku;
      if (brand !== undefined) product.brand = brand;
      if (categories !== undefined) product.categories = categories;
      if (featureHeadline !== undefined) product.featureHeadline = featureHeadline;
      if (featureSubtext !== undefined) product.featureSubtext = featureSubtext;
      if (notes !== undefined) product.notes = notes;
      if (metaTitle !== undefined) product.metaTitle = metaTitle;
      if (metaDescription !== undefined) product.metaDescription = metaDescription;
      if (variants !== undefined) {
        const normalizedVariants = normalizeVariants(variants);
        const variantError = validateVariants(normalizedVariants);
        if (variantError) {
          return res.status(400).json({ message: variantError });
        }
        product.variants = normalizedVariants;
        if (normalizedVariants.length > 0) {
          product.price = Math.min(...normalizedVariants.map((v) => v.price));
          product.stock = normalizedVariants.reduce((sum, v) => sum + v.stock, 0);
          if (!product.sku) {
            product.sku = normalizedVariants[0].sku;
          }
        }
      }

      const updatedProduct = await product.save();
      invalidateProductsCache();
      res.json(updatedProduct);
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (product) {
      await product.deleteOne();
      invalidateProductsCache();
      res.json({ message: 'Product removed' });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Bulk update product availability (isActive flag)
// @route   PUT /api/products/bulk/availability
// @access  Private/Admin
router.put('/bulk/availability', protect, admin, async (req, res) => {
  try {
    const { productIds, isActive } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'productIds array is required' });
    }

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive boolean is required' });
    }

    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      { $set: { isActive } }
    );

    invalidateProductsCache();

    res.json({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Bulk update product prices
// @route   PUT /api/products/bulk/price
// @access  Private/Admin
router.put('/bulk/price', protect, admin, async (req, res) => {
  try {
    const { productIds, mode, value } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'productIds array is required' });
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue === 0) {
      return res.status(400).json({ message: 'A non-zero numeric value is required' });
    }

    if (!['increasePercent', 'decreasePercent'].includes(mode)) {
      return res.status(400).json({ message: 'Invalid mode for bulk price update' });
    }

    const products = await Product.find({ _id: { $in: productIds } });

    for (const product of products) {
      if (typeof product.price !== 'number') continue;

      const factor = numericValue / 100;
      if (mode === 'increasePercent') {
        product.price = Math.round(product.price * (1 + factor));
      } else if (mode === 'decreasePercent') {
        product.price = Math.round(product.price * (1 - factor));
      }
    }

    const updatedProducts = await Promise.all(products.map((p) => p.save()));
    invalidateProductsCache();

    res.json({ updatedCount: updatedProducts.length });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Export products as CSV
// @route   GET /api/products/export
// @access  Private/Admin
router.get('/export', protect, admin, async (req, res) => {
  try {
    const products = await Product.find({}).sort({ createdAt: -1 });

    const header = [
      'Product ID',
      'Name',
      'Slug',
      'Price',
      'Original Price',
      'Stock',
      'Category',
      'Subcategory',
      'Brand',
      'SKU',
      'On Sale',
      'Featured',
      'Active',
    ];

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = products.map((product) => [
      product._id,
      product.name || '',
      product.slug || '',
      product.price != null ? product.price : '',
      product.originalPrice != null ? product.originalPrice : '',
      product.stock != null ? product.stock : '',
      product.category || '',
      product.subCategory || '',
      product.brand || '',
      product.sku || '',
      product.onSale ? 'Yes' : 'No',
      product.isFeatured ? 'Yes' : 'No',
      product.isActive ? 'Yes' : 'No',
    ]);

    const csvLines = [
      header.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ];

    const csvContent = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="products-export.csv"'
    );
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Fetch single product by ID
// @route   GET /api/products/id/:id
// @access  Public
router.get('/id/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      res.json(serializeProductForClient(product, req));
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Contact form submission
// @route   POST /api/products/contact  (mounted under /api/products)
// @access  Public
router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};

    if (!name || !email || !message) {
      return res
        .status(400)
        .json({ message: 'Name, email, and message are required.' });
    }

    const safeSubject = subject && subject.trim().length > 0
      ? subject.trim()
      : 'New contact message from CaseProz site';

    const html = `
      <h2>New contact message from CaseProz</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${safeSubject}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br />')}</p>
    `;

    const to = process.env.ADMIN_ORDER_EMAIL || process.env.SMTP_USER;

    await sendEmail({
      to,
      subject: safeSubject,
      text: `From: ${name} <${email}>\n\n${message}`,
      html,
    });

    res.json({ message: 'Message sent successfully.' });
  } catch (error) {
    console.error('Contact endpoint error:', error);
    res.status(500).json({ message: 'Failed to send message. Please try again.' });
  }
});

module.exports = router;

