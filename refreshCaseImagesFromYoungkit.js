const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Product = require('./models/Product');

dotenv.config();

const SILICONE_IMAGES = [
  'https://youngkit.com/cdn/shop/files/1_13d2eed5-bb01-424f-88c1-f1ed200dcdcc.jpg?v=1757494475&width=1000',
  'https://youngkit.com/cdn/shop/files/1_9a55b397-f3bc-41f6-bb39-e378ecfbfb24.jpg?v=1757496347&width=1000',
  'https://youngkit.com/cdn/shop/files/1_0cf60f7e-a610-4157-814c-eb4ffe1b6b57.jpg?v=1757496347&width=1000',
  'https://youngkit.com/cdn/shop/files/1_5a2f81c6-5abe-4425-9cb0-9c686ef78b46.jpg?v=1784019896&width=1000',
  'https://youngkit.com/cdn/shop/files/1-_-2_1b5cceb0-0c07-4bc1-9f90-b0a7e579eb85.jpg?v=1778492172&width=1000',
  'https://youngkit.com/cdn/shop/files/1_9d32b023-6be7-4132-916d-896ce4cc19b8.jpg?v=1778492181&width=1000',
  'https://youngkit.com/cdn/shop/files/1_185270af-2ae2-4ebf-a5d5-64eec8e25c16.jpg?v=1776319352&width=1000',
  'https://youngkit.com/cdn/shop/files/1_1f5dd286-2a2d-40c5-9462-be7c4de3d6bb.jpg?v=1757757381&width=1000',
  'https://youngkit.com/cdn/shop/files/1_68360574-afe5-4b62-b766-6c8691cae97e.jpg?v=1786349094&width=1000',
  'https://youngkit.com/cdn/shop/files/1_ae65f7c2-ab91-4440-8748-73611d4d7530.jpg?v=1778220773&width=1000',
];

const CLEAR_MAGSAFE_IMAGES = [
  'https://youngkit.com/cdn/shop/files/1_f789d433-5dd0-465c-9d72-341d6c409d2e.jpg?v=1782291631&width=1000',
  'https://youngkit.com/cdn/shop/files/1_925ef8d3-b4dc-44e4-9232-83e001756435.jpg?v=1759129449&width=1000',
  'https://youngkit.com/cdn/shop/files/1_3fcba338-3b57-4e15-afdc-22009e287879.jpg?v=1766479145&width=1000',
  'https://youngkit.com/cdn/shop/files/1_2260461d-3181-4311-83c5-57437625ab35.jpg?v=1776829934&width=1000',
  'https://youngkit.com/cdn/shop/files/1_5fe8fe70-657f-4b78-bb27-b1b0708bce94.jpg?v=1766137063&width=1000',
  'https://youngkit.com/cdn/shop/files/1_c3cf9a78-c901-487d-9a2b-13e52274b6c3.jpg?v=1766137063&width=1000',
];

const LEOPARD_IMAGES = [
  'https://youngkit.com/cdn/shop/files/1_0892e71b-948a-43d5-ae5e-19c0e97800dd.jpg?v=1757491805&width=1000',
  'https://youngkit.com/cdn/shop/files/1_2c290d0c-50d5-49bb-b9ef-ba335dd8332e.jpg?v=1757491805&width=1000',
  'https://youngkit.com/cdn/shop/files/1-_-2_d036ea97-e4ca-4d34-93b2-db0f6138f4f7.jpg?v=1757491805&width=1000',
  'https://youngkit.com/cdn/shop/files/1_12455c9a-b31b-4d8a-8f2c-27ef51eeedef.jpg?v=1757753635&width=1000',
  'https://youngkit.com/cdn/shop/files/1_6123bb03-a6a0-4ba5-bb5b-e4e4a07a9333.jpg?v=1757753635&width=1000',
];

