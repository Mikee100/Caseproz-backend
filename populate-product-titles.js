/**
 * CaseProz — Populate Product SEO Titles (metaTitle)
 * Phase 1 — Technical Foundation
 * 
 * This script generates and populates metaTitle for all products
 * that are missing SEO titles.
 * 
 * Format: [Brand] [Product Name] [Key Feature if applicable] | CaseProz Kenya
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Product = require('./models/Product');

// Helper function to generate SEO title
const generateSeoTitle = (product) => {
  const parts = [];

  // Add brand if available
  if (product.brand && product.brand.trim()) {
    parts.push(product.brand.trim());
  }

  // Add product name
  if (product.name && product.name.trim()) {
    parts.push(product.name.trim());
  }

  // If no brand and name is short, try to extract key feature
  if (!product.brand && product.keyFeatures && product.keyFeatures.length > 0) {
    const keyFeature = product.keyFeatures[0];
    if (keyFeature && keyFeature.trim()) {
      parts.push(keyFeature.trim());
    }
  }

  // Join with space and add suffix
  if (parts.length === 0) {
    return 'CaseProz Kenya';
  }

  return `${parts.join(' ')} | CaseProz Kenya`;
};

const populateMetaTitles = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    console.log('='.repeat(80));
    console.log('POPULATING PRODUCT SEO TITLES (metaTitle)');
    console.log('='.repeat(80) + '\n');

    // Find all products without metaTitle
    const productsWithoutTitle = await Product.find({
      $or: [
        { metaTitle: null },
        { metaTitle: { $exists: false } },
        { metaTitle: '' }
      ]
    });

    console.log(`Found ${productsWithoutTitle.length} products without metaTitle\n`);

    if (productsWithoutTitle.length === 0) {
      console.log('✓ All products already have metaTitles!');
      process.exit(0);
    }

    let successCount = 0;
    let failureCount = 0;

    console.log('Generating and updating metaTitles:\n');
    console.log('Product Name'.padEnd(40) + 'New metaTitle'.padEnd(50));
    console.log('-'.repeat(120));

    for (const product of productsWithoutTitle) {
      try {
        const newTitle = generateSeoTitle(product);

        // Update the product
        product.metaTitle = newTitle;
        await product.save();

        console.log(
          product.name.substring(0, 38).padEnd(40) +
          newTitle.substring(0, 48).padEnd(50)
        );

        successCount++;
      } catch (error) {
        console.error(`❌ Error updating product ${product._id}: ${error.message}`);
        failureCount++;
      }
    }

    console.log('\n' + '-'.repeat(120));
    console.log(`\n✅ Update Complete:`);
    console.log(`   Successfully updated: ${successCount}`);
    console.log(`   Failed updates: ${failureCount}\n`);

    // Verify
    const remaining = await Product.countDocuments({
      $or: [
        { metaTitle: null },
        { metaTitle: { $exists: false } },
        { metaTitle: '' }
      ]
    });

    console.log(`Verification: ${remaining} products still missing metaTitle`);

    if (remaining === 0) {
      console.log('✓ All products now have metaTitles!\n');
    }

    console.log('='.repeat(80));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

populateMetaTitles();
