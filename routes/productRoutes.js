const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const sendEmail = require('../utils/sendEmail');
const { protect, admin } = require('../middleware/authMiddleware');
const { logAuditEvent, buildActorFromReq } = require('../utils/auditLogger');

const invalidateProductsCache = () => {
  // No-op placeholder: keep call sites stable after removing list cache.
};

const LIST_SELECT_FIELDS =
  '_id name slug price originalPrice category subCategory images stock onSale isFeatured heroOrder isActive brand categories createdAt keyFeatures variants';
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 60;

const parseBooleanQuery = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return undefined;
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildKeywordRegex = (value = '') => {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!normalized) return null;

  const tokens = normalized.split(/\s+/).filter(Boolean).map(escapeRegex);
  if (tokens.length === 0) return null;

  const separatorPattern = '[-\\s_./]*';
  return new RegExp(tokens.join(separatorPattern), 'i');
};

const normalizeSlug = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildSeoDefaults = ({ name, brand, keyFeatures, category }) => {
  const titleParts = [];
  const trimmedName = String(name || '').trim();
  const trimmedBrand = String(brand || '').trim();
  const firstFeature = Array.isArray(keyFeatures) ? String(keyFeatures[0] || '').trim() : '';

  if (trimmedBrand) titleParts.push(trimmedBrand);
  if (trimmedName) titleParts.push(trimmedName);
  if (!trimmedBrand && firstFeature) titleParts.push(firstFeature);

  return {
    metaTitle: titleParts.length > 0 ? `${titleParts.join(' ')} | CaseProz Kenya` : 'CaseProz Kenya',
    metaDescription: trimmedName
      ? `Buy ${trimmedName} online at CaseProz Kenya. ${trimmedBrand ? `Shop genuine ${trimmedBrand} products. ` : ''}${category ? `Explore our ${String(category).trim()} collection. ` : ''}Fast delivery across Kenya.`
      : 'Shop quality tech products and accessories at CaseProz Kenya with fast delivery across Kenya.',
  };
};

const buildCategorySlugFilter = (targetSlugRaw) => {
  const targetSlug = normalizeSlug(targetSlugRaw);
  if (!targetSlug) return null;

  const spaceLabel = targetSlug.replace(/-/g, ' ');
  const escapedSlug = targetSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSpaceLabel = spaceLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const defaultFilter = {
    $or: [
      { category: { $regex: `^${escapedSlug}$`, $options: 'i' } },
      { subCategory: { $regex: `^${escapedSlug}$`, $options: 'i' } },
      { category: { $regex: `^${escapedSpaceLabel}$`, $options: 'i' } },
      { subCategory: { $regex: `^${escapedSpaceLabel}$`, $options: 'i' } },
      { category: { $regex: escapedSlug, $options: 'i' } },
      { subCategory: { $regex: escapedSlug, $options: 'i' } },
    ],
  };

  if (targetSlug === 'smart-watches') {
    return {
      $or: [
        { category: { $regex: '^wearables$', $options: 'i' } },
        { subCategory: { $regex: 'watch', $options: 'i' } },
      ],
    };
  }

  if (targetSlug === 'cables') {
    return {
      $and: [
        { category: { $regex: '^accessories$', $options: 'i' } },
        { subCategory: { $regex: 'cables\\s*&\\s*adapters|cables-adapters', $options: 'i' } },
      ],
    };
  }

  if (targetSlug === 'cases') {
    return {
      $and: [
        { category: { $regex: '^accessories$', $options: 'i' } },
        { subCategory: { $regex: 'cases\\s*&\\s*covers|cases-covers', $options: 'i' } },
      ],
    };
  }

  if (targetSlug === 'chargers') {
    return {
      $and: [
        { category: { $regex: '^accessories$', $options: 'i' } },
        { subCategory: { $regex: 'power|power\\s*banks|power-banks', $options: 'i' } },
      ],
    };
  }

  if (targetSlug === 'screen-protectors') {
    return {
      $or: [
        {
          $and: [
            { category: { $regex: '^accessories$', $options: 'i' } },
            { subCategory: { $regex: 'cases\\s*&\\s*covers|cases-covers', $options: 'i' } },
          ],
        },
        {
          $and: [
            { category: { $regex: '^phones\\s*&\\s*tablets$|^phones-tablets$', $options: 'i' } },
            { subCategory: { $regex: 'phone\\s*accessories|phone-accessories', $options: 'i' } },
          ],
        },
      ],
    };
  }

  if (targetSlug === 'earphones') {
    return {
      $and: [
        { category: { $regex: '^audio\\s*&\\s*headphones$|^audio-headphones$', $options: 'i' } },
        {
          $or: [
            { subCategory: { $regex: 'earbuds\\s*&\\s*in\\s*ear|earbuds-in-ear', $options: 'i' } },
            { subCategory: { $regex: 'over\\s*ear\\s*headphones|over-ear-headphones', $options: 'i' } },
            { subCategory: { $regex: 'headphones', $options: 'i' } },
            { subCategory: { $regex: 'earbuds', $options: 'i' } },
          ],
        },
      ],
    };
  }

  return defaultFilter;
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
    const keywordRegex = buildKeywordRegex(req.query.keyword);

    const keywordFilter = keywordRegex
      ? {
          $or: [
            {
              name: {
                $regex: keywordRegex,
              },
            },
            {
              description: {
                $regex: keywordRegex,
              },
            },
            {
              category: {
                $regex: keywordRegex,
              },
            },
            {
              subCategory: {
                $regex: keywordRegex,
              },
            },
          ],
        }
      : {};

    const category = req.query.category;
    const subCategory = req.query.subCategory;
    const categorySlug = req.query.categorySlug;
    const brand = req.query.brand;
    const variantGroup = req.query.variantGroup;
    const isFeatured = parseBooleanQuery(req.query.isFeatured);
    const onSale = parseBooleanQuery(req.query.onSale);
    const isActive = parseBooleanQuery(req.query.isActive);
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;

    const rawPage = Number(req.query.page);
    const rawPageSize = Number(req.query.pageSize);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const normalizedPageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.floor(rawPageSize)
      : DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(normalizedPageSize, MAX_PAGE_SIZE);

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
    } else if (sort === 'hero') {
      sortOption = { heroOrder: 1, createdAt: -1 };
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

    if (categorySlug) {
      const slugFilter = buildCategorySlugFilter(categorySlug);
      if (slugFilter) {
        baseQuery = Object.keys(baseQuery).length
          ? { $and: [baseQuery, slugFilter] }
          : slugFilter;
      }
    }

    if (variantGroup) {
      baseQuery = { ...baseQuery, variantGroup };
    }

    if (isFeatured !== undefined) {
      baseQuery = { ...baseQuery, isFeatured };
    }

    if (onSale !== undefined) {
      baseQuery = { ...baseQuery, onSale };
    }

    if (isActive !== undefined) {
      baseQuery = { ...baseQuery, isActive };
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
        brand: { $regex: escapeRegex(String(brand).trim()), $options: 'i' },
      };

      query = Object.keys(baseQuery).length
        ? { $and: [baseQuery, brandFilter] }
        : brandFilter;
    }

    const count = await Product.countDocuments(query);
    const products = await Product.find(query)
      .select(LIST_SELECT_FIELDS)
      .sort(sortOption)
      .limit(pageSize)
      .skip(pageSize * (page - 1))
      .lean();

    res.json({
      products: products.map((p) => serializeProductForClient(p, req)),
      page,
      pages: Math.ceil(count / pageSize),
      total: count,
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
      heroOrder,
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

    const seoDefaults = buildSeoDefaults({ name, brand, keyFeatures, category });

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
      heroOrder,
      onSale,
      isActive,
      keyFeatures,
      sku,
      brand,
      categories,
      featureHeadline,
      featureSubtext,
      notes,
      metaTitle: String(metaTitle || '').trim() || seoDefaults.metaTitle,
      metaDescription: String(metaDescription || '').trim() || seoDefaults.metaDescription,
      variants,
    });

    const product = new Product(payload);

    const createdProduct = await product.save();
    invalidateProductsCache();

    await logAuditEvent({
      req,
      actor: buildActorFromReq(req),
      action: 'product_created',
      entityType: 'product',
      entityId: createdProduct._id,
      details: {
        name: createdProduct.name,
        price: createdProduct.price,
        stock: createdProduct.stock,
        isActive: createdProduct.isActive,
      },
    });

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
      heroOrder,
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
      if (heroOrder !== undefined) product.heroOrder = heroOrder;
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

      await logAuditEvent({
        req,
        actor: buildActorFromReq(req),
        action: 'product_updated',
        entityType: 'product',
        entityId: updatedProduct._id,
        details: {
          name: updatedProduct.name,
          price: updatedProduct.price,
          stock: updatedProduct.stock,
          isActive: updatedProduct.isActive,
          onSale: updatedProduct.onSale,
        },
      });

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
      await product.softDelete(req.user?._id);
      invalidateProductsCache();

      await logAuditEvent({
        req,
        actor: buildActorFromReq(req),
        action: 'product_archived',
        entityType: 'product',
        entityId: product._id,
        details: { name: product.name },
      });

      res.json({ message: 'Product archived' });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    List archived products
