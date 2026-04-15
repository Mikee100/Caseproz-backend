const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
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

// Trust all proxy layers on Render/Vercel to correctly identify HTTPS
app.set('trust proxy', true);

const allowedOrigins = [

  'https://caseproz.vercel.app',
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
app.use(express.json());

// Debug logging for auth headers
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Authorization header:', req.headers.authorization);
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

const PORT = process.env.PORT || 4000;

app.listen(PORT, console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`));