const SAMSUNG_CASE_IMAGES = [
  'https://youngkit.com/cdn/shop/files/1_1d3bddb0-906f-46cf-bc9b-3621d009bd40.jpg?v=1774951293&width=1000',
  'https://youngkit.com/cdn/shop/files/1_aa64049d-1353-43ae-9bff-d7666f6c5470.jpg?v=1774951293&width=1000',
  'https://youngkit.com/cdn/shop/files/1_909d3803-4ab4-40f1-b061-35e509356a96.jpg?v=1774951293&width=1000',
  'https://youngkit.com/cdn/shop/files/1_ab0101de-c03e-476f-b72c-3bc2ebe5f1c1.jpg?v=1774951293&width=1000',
  'https://youngkit.com/cdn/shop/files/1_0df0ee4d-c877-49dd-9cb4-8c29c6406374.jpg?v=1773219777&width=1000',
  'https://youngkit.com/cdn/shop/files/1_1f344842-7521-44bb-893f-0273117762c5.jpg?v=1773219777&width=1000',
  'https://youngkit.com/cdn/shop/files/1_783a9dd7-54d1-4cad-9ce4-c56f71122396.jpg?v=1773212710&width=1000',
  'https://youngkit.com/cdn/shop/files/1_73671bab-ca54-422f-abf2-d90cfc5076ee.jpg?v=1779244661&width=1000',
  'https://youngkit.com/cdn/shop/files/1_8d87ec69-8461-42ac-9cf2-3c8546563388.jpg?v=1773303736&width=1000',
  'https://youngkit.com/cdn/shop/files/1_bdb51c78-3acc-4427-995b-3dabf4d03abe.jpg?v=1773303736&width=1000',
  'https://youngkit.com/cdn/shop/files/1_d679c62a-5cf6-452f-a598-601d2857a5f7.jpg?v=1773303736&width=1000',
];

const FALLBACK_NEEDLE = '/uploads/imported-products/iphone-phone-cases';

function uniqueKeepOrder(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function choosePool(product) {
  const name = String(product.name || '').toLowerCase();
  const category = String(product.category || '').toLowerCase();
  const subCategory = String(product.subCategory || '').toLowerCase();

  if (
    category.includes('samsung') ||
    name.includes('galaxy') ||
    subCategory.includes('galaxy') ||
    subCategory.includes('s26')
  ) {
    return SAMSUNG_CASE_IMAGES;
  }

  if (name.includes('leopard')) {
    return LEOPARD_IMAGES;
  }

  if (name.includes('magsafe') || name.includes('clear')) {
    return CLEAR_MAGSAFE_IMAGES;
  }

  return SILICONE_IMAGES;
}

function assignImages(product, index) {
  const pool = choosePool(product);
  const selected = uniqueKeepOrder([
    pool[index % pool.length],
    pool[(index + 3) % pool.length],
    pool[(index + 7) % pool.length],
  ]);

  const nextVariants = Array.isArray(product.variants)
    ? product.variants.map((variant, idx) => ({
        ...variant.toObject(),
        image: selected[idx % selected.length],
      }))
    : [];

  return {
    images: selected,
    variants: nextVariants,
  };
}

async function run() {
  try {
    await connectDB();

    const products = await Product.find({
      $or: [{ category: 'iPhone Cases' }, { category: 'Samsung Cases' }],
    }).sort({ createdAt: 1 });

    let updated = 0;
    let alreadyGood = 0;

    for (let i = 0; i < products.length; i += 1) {
      const product = products[i];
      const assigned = assignImages(product, i);

      const hasFallbackInImages = (product.images || []).some((img) =>
        String(img || '').includes(FALLBACK_NEEDLE)
      );

      const hasFallbackInVariants = (product.variants || []).some((v) =>
        String(v?.image || '').includes(FALLBACK_NEEDLE)
      );

      const needsUpdate = true;

      if (!needsUpdate) {
        alreadyGood += 1;
        continue;
      }

      product.images = assigned.images;
      product.variants = assigned.variants;

      // eslint-disable-next-line no-await-in-loop
      await product.save();
      updated += 1;
    }

    const remainingFallback = await Product.countDocuments({
      $and: [
        { $or: [{ category: 'iPhone Cases' }, { category: 'Samsung Cases' }] },
        {
          $or: [
            { images: { $elemMatch: { $regex: FALLBACK_NEEDLE } } },
            { 'variants.image': { $regex: FALLBACK_NEEDLE } },
          ],
        },
      ],
    });

    console.log('Case image refresh complete.');
    console.log(
      JSON.stringify(
        {
          scanned: products.length,
          updated,
          alreadyGood,
          remainingFallback,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error('Case image refresh failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

run();
