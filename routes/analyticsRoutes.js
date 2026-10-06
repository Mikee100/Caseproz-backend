const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const AuditLog = require('../models/AuditLog');
const DiscountCode = require('../models/DiscountCode');
const Section = require('../models/Section');
const SiteConfig = require('../models/SiteConfig');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const mongoose = require('mongoose');
const { GoogleAuth } = require('google-auth-library');
const { protect, admin } = require('../middleware/authMiddleware');

// @desc    Get audit logs
// @route   GET /api/analytics/audit-logs
// @access  Private/Admin
router.get('/audit-logs', protect, admin, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 30,
      action,
      entityType,
      actorEmail,
      q,
      from,
      to,
    } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limit = Math.min(100, Math.max(1, Number(pageSize) || 30));
    const skip = (pageNumber - 1) * limit;

    const filter = {};

    if (action) {
      filter.action = String(action).trim();
    }

    if (entityType) {
      filter.entityType = String(entityType).trim();
    }

    if (actorEmail) {
      filter['actor.email'] = { $regex: String(actorEmail).trim(), $options: 'i' };
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
          filter.createdAt.$gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = toDate;
        }
      }

      if (Object.keys(filter.createdAt).length === 0) {
        delete filter.createdAt;
      }
    }

    if (q) {
      const queryText = String(q).trim();
      filter.$or = [
        { action: { $regex: queryText, $options: 'i' } },
        { entityType: { $regex: queryText, $options: 'i' } },
        { entityId: { $regex: queryText, $options: 'i' } },
        { 'actor.name': { $regex: queryText, $options: 'i' } },
        { 'actor.email': { $regex: queryText, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: {
        page: pageNumber,
        pageSize: limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

const asNumber = (value) => (Number.isFinite(value) ? value : 0);

const buildSector = ({ key, title, status, summary, metrics }) => ({
  key,
  title,
  status,
  summary,
  metrics,
});

const getLowStockProducts = async () => {
  const siteConfig = await SiteConfig.getSingleton();
  const globalLowStock = typeof siteConfig.globalLowStockThreshold === 'number' ? siteConfig.globalLowStockThreshold : 5;
  const productsAll = await Product.find({}).select('name stock lowStockThreshold images slug variants');
  const lowStockProducts = [];

  productsAll.forEach((product) => {
    const threshold = typeof product.lowStockThreshold === 'number' ? product.lowStockThreshold : globalLowStock;

    if (
      typeof product.stock === 'number' &&
      typeof threshold === 'number' &&
      product.stock <= threshold
    ) {
      lowStockProducts.push({
        _id: product._id,
        name: product.name,
        stock: product.stock,
        lowStockThreshold: threshold,
        images: product.images,
        slug: product.slug,
        isVariant: false,
      });
    }

    if (Array.isArray(product.variants)) {
      product.variants.forEach((variant) => {
        if (
          typeof variant.stock === 'number' &&
          typeof threshold === 'number' &&
          variant.stock <= threshold
        ) {
          lowStockProducts.push({
            _id: product._id,
            name: `${product.name} - ${variant.label || variant.sku}`,
            stock: variant.stock,
            lowStockThreshold: threshold,
            images: [variant.image || product.images?.[0]].filter(Boolean),
            slug: product.slug,
            isVariant: true,
            variantSku: variant.sku,
            variantLabel: variant.label,
            variantColor: variant.color,
            variantStyle: variant.style,
          });
        }
      });
    }
  });

  return lowStockProducts;
};

const parseAnalyticsDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

const getClientDevice = (userAgent) => ({
  deviceCategory: /ipad|tablet|playbook|silk/i.test(userAgent)
    ? 'tablet'
    : /mobile|iphone|ipod|android/i.test(userAgent)
      ? 'mobile'
      : 'desktop',
  browser: /edg\//i.test(userAgent)
    ? 'Edge'
    : /opr\//i.test(userAgent)
      ? 'Opera'
      : /firefox\//i.test(userAgent)
        ? 'Firefox'
        : /chrome\//i.test(userAgent)
          ? 'Chrome'
          : /safari\//i.test(userAgent)
            ? 'Safari'
            : 'Other',
  operatingSystem: /android/i.test(userAgent)
    ? 'Android'
    : /iphone|ipad|ipod/i.test(userAgent)
      ? 'iOS'
      : /windows/i.test(userAgent)
        ? 'Windows'
        : /macintosh|mac os/i.test(userAgent)
          ? 'macOS'
          : /linux/i.test(userAgent)
            ? 'Linux'
            : 'Other',
});

const normalizeTrafficSource = (value) => {
  const source = String(value || 'unknown').trim();
  if (source === 'unknown') return 'direct';
  let hostname = source;
  try {
    if (source.includes('://')) hostname = new URL(source).hostname;
  } catch {
    return 'unknown';
  }
  hostname = hostname.replace(/^www\./, '').toLowerCase();
  if (/googleads|doubleclick\.net/.test(hostname)) return 'google';
  if (
    hostname === 'localhost' ||
    hostname.startsWith('localhost:') ||
    hostname === '127.0.0.1' ||
    hostname === 'caseproz.co.ke' ||
    hostname.endsWith('.caseproz.co.ke') ||
    hostname === 'caseproz.vercel.app' ||
    hostname === 'vercel.com' ||
    hostname.endsWith('.vercel.app') ||
    hostname === 'tagassistant.google.com' ||
    hostname.endsWith('.googlesyndication.com')
  ) return '(internal)';
  if (/^com\.google\.android\.googlequicksearchbox$/.test(hostname) || /(^|\.)google\./.test(hostname)) return 'google';
  if (/(^|\.)instagram\.com$/.test(hostname)) return 'instagram';
  if (/(^|\.)youtube\.com$/.test(hostname) || /(^|\.)youtu\.be$/.test(hostname)) return 'youtube';
  if (/(^|\.)facebook\.com$/.test(hostname) || /(^|\.)fb\.com$/.test(hostname)) return 'facebook';
  return hostname || 'unknown';
};

const inferTrafficMedium = (source, rawSource = '') => {
  if (/googleads|doubleclick\.net/i.test(rawSource)) return 'cpc';
  if (source === 'direct') return 'none';
  if (source === 'google' || /bing\.|duckduckgo\.|yahoo\./i.test(source)) return 'organic';
  if (/facebook|instagram|tiktok|linkedin|pinterest|youtube/i.test(source)) return 'social';
  return source === 'unknown' ? 'unknown' : 'referral';
};

const querySearchConsole = async (client, siteUrl, startDate, endDate, dimensions = [], rowLimit = 100) => {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const response = await client.request({
    url,
    method: 'POST',
    data: { startDate, endDate, dimensions, rowLimit, type: 'web' },
  });
  return Array.isArray(response.data?.rows) ? response.data.rows : [];
};

// @desc    Get date-scoped ecommerce analytics
// @route   GET /api/analytics/deep-dive
// @access  Private/Admin
router.get('/deep-dive', protect, admin, async (req, res) => {
  try {
    const fromDate = parseAnalyticsDate(req.query.from);
    const toDate = parseAnalyticsDate(req.query.to);
    if (!fromDate || !toDate || fromDate > toDate) {
      return res.status(400).json({ message: 'Valid from and to dates are required' });
    }

    const days = Math.floor((toDate - fromDate) / 86_400_000) + 1;
    if (days > 366) {
      return res.status(400).json({ message: 'Date range cannot exceed 366 days' });
    }

    const endExclusive = new Date(toDate.getTime() + 86_400_000);
    const previousStart = new Date(fromDate.getTime() - days * 86_400_000);
    const granularity = ['day', 'week', 'month'].includes(req.query.granularity) ? req.query.granularity : 'day';
    const queryLimit = Math.min(100, Math.max(15, Number(req.query.topN) || 30));
    const trendFormat = granularity === 'month' ? '%Y-%m' : granularity === 'week' ? '%G-W%V' : '%Y-%m-%d';
    const eventDateMatch = { createdAt: { $gte: fromDate, $lt: endExclusive } };
    const orderMatch = (start, end) => ({ createdAt: { $gte: start, $lt: end } });
    const paidOrderCondition = {
      $and: [{ $eq: ['$isPaid', true] }, { $ne: ['$status', 'cancelled'] }],
    };

    const [currentMetrics, previousMetrics, dailyRows, orderStatuses, topProducts, eventSummary, eventTypes, rawSources, recentOrders, seoProducts, sitemapCategories, sitemapBrands, trackedOverview, sourceRows, deviceRows, pageRows, clickRows, scrollRows, eventTrendRows] = await Promise.all([
      Order.aggregate([
        { $match: orderMatch(fromDate, endExclusive) },
        { $group: {
          _id: null,
          orders: { $sum: 1 },
          paidOrders: { $sum: { $cond: [paidOrderCondition, 1, 0] } },
          revenue: { $sum: { $cond: [paidOrderCondition, '$totalPrice', 0] } },
        } },
      ]),
      Order.aggregate([
        { $match: orderMatch(previousStart, fromDate) },
        { $group: {
          _id: null,
          orders: { $sum: 1 },
          paidOrders: { $sum: { $cond: [paidOrderCondition, 1, 0] } },
          revenue: { $sum: { $cond: [paidOrderCondition, '$totalPrice', 0] } },
        } },
      ]),
      Order.aggregate([
        { $match: orderMatch(fromDate, endExclusive) },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [paidOrderCondition, '$totalPrice', 0] } },
        } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: orderMatch(fromDate, endExclusive) },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { ...orderMatch(fromDate, endExclusive), isPaid: true, status: { $ne: 'cancelled' } } },
        { $unwind: '$orderItems' },
        { $group: {
          _id: { name: '$orderItems.name', product: '$orderItems.product' },
          units: { $sum: '$orderItems.qty' },
          revenue: { $sum: { $multiply: ['$orderItems.qty', '$orderItems.price'] } },
        } },
        { $sort: { units: -1, revenue: -1 } },
        { $limit: 8 },
        { $project: { _id: 0, name: '$_id.name', productId: '$_id.product', units: 1, revenue: 1 } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: fromDate, $lt: endExclusive } } },
        { $group: { _id: null, events: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } },
        { $project: { _id: 0, events: 1, sessions: { $size: { $filter: { input: '$sessions', as: 'session', cond: { $ne: ['$$session', null] } } } } } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: fromDate, $lt: endExclusive } } },
        { $group: { _id: '$eventName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: fromDate, $lt: endExclusive } } },
        { $group: { _id: '$referrer', events: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } },
      ]),
      Order.find(orderMatch(fromDate, endExclusive)).sort({ createdAt: -1 }).limit(8).populate('user', 'name'),
      Product.find({ isActive: true }).select('name slug metaTitle metaDescription').lean(),
      Category.countDocuments({}),
      Brand.countDocuments({}),
      AnalyticsEvent.aggregate([
        { $match: eventDateMatch },
        { $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          pageViews: { $sum: { $cond: [{ $eq: ['$eventName', 'page_view'] }, 1, 0] } },
          clicks: { $sum: { $sum: [
            { $cond: [{ $eq: ['$eventName', 'ui_click'] }, 1, 0] },
            { $cond: [{ $regexMatch: { input: '$eventName', regex: '^home_' } }, 1, 0] },
          ] } },
          engagedSeconds: { $sum: { $cond: [
            { $eq: ['$eventName', 'page_engagement'] },
            { $ifNull: ['$metadata.durationSeconds', 0] },
            0,
          ] } },
          visitors: { $addToSet: { $ifNull: ['$visitorId', '$sessionId'] } },
          sessions: { $addToSet: '$sessionId' },
        } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { ...eventDateMatch, $or: [{ eventName: 'page_view' }, { eventName: 'ui_click' }, { eventName: { $regex: '^home_' } }] } },
        { $group: {
          _id: {
            source: {
              $cond: [
                { $in: [{ $ifNull: ['$metadata.source', ''] }, ['', 'unknown']] },
                { $ifNull: ['$referrer', 'unknown'] },
                '$metadata.source',
              ],
            },
            medium: { $ifNull: ['$metadata.medium', 'unknown'] },
            campaign: { $ifNull: ['$metadata.campaign', ''] },
          },
          events: { $sum: 1 },
          visitors: { $addToSet: { $ifNull: ['$visitorId', '$sessionId'] } },
          sessions: { $addToSet: '$sessionId' },
          pageViews: { $sum: { $cond: [{ $eq: ['$eventName', 'page_view'] }, 1, 0] } },
          clicks: { $sum: { $cond: [
            { $or: [{ $eq: ['$eventName', 'ui_click'] }, { $regexMatch: { input: '$eventName', regex: '^home_' } }] },
            1,
            0,
          ] } },
        } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: eventDateMatch },
        { $group: {
          _id: { $ifNull: ['$metadata.deviceCategory', 'unknown'] },
          events: { $sum: 1 },
          visitors: { $addToSet: { $ifNull: ['$visitorId', '$sessionId'] } },
          sessions: { $addToSet: '$sessionId' },
          pageViews: { $sum: { $cond: [{ $eq: ['$eventName', 'page_view'] }, 1, 0] } },
          clicks: { $sum: { $cond: [
            { $or: [{ $eq: ['$eventName', 'ui_click'] }, { $regexMatch: { input: '$eventName', regex: '^home_' } }] },
            1,
            0,
          ] } },
          engagedSeconds: { $sum: { $cond: [
            { $eq: ['$eventName', 'page_engagement'] },
            { $ifNull: ['$metadata.durationSeconds', 0] },
            0,
          ] } },
        } },
        { $sort: { events: -1 } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: eventDateMatch },
        { $group: {
          _id: { $ifNull: ['$path', '$page'] },
          pageViews: { $sum: { $cond: [{ $eq: ['$eventName', 'page_view'] }, 1, 0] } },
          clicks: { $sum: { $cond: [
            { $or: [{ $eq: ['$eventName', 'ui_click'] }, { $regexMatch: { input: '$eventName', regex: '^home_' } }] },
            1,
            0,
          ] } },
          engagedSeconds: { $sum: { $cond: [
            { $eq: ['$eventName', 'page_engagement'] },
            { $ifNull: ['$metadata.durationSeconds', 0] },
            0,
          ] } },
          engagementEvents: { $sum: { $cond: [{ $eq: ['$eventName', 'page_engagement'] }, 1, 0] } },
          visitors: { $addToSet: { $cond: [{ $eq: ['$eventName', 'page_view'] }, { $ifNull: ['$visitorId', '$sessionId'] }, null] } },
          sessions: { $addToSet: { $cond: [{ $eq: ['$eventName', 'page_view'] }, '$sessionId', null] } },
          scroll50: { $sum: { $cond: [
            { $and: [{ $eq: ['$eventName', 'scroll_depth'] }, { $gte: ['$metadata.percentage', 50] }] },
            1,
            0,
          ] } },
        } },
        { $sort: { pageViews: -1, clicks: -1 } },
        { $limit: 50 },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { ...eventDateMatch, eventName: 'ui_click' } },
        { $group: {
          _id: {
            page: { $ifNull: ['$path', '$page'] },
            destination: { $ifNull: ['$metadata.destination', '(unlabeled control)'] },
            label: { $ifNull: ['$metadata.label', ''] },
            element: { $ifNull: ['$metadata.element', 'unknown'] },
          },
          clicks: { $sum: 1 },
          visitors: { $addToSet: { $ifNull: ['$visitorId', '$sessionId'] } },
        } },
        { $sort: { clicks: -1 } },
        { $limit: 50 },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { ...eventDateMatch, eventName: 'scroll_depth' } },
        { $group: { _id: '$metadata.percentage', count: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } },
        { $sort: { _id: 1 } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: eventDateMatch },
        { $group: {
          _id: { $dateToString: { format: trendFormat, date: '$createdAt', timezone: 'UTC' } },
          pageViews: { $sum: { $cond: [{ $eq: ['$eventName', 'page_view'] }, 1, 0] } },
          clicks: { $sum: { $cond: [
            { $or: [{ $eq: ['$eventName', 'ui_click'] }, { $regexMatch: { input: '$eventName', regex: '^home_' } }] },
            1,
            0,
          ] } },
          engagedSeconds: { $sum: { $cond: [
            { $eq: ['$eventName', 'page_engagement'] },
            { $ifNull: ['$metadata.durationSeconds', 0] },
            0,
          ] } },
          visitors: { $addToSet: { $ifNull: ['$visitorId', '$sessionId'] } },
        } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const buildMetrics = (rows) => {
      const metrics = rows[0] || { orders: 0, paidOrders: 0, revenue: 0 };
      return {
        orders: metrics.orders || 0,
        paidOrders: metrics.paidOrders || 0,
        revenue: metrics.revenue || 0,
        averageOrderValue: metrics.paidOrders ? metrics.revenue / metrics.paidOrders : 0,
      };
    };
    const acquisition = new Map();
    sourceRows.forEach((row) => {
      const rawSource = String(row._id.source || 'unknown');
      const source = normalizeTrafficSource(rawSource);
      if (source === '(internal)') return;
      const providedMedium = String(row._id.medium || 'unknown').toLowerCase();
      const medium = providedMedium === 'unknown' ? inferTrafficMedium(source, rawSource) : providedMedium;
      const rawCampaign = String(row._id.campaign || '').trim();
      const campaign = /^([a-z][a-z\d+.-]*:\/\/|localhost(?::|\/))/i.test(rawCampaign) ? '' : rawCampaign;
      const key = JSON.stringify([source, medium, campaign]);
      const bucket = acquisition.get(key) || {
        source,
        medium,
        campaign: campaign || '(not set)',
        events: 0,
        pageViews: 0,
        clicks: 0,
        visitors: new Set(),
        sessions: new Set(),
      };
      bucket.events += row.events;
      bucket.pageViews += row.pageViews;
      bucket.clicks += row.clicks;
      row.visitors.filter(Boolean).forEach((visitor) => bucket.visitors.add(visitor));
      row.sessions.filter(Boolean).forEach((session) => bucket.sessions.add(session));
      acquisition.set(key, bucket);
    });
    const acquisitionRows = [...acquisition.values()]
      .map(({ visitors, sessions, ...row }) => ({ ...row, visitors: visitors.size, sessions: sessions.size }))
      .sort((a, b) => b.visitors - a.visitors);
    const dailyByDate = new Map(dailyRows.map((row) => [row._id, row]));
    const salesByDay = [];
    for (let day = new Date(fromDate); day < endExclusive; day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10);
      const row = dailyByDate.get(date);
      salesByDay.push({ date, orders: row?.orders || 0, revenue: row?.revenue || 0 });
    }

    const sources = new Map();
    rawSources.forEach((row) => {
      let source = 'Direct';
      if (row._id) {
        try {
          source = new URL(row._id).hostname.replace(/^www\./, '') || 'Direct';
        } catch {
          source = 'Other';
        }
      }
      const current = sources.get(source) || { source, events: 0, sessionIds: new Set() };
      current.events += row.events;
      row.sessions.filter(Boolean).forEach((session) => current.sessionIds.add(session));
      sources.set(source, current);
    });

    const searchConsoleSiteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || '';
    let searchConsole = {
      configured: false,
      status: 'not_configured',
      siteUrl: searchConsoleSiteUrl || null,
      current: null,
      previous: null,
      timeseries: [],
      queries: [],
      pages: [],
      error: null,
    };
    let credentials = null;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS || 'null');
    } catch {
      credentials = null;
    }

    if (searchConsoleSiteUrl && credentials?.client_email && credentials?.private_key) {
      try {
        const auth = new GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
        });
        const client = await auth.getClient();
        const dateString = (date) => date.toISOString().slice(0, 10);
        const [currentRows, previousRows, timeseriesRows, queryRows, pageRows] = await Promise.all([
          querySearchConsole(client, searchConsoleSiteUrl, dateString(fromDate), dateString(toDate), [], 1),
          querySearchConsole(client, searchConsoleSiteUrl, dateString(previousStart), dateString(new Date(fromDate.getTime() - 86_400_000)), [], 1),
          querySearchConsole(client, searchConsoleSiteUrl, dateString(fromDate), dateString(toDate), ['date'], Math.min(days, 500)),
          querySearchConsole(client, searchConsoleSiteUrl, dateString(fromDate), dateString(toDate), ['query'], queryLimit),
          querySearchConsole(client, searchConsoleSiteUrl, dateString(fromDate), dateString(toDate), ['page'], queryLimit),
        ]);
        const toMetrics = (row) => row ? {
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
        } : null;
        const toRows = (rows) => rows.map((row) => ({
          key: row.keys?.[0] || '',
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
        }));
        searchConsole = {
          configured: true,
          status: 'connected',
          siteUrl: searchConsoleSiteUrl,
          current: toMetrics(currentRows[0]),
          previous: toMetrics(previousRows[0]),
          timeseries: toRows(timeseriesRows),
          queries: toRows(queryRows),
          pages: toRows(pageRows),
          error: null,
        };
      } catch (error) {
        console.error('Search Console analytics request failed:', error.message);
        searchConsole = {
          ...searchConsole,
          configured: true,
          status: 'error',
          error: 'Search Console could not be reached. Check that the service account can access this property.',
        };
      }
    }

    const missingProductTitles = seoProducts
      .filter((product) => !String(product.metaTitle || '').trim())
      .map(({ _id, name, slug }) => ({ _id, name, slug }));
    const missingProductDescriptions = seoProducts
      .filter((product) => !String(product.metaDescription || '').trim())
      .map(({ _id, name, slug }) => ({ _id, name, slug }));
    const isoWeekKey = (date) => {
      const monday = new Date(date);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      const thursday = new Date(monday);
      thursday.setUTCDate(thursday.getUTCDate() + 3);
      const isoYear = thursday.getUTCFullYear();
      const januaryFourth = new Date(Date.UTC(isoYear, 0, 4));
      const firstMonday = new Date(januaryFourth);
      firstMonday.setUTCDate(firstMonday.getUTCDate() - ((firstMonday.getUTCDay() + 6) % 7));
      const week = 1 + Math.round((monday - firstMonday) / (7 * 86_400_000));
      return `${isoYear}-W${String(week).padStart(2, '0')}`;
    };
    const trendByPeriod = new Map(eventTrendRows.map((row) => [row._id, row]));
    const completeTrend = [];
    const trendCursor = new Date(fromDate);
    if (granularity === 'week') {
      trendCursor.setUTCDate(trendCursor.getUTCDate() - ((trendCursor.getUTCDay() + 6) % 7));
    } else if (granularity === 'month') {
      trendCursor.setUTCDate(1);
    }
    while (trendCursor < endExclusive) {
      const period = granularity === 'week'
        ? isoWeekKey(trendCursor)
        : granularity === 'month'
          ? trendCursor.toISOString().slice(0, 7)
          : trendCursor.toISOString().slice(0, 10);
      const row = trendByPeriod.get(period);
      completeTrend.push({
        period,
        pageViews: row?.pageViews || 0,
        clicks: row?.clicks || 0,
        engagedSeconds: row?.engagedSeconds || 0,
        visitors: row ? row.visitors.filter(Boolean).length : 0,
      });
      if (granularity === 'week') trendCursor.setUTCDate(trendCursor.getUTCDate() + 7);
      else if (granularity === 'month') trendCursor.setUTCMonth(trendCursor.getUTCMonth() + 1);
      else trendCursor.setUTCDate(trendCursor.getUTCDate() + 1);
    }

    return res.json({
      range: { from: req.query.from, to: req.query.to, days },
      current: buildMetrics(currentMetrics),
      previous: buildMetrics(previousMetrics),
      salesByDay,
      orderStatuses: orderStatuses.map((row) => ({ status: row._id || 'unknown', count: row.count })),
      topProducts,
      eventSummary: eventSummary[0] || { events: 0, sessions: 0 },
      eventTypes: eventTypes.map((row) => ({ eventName: row._id || 'unknown', count: row.count })),
      trafficSources: [...sources.values()]
        .map(({ source, events, sessionIds }) => ({ source, events, sessions: sessionIds.size }))
        .sort((a, b) => b.events - a.events)
        .slice(0, 8),
      behavior: {
        totals: {
          events: trackedOverview[0]?.totalEvents || 0,
          pageViews: trackedOverview[0]?.pageViews || 0,
          clicks: trackedOverview[0]?.clicks || 0,
          visitors: (trackedOverview[0]?.visitors || []).filter(Boolean).length,
          sessions: (trackedOverview[0]?.sessions || []).filter(Boolean).length,
          engagedSeconds: trackedOverview[0]?.engagedSeconds || 0,
        },
        granularity,
        trend: completeTrend,
        sources: acquisitionRows,
        devices: deviceRows.map((row) => ({
          device: row._id || 'unknown',
          events: row.events,
          visitors: row.visitors.filter(Boolean).length,
          sessions: row.sessions.filter(Boolean).length,
          pageViews: row.pageViews,
          clicks: row.clicks,
          engagedSeconds: row.engagedSeconds,
        })),
        browsers: await AnalyticsEvent.aggregate([
          { $match: eventDateMatch },
          { $group: { _id: { $ifNull: ['$metadata.browser', 'unknown'] }, events: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } },
          { $sort: { events: -1 } },
        ]).then((rows) => rows.map((row) => ({ browser: row._id, events: row.events, sessions: row.sessions.filter(Boolean).length }))),
        operatingSystems: await AnalyticsEvent.aggregate([
          { $match: eventDateMatch },
          { $group: { _id: { $ifNull: ['$metadata.operatingSystem', 'unknown'] }, events: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } },
          { $sort: { events: -1 } },
        ]).then((rows) => rows.map((row) => ({ operatingSystem: row._id, events: row.events, sessions: row.sessions.filter(Boolean).length }))),
        pages: pageRows.map((row) => ({
          page: row._id || 'unknown',
          pageViews: row.pageViews,
          clicks: row.clicks,
          engagedSeconds: row.engagedSeconds,
          averageEngagedSeconds: row.engagementEvents ? Math.round(row.engagedSeconds / row.engagementEvents) : null,
          visitors: row.visitors.filter(Boolean).length,
          sessions: row.sessions.filter(Boolean).length,
          scroll50: row.scroll50,
        })),
        clicks: clickRows.map((row) => ({
          page: row._id.page,
          destination: row._id.destination,
          label: row._id.label,
          element: row._id.element,
          clicks: row.clicks,
          visitors: row.visitors.filter(Boolean).length,
        })),
        scrollDepth: scrollRows.map((row) => ({ percentage: row._id, events: row.count, sessions: row.sessions.filter(Boolean).length })),
      },
      seoAudit: {
        activeProducts: seoProducts.length,
        productsWithTitle: seoProducts.length - missingProductTitles.length,
        productsWithDescription: seoProducts.length - missingProductDescriptions.length,
        missingProductTitles: missingProductTitles.slice(0, 20),
        missingProductDescriptions: missingProductDescriptions.slice(0, 20),
        sitemap: {
          staticUrls: 7,
          productUrls: seoProducts.length,
          categoryUrls: sitemapCategories,
          brandUrls: sitemapBrands,
          totalUrls: 7 + seoProducts.length + sitemapCategories + sitemapBrands,
        },
      },
      searchConsole,
      recentOrders,
    });
  } catch (error) {
    console.error('Error fetching ecommerce analytics:', error);
    return res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

// @desc    Capture lightweight frontend analytics events
// @route   POST /api/analytics/event
// @access  Public
router.post('/event', async (req, res) => {
  try {
    const {
      eventName,
      page = 'home',
      path,
      section,
      label,
      visitorId,
      sessionId,
      metadata,
      referrer,
    } = req.body || {};

    if (!eventName || typeof eventName !== 'string') {
      return res.status(400).json({ message: 'eventName is required' });
    }

    const normalizedEventName = eventName.trim().slice(0, 80);
    if (!/^[a-z0-9_-]+$/i.test(normalizedEventName)) {
      return res.status(400).json({ message: 'eventName contains unsupported characters' });
    }
    const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
    if (JSON.stringify(safeMetadata).length > 4096) {
      return res.status(413).json({ message: 'Analytics event metadata is too large' });
    }
    const userAgent = String(req.get('user-agent') || '').slice(0, 500);
    let referrerHost = '';
    try {
      const referrerValue = String(referrer || '');
      referrerHost = referrerValue
        ? new URL(referrerValue.includes('://') ? referrerValue : `https://${referrerValue}`).hostname.replace(/^www\./, '').slice(0, 160)
        : '';
    } catch {
      referrerHost = '';
    }
    const safePage = String(page || 'home').split(/[?#]/)[0].slice(0, 250);

    await AnalyticsEvent.create({
      eventName: normalizedEventName,
      page: safePage,
      path: String(path || (safePage.startsWith('/') ? safePage : '')).split(/[?#]/)[0].slice(0, 250),
      section: String(section || '').slice(0, 100),
      label: String(label || '').slice(0, 120),
      visitorId: String(visitorId || '').slice(0, 100) || undefined,
      sessionId: String(sessionId || '').slice(0, 100) || undefined,
      metadata: { ...safeMetadata, ...getClientDevice(userAgent) },
      referrer: referrerHost,
    });

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: 'Failed to record analytics event' });
  }
});

// @desc    Get dashboard analytics
// @route   GET /api/analytics/summary
// @access  Private/Admin
router.get('/summary', protect, admin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    
    const orders = await Order.find({});
    const totalOrders = orders.length;
    
    const totalSales = orders.reduce((acc, order) => {
        // Only count paid orders, or we can count all depending on business logic. 
        // Let's count all totalPrice for now.
        return acc + order.totalPrice;
    }, 0);

    const products = await Product.countDocuments({});

    const lowStockProducts = await getLowStockProducts();

    // Get recent 5 orders
    const recentOrders = await Order.find({}).sort({ createdAt: -1 }).limit(5).populate('user', 'name');

    // Aggregate sales by month (optional, for charts)
    const salesData = await Order.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalSales: { $sum: "$totalPrice" },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);

    res.json({
      totalUsers,
      totalOrders,
      totalSales,
      products,
      recentOrders,
      salesData,
      lowStockProducts
    });

  } catch (error) {
    res.status(500).json({ message: 'Error fetching analytics summary' });
  }
});

