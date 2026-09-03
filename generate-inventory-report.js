/**
 * CaseProz Database Inventory Report Generator
 * Phase 0 — Inventory Discovery
 * 
 * This script queries the MongoDB database and generates a comprehensive
 * inventory report for SEO planning purposes.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Import models
const Product = require('./models/Product');
const Category = require('./models/Category');
const Brand = require('./models/Brand');

const generateReport = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    console.log('='.repeat(80));
    console.log('CASEPROZ DATABASE INVENTORY REPORT');
    console.log('='.repeat(80));
    console.log(`Generated: ${new Date().toISOString()}\n`);

    // ===== SECTION 1: PRODUCT INVENTORY =====
    console.log('\n📊 SECTION 1: PRODUCT INVENTORY');
    console.log('-'.repeat(80));

    const totalProducts = await Product.countDocuments({});
    const activeProducts = await Product.countDocuments({ isActive: true });
    const inactiveProducts = await Product.countDocuments({ isActive: false });
    const deletedProducts = await Product.countDocuments({ deletedAt: { $ne: null } });

    console.log(`Total Products:       ${totalProducts}`);
    console.log(`Active Products:      ${activeProducts}`);
    console.log(`Inactive Products:    ${inactiveProducts}`);
    console.log(`Soft-deleted:         ${deletedProducts}\n`);

    // Product quality metrics
    const productsWithoutTitle = await Product.countDocuments({ metaTitle: { $in: [null, ''] } });
    const productsWithoutDescription = await Product.countDocuments({ metaDescription: { $in: [null, ''] } });
    const productsWithoutImages = await Product.countDocuments({ images: { $size: 0 } });
    const productsWithoutBrand = await Product.countDocuments({ brand: { $in: [null, ''] } });
    const productsWithoutCategory = await Product.countDocuments({ category: { $in: [null, ''] } });
    const productsWithoutDescription_content = await Product.countDocuments({ description: { $in: [null, ''] } });

    console.log('📋 Product Quality Metrics:');
    console.log(`  Missing metaTitle:      ${productsWithoutTitle}`);
    console.log(`  Missing metaDescription: ${productsWithoutDescription}`);
    console.log(`  Missing images:         ${productsWithoutImages}`);
    console.log(`  Missing brand:          ${productsWithoutBrand}`);
    console.log(`  Missing category:       ${productsWithoutCategory}`);
    console.log(`  Missing description:    ${productsWithoutDescription_content}\n`);

    // Thin descriptions (< 50 characters)
    const thinDescriptions = await Product.countDocuments({
      description: { $exists: true, $regex: /^.{1,50}$/ }
    });
    console.log(`  Thin descriptions (<50 chars): ${thinDescriptions}\n`);

    // ===== SECTION 2: BRAND INVENTORY =====
    console.log('\n🏢 SECTION 2: BRAND INVENTORY');
    console.log('-'.repeat(80));

    const allBrands = await Brand.find({}, { name: 1 }).lean();
    console.log(`Total Brands: ${allBrands.length}\n`);

    console.log('Brands with Product Count:');
    console.log('Brand Name'.padEnd(30) + 'Product Count'.padEnd(15) + 'Priority');
    console.log('-'.repeat(80));

    const brandStats = [];
    for (const brand of allBrands) {
      const count = await Product.countDocuments({ brand: brand.name, isActive: true });
      if (count > 0) {
        brandStats.push({ name: brand.name, count });
      }
    }

    // Sort by count descending
    brandStats.sort((a, b) => b.count - a.count);

    for (const stat of brandStats) {
      const priority = stat.count >= 10 ? 'P0 - High' : stat.count >= 5 ? 'P1 - Medium' : 'P2 - Low';
      console.log(
        stat.name.padEnd(30) +
        String(stat.count).padEnd(15) +
        priority
      );
    }

    // Brands with no products
    const brandsWithNoProducts = allBrands.filter(
      b => !brandStats.find(s => s.name === b.name)
    );
    console.log(`\nBrands with no active products: ${brandsWithNoProducts.length}`);

    // ===== SECTION 3: CATEGORY INVENTORY =====
    console.log('\n\n📁 SECTION 3: CATEGORY INVENTORY');
    console.log('-'.repeat(80));

    const allCategories = await Category.find({}).lean();
    console.log(`Total Categories: ${allCategories.length}\n`);

    console.log('Categories with Product Count:');
    console.log('Category Name'.padEnd(40) + 'Product Count'.padEnd(15) + 'Sub-Categories');
    console.log('-'.repeat(80));

    const categoryStats = [];
    for (const category of allCategories) {
      const count = await Product.countDocuments({ category: category.name, isActive: true });
      const subCount = category.subCategories ? category.subCategories.length : 0;
      categoryStats.push({ name: category.name, count, subCount });
    }

    categoryStats.sort((a, b) => b.count - a.count);

    for (const stat of categoryStats) {
      console.log(
        stat.name.padEnd(40) +
        String(stat.count).padEnd(15) +
        String(stat.subCount)
      );
    }

    // ===== SECTION 4: SUBCATEGORY INVENTORY =====
    console.log('\n\n📂 SECTION 4: SUBCATEGORY INVENTORY');
    console.log('-'.repeat(80));

    const subCategoryStats = {};
    for (const category of allCategories) {
      if (category.subCategories && Array.isArray(category.subCategories)) {
        for (const subCat of category.subCategories) {
          const subName = subCat.name || subCat;
          const count = await Product.countDocuments({
            category: category.name,
            subCategory: subName,
            isActive: true
          });
          if (count > 0) {
            subCategoryStats[`${category.name} > ${subName}`] = count;
          }
        }
      }
    }

    const sortedSubs = Object.entries(subCategoryStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    console.log('Subcategory'.padEnd(50) + 'Product Count');
    console.log('-'.repeat(80));
    for (const stat of sortedSubs) {
      console.log(stat.name.padEnd(50) + String(stat.count));
    }

    // ===== SECTION 5: SEO ANALYSIS =====
    console.log('\n\n🔍 SECTION 5: SEO READINESS ANALYSIS');
    console.log('-'.repeat(80));

    const featuredProducts = await Product.countDocuments({ isFeatured: true, isActive: true });
    const onSaleProducts = await Product.countDocuments({ onSale: true, isActive: true });
    const productsWithVariants = await Product.countDocuments({ variants: { $exists: true, $ne: [] }, isActive: true });

    console.log(`Featured Products:     ${featuredProducts}`);
    console.log(`On Sale Products:      ${onSaleProducts}`);
    console.log(`Products with Variants: ${productsWithVariants}\n`);

    // Check for duplicate slugs
    const duplicateSlugs = await Product.aggregate([
      { $group: { _id: '$slug', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]);

    console.log(`Duplicate Slugs:       ${duplicateSlugs.length}`);
    if (duplicateSlugs.length > 0) {
      console.log('  Examples:');
      for (const dup of duplicateSlugs.slice(0, 5)) {
        console.log(`    - ${dup._id} (${dup.count} instances)`);
      }
    }
    console.log();

    // ===== SECTION 6: TOP KEYWORDS IN DATA =====
    console.log('\n🔑 SECTION 6: DATA INSIGHTS (Keywords/Brands/Categories)');
    console.log('-'.repeat(80));

    // Top brands
    console.log('\nTop 10 Brands by Product Count:');
    for (let i = 0; i < Math.min(10, brandStats.length); i++) {
      const stat = brandStats[i];
      console.log(`  ${i + 1}. ${stat.name}: ${stat.count} products`);
    }

    // Top categories
    console.log('\nTop 10 Categories by Product Count:');
    for (let i = 0; i < Math.min(10, categoryStats.length); i++) {
      const stat = categoryStats[i];
      console.log(`  ${i + 1}. ${stat.name}: ${stat.count} products`);
    }

    // ===== SECTION 7: ACTIONABILITY =====
    console.log('\n\n✅ SECTION 7: ACTIONABILITY');
    console.log('-'.repeat(80));

    console.log('\nHigh-Priority Brands (10+ products):');
    const highPriorityBrands = brandStats.filter(s => s.count >= 10);
    if (highPriorityBrands.length === 0) {
      console.log('  NONE - No brand has 10+ products');
    } else {
      for (const brand of highPriorityBrands) {
        console.log(`  - ${brand.name}: ${brand.count} products → Create dedicated brand page`);
      }
    }

    console.log('\nMedium-Priority Brands (5-9 products):');
    const mediumPriorityBrands = brandStats.filter(s => s.count >= 5 && s.count < 10);
    if (mediumPriorityBrands.length === 0) {
      console.log('  NONE');
    } else {
      for (const brand of mediumPriorityBrands) {
        console.log(`  - ${brand.name}: ${brand.count} products`);
      }
    }

    console.log('\nEmpty Categories (0 products):');
    const emptyCategories = categoryStats.filter(s => s.count === 0);
    if (emptyCategories.length === 0) {
      console.log('  NONE - All categories have products');
    } else {
      for (const cat of emptyCategories.slice(0, 10)) {
        console.log(`  - ${cat.name}`);
      }
    }

    // ===== SECTION 8: CRITICAL FINDINGS =====
    console.log('\n\n⚠️  SECTION 8: CRITICAL FINDINGS');
    console.log('-'.repeat(80));

    const findings = [];

    if (productsWithoutTitle > 0) {
      findings.push(`${productsWithoutTitle} products missing SEO title (metaTitle) — MUST populate before launch`);
    }
    if (productsWithoutDescription > 0) {
      findings.push(`${productsWithoutDescription} products missing SEO description (metaDescription) — MUST populate before launch`);
    }
    if (productsWithoutImages > 0) {
      findings.push(`${productsWithoutImages} products have no images — Review before indexing`);
    }
    if (thinDescriptions > 0) {
      findings.push(`${thinDescriptions} products have very thin descriptions (<50 chars) — May need expansion`);
    }
    if (duplicateSlugs.length > 0) {
      findings.push(`${duplicateSlugs.length} duplicate slugs found — Will cause canonical/indexing issues`);
    }
    if (brandStats.length === 0) {
      findings.push('No brands with products — Brand-based navigation not yet feasible');
    }
    if (highPriorityBrands.length === 0) {
      findings.push('No brand has 10+ products — May need to adjust brand page strategy');
    }

    if (findings.length === 0) {
      console.log('✓ No critical findings');
    } else {
      for (let i = 0; i < findings.length; i++) {
        console.log(`${i + 1}. ${findings[i]}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('END OF REPORT');
    console.log('='.repeat(80) + '\n');

    // Prepare JSON output for programmatic use
    const reportData = {
      generatedAt: new Date().toISOString(),
      products: {
        total: totalProducts,
        active: activeProducts,
        inactive: inactiveProducts,
        deleted: deletedProducts,
        missingMetaTitle: productsWithoutTitle,
        missingMetaDescription: productsWithoutDescription,
        missingImages: productsWithoutImages,
        missingBrand: productsWithoutBrand,
        missingCategory: productsWithoutCategory,
        thinDescriptions,
      },
      brands: {
        total: allBrands.length,
        withProducts: brandStats.length,
        topBrands: brandStats.slice(0, 20),
      },
      categories: {
        total: allCategories.length,
        all: categoryStats,
      },
      findings: findings,
    };

    console.log('\n✓ Report generation complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error generating report:', error);
    process.exit(1);
  }
};

generateReport();
