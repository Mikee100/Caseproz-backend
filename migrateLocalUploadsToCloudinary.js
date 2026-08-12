require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const Product = require('./models/Product');

const cloudinaryCloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const cloudinaryApiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
const cloudinaryApiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'ecommerce_products').trim();

if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
  console.error('Missing CLOUDINARY_* env vars. Aborting migration.');
  process.exit(1);
}

cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinaryApiSecret,
});

const repoUploadsRoot = path.join(__dirname, 'uploads');

const isLocalUploadPath = (value) =>
  typeof value === 'string' && value.startsWith('/uploads/');

const toLocalFilePath = (uploadPath) => {
  const normalized = String(uploadPath || '').replace(/^\//, '');
  return path.join(__dirname, normalized);
};

const ensureCloudinaryUrl = async (uploadPath, cache, stats) => {
  if (!isLocalUploadPath(uploadPath)) return uploadPath;
  if (cache.has(uploadPath)) return cache.get(uploadPath);

  const localPath = toLocalFilePath(uploadPath);
  if (!localPath.startsWith(repoUploadsRoot)) {
    stats.skippedUnsafe += 1;
    cache.set(uploadPath, uploadPath);
    return uploadPath;
  }

  if (!fs.existsSync(localPath)) {
    stats.missingLocalFiles += 1;
    cache.set(uploadPath, uploadPath);
    return uploadPath;
  }

  try {
    const result = await cloudinary.uploader.upload(localPath, {
      folder: cloudinaryFolder,
      resource_type: 'image',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    const secureUrl = String(result.secure_url || '').trim();
    if (!secureUrl) {
      stats.failedUploads += 1;
      cache.set(uploadPath, uploadPath);
      return uploadPath;
    }

    stats.uploaded += 1;
    cache.set(uploadPath, secureUrl);
    return secureUrl;
  } catch (error) {
    stats.failedUploads += 1;
    console.warn('Cloudinary upload failed for', uploadPath, error.message);
    cache.set(uploadPath, uploadPath);
    return uploadPath;
  }
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({
    $or: [
      { images: { $elemMatch: { $regex: '^/uploads/' } } },
      { 'variants.image': { $regex: '^/uploads/' } },
    ],
  });

  if (products.length === 0) {
    console.log('No products with local /uploads references found.');
    await mongoose.connection.close();
    return;
  }

  const cache = new Map();
  const stats = {
    productsScanned: products.length,
    productsUpdated: 0,
    uploaded: 0,
    failedUploads: 0,
    missingLocalFiles: 0,
    skippedUnsafe: 0,
  };

  for (const product of products) {
    let changed = false;

    if (Array.isArray(product.images) && product.images.length > 0) {
      const nextImages = [];
      for (const img of product.images) {
        const migrated = await ensureCloudinaryUrl(img, cache, stats);
        nextImages.push(migrated);
        if (migrated !== img) changed = true;
      }
      product.images = nextImages;
    }

    if (Array.isArray(product.variants) && product.variants.length > 0) {
      const nextVariants = [];
      for (const variant of product.variants) {
        const nextVariant = { ...variant.toObject() };
        if (isLocalUploadPath(nextVariant.image)) {
          const migrated = await ensureCloudinaryUrl(nextVariant.image, cache, stats);
          if (migrated !== nextVariant.image) {
            nextVariant.image = migrated;
            changed = true;
          }
        }
        nextVariants.push(nextVariant);
      }
      product.variants = nextVariants;
    }

    if (changed) {
      await product.save();
      stats.productsUpdated += 1;
      console.log(`Updated product: ${product.slug}`);
    }
  }

  console.log('\nMigration summary:');
  console.log('products scanned:', stats.productsScanned);
  console.log('products updated:', stats.productsUpdated);
  console.log('unique local files uploaded:', stats.uploaded);
  console.log('failed uploads:', stats.failedUploads);
  console.log('missing local files:', stats.missingLocalFiles);
  console.log('skipped unsafe paths:', stats.skippedUnsafe);

  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error('Migration failed:', error);
  await mongoose.connection.close();
  process.exit(1);
});
