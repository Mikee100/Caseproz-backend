const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');

const router = express.Router();

const getBaseUrl = (req) => {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  return 'https://www.caseproz.co.ke';
};

// Robots.txt
router.get('/robots.txt', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.type('text/plain');
  res.send(
    [
      'User-agent: *',
      'Allow: /',
      '',
      'Disallow: /admin',
      'Disallow: /login',
      'Disallow: /register',
      'Disallow: /checkout',
      'Disallow: /profile',
      'Disallow: /orders',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
    ].join('\n')
  );
});

// XML sitemap for products, categories, and key pages
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);

    const staticUrls = [
      '/',
      '/search',
      '/delivery',
      '/returns',
      '/faq',
      '/customer-support',
      '/contact',
    ];

    const [products, categories] = await Promise.all([
      Product.find({ isActive: true }).select('slug updatedAt createdAt'),
      Category.find({}).select('slug updatedAt createdAt'),
    ]);

    const urls = [
      ...staticUrls.map((path) => ({
        loc: `${baseUrl}${path}`,
        changefreq: path === '/' ? 'daily' : 'monthly',
        priority: path === '/' ? '1.0' : '0.6',
      })),
      ...categories.map((c) => ({
        loc: `${baseUrl}/category/${c.slug}`,
        lastmod: (c.updatedAt || c.createdAt || new Date()).toISOString(),
        changefreq: 'weekly',
        priority: '0.8',
      })),
      ...products.map((p) => ({
        loc: `${baseUrl}/product/${p.slug}`,
        lastmod: (p.updatedAt || p.createdAt || new Date()).toISOString(),
        changefreq: 'weekly',
        priority: '0.9',
      })),
    ];

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((u) => {
        return [
          '  <url>',
          `    <loc>${u.loc}</loc>`,
          u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
          u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : '',
          u.priority ? `    <priority>${u.priority}</priority>` : '',
          '  </url>',
        ]
          .filter(Boolean)
          .join('\n');
      }),
      '</urlset>',
    ].join('\n');

    res.type('application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Failed to generate sitemap:', error);
    res.status(500).send('Failed to generate sitemap');
  }
});

module.exports = router;

