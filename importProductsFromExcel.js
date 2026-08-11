const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Product = require('./models/Product');

dotenv.config();

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MANUAL_IMAGE_OVERRIDES = {
  'soundcore-boom-2se': ['soundcore image.webp'],
  'iphone-phone-cases': ['caseproz.jpg', 'caseproz.png'],
  'soundcore-select-go4': ['Anker-Soundcore-P25i-07.jpg'],
  'anker-car-charger-75w': ['download.webp'],
};
const COMMON_TOKENS = new Set([
  'the',
  'and',
  'with',
  'for',
  'usb',
  'type',
  'series',
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitImageTokens(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v || '').trim())
      .filter(Boolean);
  }
  return String(value)
    .split(/[;,|]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !COMMON_TOKENS.has(t));
}

function findBestKey(keys, aliases) {
  const normalizedKeys = keys.map((k) => ({ raw: k, normalized: normalizeText(k) }));
  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    const hit = normalizedKeys.find((entry) => entry.normalized === normalizedAlias);
    if (hit) return hit.raw;
  }
  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    const partial = normalizedKeys.find((entry) => entry.normalized.includes(normalizedAlias));
    if (partial) return partial.raw;
  }
  return null;
}

function detectColumns(sampleRow) {
  const keys = Object.keys(sampleRow || {});
  const map = {
    name: ['name', 'product name', 'product', 'item', 'item name', 'title'],
    sku: ['sku', 'product code', 'code', 'item code'],
    slug: ['slug', 'handle', 'url slug'],
    description: ['description', 'details', 'product description'],
    price: ['price', 'sale price', 'selling price', 'current price', 'amount'],
    originalPrice: ['original price', 'old price', 'compare price', 'mrp'],
    category: ['category', 'main category'],
    subCategory: ['sub category', 'subcategory', 'sub-category'],
    stock: ['stock', 'qty', 'quantity', 'units', 'inventory'],
    brand: ['brand', 'manufacturer'],
    images: ['image', 'images', 'image names', 'image files', 'photo', 'photos'],
  };

  return Object.fromEntries(
    Object.entries(map).map(([field, aliases]) => [field, findBestKey(keys, aliases)])
  );
}

function indexImages(imagesDir) {
  const namesByNormalized = new Map();
  const imageRecords = [];
  const namesByRawLower = new Map();
  const files = fs.readdirSync(imagesDir, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) continue;
    const ext = path.extname(file.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    const fullPath = path.join(imagesDir, file.name);
    namesByRawLower.set(file.name.toLowerCase(), fullPath);
    const base = path.basename(file.name, ext);
    const normalized = normalizeText(base);
    if (!normalized) continue;
    const tokens = tokenize(base);
    imageRecords.push({ fullPath, normalized, tokens });
    if (!namesByNormalized.has(normalized)) {
      namesByNormalized.set(normalized, []);
    }
    namesByNormalized.get(normalized).push(fullPath);
  }
  return { namesByNormalized, imageRecords, namesByRawLower };
}

function scoreFuzzyMatch(name, imageRecord) {
  const nameTokens = tokenize(name);
  if (nameTokens.length === 0 || imageRecord.tokens.length === 0) return 0;

  const imageTokenSet = new Set(imageRecord.tokens);
  let overlap = 0;
  let hasDistinctive = false;

  for (const token of nameTokens) {
    if (imageTokenSet.has(token)) {
      overlap += 1;
      if (/\d/.test(token) || token.length >= 5) {
        hasDistinctive = true;
      }
    }
  }

  if (overlap === 0) return 0;

  const normalizedName = normalizeText(name);
  const containsWhole =
    imageRecord.normalized.includes(normalizedName) || normalizedName.includes(imageRecord.normalized);
  const baseScore = overlap / nameTokens.length;

  if (!hasDistinctive && overlap < 2 && !containsWhole) {
    return 0;
  }

  return containsWhole ? baseScore + 0.35 : baseScore;
}