// @desc    Get admin health summary across core system sectors
// @route   GET /api/analytics/health
// @access  Private/Admin
router.get('/health', protect, admin, async (req, res) => {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      verifiedUsers,
      adminUsers,
      totalOrders,
      pendingOrders,
      processingOrders,
      unpaidOldOrders,
      totalProducts,
      activeProducts,
      sectionCount,
      totalDiscounts,
      activeDiscounts,
      expiringDiscounts,
      lowStockProducts,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ isAdmin: true }),
      Order.countDocuments({}),
      Order.countDocuments({ status: { $in: ['pending', 'confirmed'] } }),
      Order.countDocuments({ status: { $in: ['processing', 'dispatched', 'in_transit', 'out_for_delivery'] } }),
      Order.countDocuments({ isPaid: false, createdAt: { $lte: twentyFourHoursAgo } }),
      Product.countDocuments({}),
      Product.countDocuments({ isActive: true }),
      Section.countDocuments({}),
      DiscountCode.countDocuments({}),
      DiscountCode.countDocuments({
        active: true,
        $and: [
          { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }] },
        ],
      }),
      DiscountCode.countDocuments({
        active: true,
        expiresAt: { $gte: now, $lte: sevenDaysAhead },
      }),
      getLowStockProducts(),
    ]);

    const unverifiedUsers = asNumber(totalUsers) - asNumber(verifiedUsers);
    const inactiveProducts = asNumber(totalProducts) - asNumber(activeProducts);
    const lowStockCount = Array.isArray(lowStockProducts) ? lowStockProducts.length : 0;
    const dbConnected = mongoose?.connection?.readyState === 1;

    const ordersStatus =
      pendingOrders > 60 || unpaidOldOrders > 25
        ? 'critical'
        : pendingOrders > 20 || unpaidOldOrders > 5
          ? 'warning'
          : 'healthy';

    const inventoryStatus =
      lowStockCount > 45 || inactiveProducts > activeProducts
        ? 'critical'
        : lowStockCount > 0 || inactiveProducts > 0
          ? 'warning'
          : 'healthy';

    const usersStatus =
      totalUsers > 0 && unverifiedUsers > verifiedUsers
        ? 'warning'
        : 'healthy';

    const discountsStatus =
      activeDiscounts === 0
        ? 'warning'
        : expiringDiscounts > 0
          ? 'warning'
          : 'healthy';

    const contentStatus = sectionCount === 0 ? 'warning' : 'healthy';

    const sectors = [
      buildSector({
        key: 'database',
        title: 'Database',
        status: dbConnected ? 'healthy' : 'critical',
        summary: dbConnected ? 'Database connection is stable.' : 'Database is disconnected.',
        metrics: [
          { label: 'Connection state', value: dbConnected ? 'Connected' : 'Disconnected' },
          { label: 'Node uptime', value: `${Math.round(process.uptime())}s` },
        ],
      }),
      buildSector({
        key: 'orders',
        title: 'Orders Pipeline',
        status: ordersStatus,
        summary:
          ordersStatus === 'healthy'
            ? 'Order processing volume is within normal range.'
            : 'Order backlog needs attention.',
        metrics: [
          { label: 'Total orders', value: totalOrders },
          { label: 'Pending + confirmed', value: pendingOrders },
          { label: 'In progress', value: processingOrders },
          { label: 'Unpaid older than 24h', value: unpaidOldOrders },
        ],
      }),
      buildSector({
        key: 'inventory',
        title: 'Inventory',
        status: inventoryStatus,
        summary:
          inventoryStatus === 'healthy'
            ? 'Inventory health is good.'
            : 'Low stock or inactive products detected.',
        metrics: [
          { label: 'Total products', value: totalProducts },
          { label: 'Active products', value: activeProducts },
          { label: 'Inactive products', value: inactiveProducts },
          { label: 'Low stock items', value: lowStockCount },
        ],
      }),
      buildSector({
        key: 'customers',
        title: 'Customers',
        status: usersStatus,
        summary:
          usersStatus === 'healthy'
            ? 'Customer verification trend looks healthy.'
            : 'Unverified users are high compared to verified users.',
        metrics: [
          { label: 'Total users', value: totalUsers },
          { label: 'Verified users', value: verifiedUsers },
          { label: 'Unverified users', value: unverifiedUsers },
          { label: 'Admin users', value: adminUsers },
        ],
      }),
      buildSector({
        key: 'discounts',
        title: 'Discount Programs',
        status: discountsStatus,
        summary:
          discountsStatus === 'healthy'
            ? 'Discount setup is healthy.'
            : 'Discount coverage or expiry needs review.',
        metrics: [
          { label: 'Total discount codes', value: totalDiscounts },
          { label: 'Currently active', value: activeDiscounts },
          { label: 'Expiring in 7 days', value: expiringDiscounts },
        ],
      }),
      buildSector({
        key: 'content',
        title: 'Content & Sections',
        status: contentStatus,
        summary:
          contentStatus === 'healthy'
            ? 'Homepage sections are configured.'
            : 'No homepage sections found.',
        metrics: [
          { label: 'Configured sections', value: sectionCount },
        ],
      }),
    ];

    const severityScore = sectors.reduce((score, sector) => {
      if (sector.status === 'critical') return score + 2;
      if (sector.status === 'warning') return score + 1;
      return score;
    }, 0);

    const overallStatus =
      severityScore >= 5
        ? 'critical'
        : severityScore >= 2
          ? 'warning'
          : 'healthy';

    return res.json({
      generatedAt: now.toISOString(),
      overallStatus,
      uptimeSeconds: Math.round(process.uptime()),
      sectors,
      lowStockPreview: lowStockProducts.slice(0, 8),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching system health summary' });
  }
});

module.exports = router;
