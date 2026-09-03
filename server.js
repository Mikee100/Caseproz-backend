const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const connectDB = require('./config/db');


dotenv.config();

console.log('JWT_SECRET loaded:', process.env.JWT_SECRET ? 'YES' : 'NO');

connectDB();

const productRoutes = require('./routes/productRoutes');
const sectionRoutes = require('./routes/sectionRoutes');
const userRoutes = require('./routes/userRoutes');
const orderRoutes = require('./routes/orderRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const siteConfigRoutes = require('./routes/siteConfigRoutes');
const discountRoutes = require('./routes/discountRoutes');
const seoRoutes = require('./routes/seoRoutes');
const brandRoutes = require('./routes/brandRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const path = require('path');

const app = express();
app.disable('x-powered-by');

// Trust all proxy layers on Render/Vercel to correctly identify HTTPS
app.set('trust proxy', true);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const PUBLIC_API_RATE_LIMIT_MAX = Number(process.env.PUBLIC_API_RATE_LIMIT_MAX || 300);
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 12);
const PASSWORD_RESET_RATE_LIMIT_MAX = Number(process.env.PASSWORD_RESET_RATE_LIMIT_MAX || 6);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.isFinite(PUBLIC_API_RATE_LIMIT_MAX) ? Math.max(50, PUBLIC_API_RATE_LIMIT_MAX) : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again shortly.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.isFinite(AUTH_RATE_LIMIT_MAX) ? Math.max(3, AUTH_RATE_LIMIT_MAX) : 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again later.' },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number.isFinite(PASSWORD_RESET_RATE_LIMIT_MAX) ? Math.max(3, PASSWORD_RESET_RATE_LIMIT_MAX) : 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset requests, please try again later.' },
});

app.use('/api', apiLimiter);
app.use('/api/users/login', authLimiter);
app.use('/api/users/google', authLimiter);
app.use('/api/users/forgot-password', passwordResetLimiter);
app.use('/api/users/reset-password', passwordResetLimiter);

const allowedOrigins = [

  'https://caseproz.vercel.app',
  'https://caseproz.co.ke',
  'https://www.caseproz.co.ke',
  'http://localhost:3000'
];
app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(compression());

const PUBLIC_API_CACHE_TTL = Number(process.env.PUBLIC_API_CACHE_TTL || 60);
const publicCacheTargets = ['/api/products', '/api/brands', '/api/site-config'];
const ENABLE_REQUEST_TIMING = process.env.ENABLE_REQUEST_TIMING === 'true';

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();

  const hasAuthSignal = Boolean(req.headers.authorization) || Boolean(req.headers.cookie);
  if (hasAuthSignal) {
    res.set('Cache-Control', 'private, no-store');
    return next();
  }

  const isTarget = publicCacheTargets.some((target) => req.path === target || req.path.startsWith(`${target}/`));
  if (isTarget) {
    const maxAge = Number.isFinite(PUBLIC_API_CACHE_TTL) && PUBLIC_API_CACHE_TTL > 0
      ? Math.floor(PUBLIC_API_CACHE_TTL)
      : 60;
    res.set('Cache-Control', `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
  }

  next();
});

// Optional lightweight latency logging to compare endpoint performance over time.
app.use((req, res, next) => {
  if (!ENABLE_REQUEST_TIMING) return next();
  if (!req.path.startsWith('/api/')) return next();

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const responseBytes = Number(res.getHeader('content-length') || 0);
    const cacheControl = String(res.getHeader('cache-control') || 'none');

    console.log(
      `[perf] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms ${responseBytes}B cache=${cacheControl}`
    );
  });

  next();
});

// Optional debug logging for auth metadata only (never log raw tokens)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development' && process.env.DEBUG_AUTH === 'true') {
    const authHeader = req.headers.authorization || '';
    const hasBearer = authHeader.startsWith('Bearer ');
    console.log('Auth debug:', {
      hasAuthorizationHeader: Boolean(authHeader),
      hasBearerToken: hasBearer,
      tokenLength: hasBearer ? authHeader.slice(7).length : 0,
    });
  }
  next();
});


app.use('/api/products', productRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/site-config', siteConfigRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/', seoRoutes);

app.use('/api/brands', brandRoutes);
app.use('/api/categories', categoryRoutes);

app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 7000;

app.listen(PORT, console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`));