// @route   GET /api/products/archived
// @access  Private/Admin
router.get('/archived/list', protect, admin, async (req, res) => {
  try {
    const archivedProducts = await Product.find({ deletedAt: { $ne: null } })
      .setOptions({ includeDeleted: true })
      .select(LIST_SELECT_FIELDS)
      .sort({ deletedAt: -1 })
      .lean();

    res.json({ products: archivedProducts.map((p) => serializeProductForClient(p, req)) });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load archived products' });
  }
});

// @desc    Restore an archived product
// @route   PUT /api/products/:id/restore
// @access  Private/Admin
router.put('/:id/restore', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).setOptions({ includeDeleted: true });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!product.deletedAt) {
      return res.status(400).json({ message: 'Product is not archived' });
    }

    await product.restore();
    invalidateProductsCache();

    await logAuditEvent({
      req,
      actor: buildActorFromReq(req),
      action: 'product_restored',
      entityType: 'product',
      entityId: product._id,
      details: { name: product.name },
    });

    res.json({ message: 'Product restored' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to restore product' });
  }
});

// @desc    Permanently delete a product
// @route   DELETE /api/products/:id/purge
// @access  Private/Admin
router.delete('/:id/purge', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).setOptions({ includeDeleted: true });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await Product.deleteOne({ _id: product._id });
    invalidateProductsCache();

    await logAuditEvent({
      req,
      actor: buildActorFromReq(req),
      action: 'product_purged',
      entityType: 'product',
      entityId: product._id,
      details: { name: product.name },
    });

    res.json({ message: 'Product permanently deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to permanently delete product' });
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

    await logAuditEvent({
      req,
      actor: buildActorFromReq(req),
      action: 'products_bulk_availability_updated',
      entityType: 'product',
      details: {
        productIds,
        isActive,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
    });

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

    await logAuditEvent({
      req,
      actor: buildActorFromReq(req),
      action: 'products_bulk_price_updated',
      entityType: 'product',
      details: {
        productIds,
        mode,
        value: numericValue,
        updatedCount: updatedProducts.length,
      },
    });

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