function getTopImageSuggestions(name, imageRecords, limit = 5) {
  return imageRecords
    .map((record) => ({
      fullPath: record.fullPath,
      score: scoreFuzzyMatch(name, record),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => path.basename(entry.fullPath));
}

function resolveImageCandidates({
  row,
  columns,
  sku,
  slug,
  name,
  imageIndex,
  usedImages,
  uniqueImages,
  maxImagesPerProduct = 6,
}) {
  const manualFiles = MANUAL_IMAGE_OVERRIDES[slug] || [];
  if (manualFiles.length > 0) {
    const manualResolved = manualFiles
      .map((fileName) => imageIndex.namesByRawLower.get(String(fileName).toLowerCase()))
      .filter(Boolean);

    if (manualResolved.length > 0) {
      return manualResolved;
    }
  }

  const explicitTokens = splitImageTokens(columns.images ? row[columns.images] : undefined);
  const candidateKeys = [];

  if (explicitTokens.length > 0) {
    for (const token of explicitTokens) {
      const ext = path.extname(token).toLowerCase();
      const key = normalizeText(path.basename(token, ext || undefined));
      if (key) candidateKeys.push(key);
    }
  }

  if (candidateKeys.length === 0) {
    if (sku) candidateKeys.push(normalizeText(sku));
    if (slug) candidateKeys.push(normalizeText(slug));
    if (name) candidateKeys.push(normalizeText(name));
  }

  const resolved = [];
  const used = new Set();
  for (const key of candidateKeys) {
    const hits = imageIndex.namesByNormalized.get(key) || [];
    for (const hit of hits) {
      if (used.has(hit)) continue;
      if (uniqueImages && usedImages.has(hit)) continue;
      used.add(hit);
      resolved.push(hit);
    }
  }

  // If no exact match found, use fuzzy token overlap to map product names to image names.
  if (resolved.length === 0 && name) {
    const scored = imageIndex.imageRecords
      .filter((record) => !(uniqueImages && usedImages.has(record.fullPath)))
      .map((record) => ({
        path: record.fullPath,
        score: scoreFuzzyMatch(name, record),
      }))
      .filter((item) => item.score >= 0.4)
      .sort((a, b) => b.score - a.score);

    for (const item of scored) {
      if (resolved.length >= maxImagesPerProduct) break;
      if (used.has(item.path)) continue;
      used.add(item.path);
      resolved.push(item.path);
    }
  }

  return resolved;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyImagesToUploads(imagePaths, uploadsDir, slug) {
  ensureDir(uploadsDir);
  const copiedUrls = [];
  imagePaths.forEach((sourcePath, index) => {
    const ext = path.extname(sourcePath).toLowerCase() || '.jpg';
    const baseName = `${slug || 'product'}-${index + 1}${ext}`;
    let targetName = baseName;
    let counter = 1;
    while (fs.existsSync(path.join(uploadsDir, targetName))) {
      targetName = `${slug || 'product'}-${index + 1}-${counter}${ext}`;
      counter += 1;
    }

    const destinationPath = path.join(uploadsDir, targetName);
    fs.copyFileSync(sourcePath, destinationPath);
    copiedUrls.push(`/uploads/imported-products/${targetName}`);
  });

  return copiedUrls;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  const excelPath = args.excel ? path.resolve(args.excel) : null;
  const imagesPath = args.images ? path.resolve(args.images) : null;
  const sheetName = args.sheet ? String(args.sheet) : null;
  const mode = args.mode === 'insert' ? 'insert' : 'upsert';
  const dryRun = Boolean(args['dry-run']);
  const uniqueImages = Boolean(args['unique-images']);

  if (!excelPath || !imagesPath) {
    console.error(
      'Usage: node importProductsFromExcel.js --excel "C:/path/file.xlsx" --images "C:/path/images" [--sheet "Sheet1"] [--mode upsert|insert] [--dry-run]'
    );
    process.exit(1);
  }

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel file not found: ${excelPath}`);
  }

  if (!fs.existsSync(imagesPath)) {
    throw new Error(`Images folder not found: ${imagesPath}`);
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in your backend .env file.');
  }

  const workbook = XLSX.readFile(excelPath);
  const targetSheet = sheetName || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[targetSheet];

  if (!worksheet) {
    throw new Error(`Sheet "${targetSheet}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  if (rows.length === 0) {
    throw new Error('Excel sheet has no rows to import.');
  }

  const columns = detectColumns(rows[0]);
  if (!columns.name) {
    throw new Error('Could not detect product name column. Add a header like "name" or "product name".');
  }
  if (!columns.price) {
    throw new Error('Could not detect price column. Add a header like "price".');
  }

  const imageIndex = indexImages(imagesPath);
  const usedImages = new Set();
  const uploadTargetDir = path.join(__dirname, 'uploads', 'imported-products');

  await connectDB();

  const summary = {
    sheet: targetSheet,
    totalRows: rows.length,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    missingImages: 0,
    rowIssues: [],
    unmatchedRows: [],
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2;
    const rawName = String(row[columns.name] || '').trim();

    if (!rawName) {
      summary.skipped += 1;
      summary.rowIssues.push({ row: rowNumber, issue: 'Missing name' });
      continue;
    }

    const rawSlug = columns.slug ? String(row[columns.slug] || '').trim() : '';
    const slug = rawSlug || slugify(rawName);
    const rawSku = columns.sku ? String(row[columns.sku] || '').trim() : '';

    const price = toNumber(row[columns.price]);
    if (price === undefined) {
      summary.skipped += 1;
      summary.rowIssues.push({ row: rowNumber, name: rawName, issue: 'Missing/invalid price' });
      continue;
    }

    const originalPrice = columns.originalPrice ? toNumber(row[columns.originalPrice]) : undefined;
    const stockValue = columns.stock ? toNumber(row[columns.stock]) : undefined;
    const description = columns.description
      ? String(row[columns.description] || '').trim() || `${rawName} description`
      : `${rawName} description`;
    const category = columns.category
      ? String(row[columns.category] || '').trim() || 'Uncategorized'
      : 'Uncategorized';
    const subCategory = columns.subCategory ? String(row[columns.subCategory] || '').trim() : '';
    const brand = columns.brand ? String(row[columns.brand] || '').trim() : '';

    const imageMatches = resolveImageCandidates({
      row,
      columns,
      sku: rawSku,
      slug,
      name: rawName,
      imageIndex,
      usedImages,
      uniqueImages,
    });

    let imageUrls = [];
    if (imageMatches.length > 0 && !dryRun) {
      imageUrls = copyImagesToUploads(imageMatches, uploadTargetDir, slug);
    } else if (imageMatches.length > 0) {
      imageUrls = imageMatches.map((imgPath, idx) => {
        const ext = path.extname(imgPath).toLowerCase() || '.jpg';
        return `/uploads/imported-products/${slug || 'product'}-${idx + 1}${ext}`;
      });
    }

    if (imageUrls.length === 0) {
      summary.missingImages += 1;
      summary.unmatchedRows.push({
        row: rowNumber,
        name: rawName,
        sku: rawSku || null,
        slug,
        suggestions: getTopImageSuggestions(rawName, imageIndex.imageRecords),
      });
    } else {
      imageMatches.forEach((p) => usedImages.add(p));
    }

    const payload = {
      name: rawName,
      slug,
      description,
      price,
      originalPrice,
      category,
      subCategory: subCategory || undefined,
      images: imageUrls,
      stock: Number.isFinite(stockValue) ? stockValue : 0,
      brand: brand || undefined,
      sku: rawSku || undefined,
    };

    if (dryRun) {
      summary.processed += 1;
      continue;
    }

    let existing = null;
    if (rawSku) {
      existing = await Product.findOne({ sku: rawSku });
    }
    if (!existing) {
      existing = await Product.findOne({ slug });
    }

    if (!existing && mode === 'insert') {
      await Product.create(payload);
      summary.created += 1;
      summary.processed += 1;
      continue;
    }

    if (!existing) {
      await Product.create(payload);
      summary.created += 1;
      summary.processed += 1;
      continue;
    }

    const mergedPayload = {
      ...payload,
      images: imageUrls.length > 0 ? imageUrls : existing.images,
    };

    await Product.updateOne({ _id: existing._id }, { $set: mergedPayload });
    summary.updated += 1;
    summary.processed += 1;
  }

  const reportDir = path.join(__dirname, 'tmp');
  ensureDir(reportDir);
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const reportPath = path.join(reportDir, `import-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('Import finished.');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report written to: ${reportPath}`);

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Import failed:', error.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
