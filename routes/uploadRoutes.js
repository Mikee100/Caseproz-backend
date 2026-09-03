const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const router = express.Router();

const cloudinaryCloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const cloudinaryApiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
const cloudinaryApiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinaryApiSecret,
});

function hasValidCloudinaryConfig() {
  return Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);
}

let cloudinaryEnabled = hasValidCloudinaryConfig() && process.env.FORCE_LOCAL_UPLOADS !== 'true';
let cloudinaryDisabledReason = '';

if (!hasValidCloudinaryConfig()) {
  cloudinaryDisabledReason = 'missing env variables';
  console.warn('[upload] Cloudinary disabled: missing CLOUDINARY_* environment variables.');
}

if (process.env.FORCE_LOCAL_UPLOADS === 'true') {
  cloudinaryDisabledReason = 'FORCE_LOCAL_UPLOADS=true';
  console.warn('[upload] Cloudinary disabled by FORCE_LOCAL_UPLOADS=true.');
}

function disableCloudinary(reason) {
  if (!cloudinaryEnabled) return;
  cloudinaryEnabled = false;
  cloudinaryDisabledReason = reason || 'unknown reason';
  console.warn(`[upload] Cloudinary disabled. Falling back to local uploads. Reason: ${cloudinaryDisabledReason}`);
}

const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 5);
const MAX_UPLOAD_FILE_SIZE =
  Number.isFinite(MAX_UPLOAD_SIZE_MB) && MAX_UPLOAD_SIZE_MB > 0
    ? Math.floor(MAX_UPLOAD_SIZE_MB * 1024 * 1024)
    : 5 * 1024 * 1024;

const storage = multer.memoryStorage();

function checkFileType(file, cb) {
  const filetypes = /jpg|jpeg|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Images only! Allowed formats: jpg, jpeg, png, webp.'));
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE,
    files: 1,
  },
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
});

const handleMulterUpload = (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: `Image is too large. Maximum allowed size is ${Math.floor(MAX_UPLOAD_FILE_SIZE / (1024 * 1024))}MB.`,
      });
    }

    return res.status(400).json({ message: error.message || 'Invalid upload payload' });
  });
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function saveLocally(file) {
  const uploadsRoot = path.join(__dirname, '..', 'uploads');
  const fallbackDir = path.join(uploadsRoot, 'fallback');
  ensureDir(fallbackDir);

  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
  const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${safeExt}`;
  const fullPath = path.join(fallbackDir, filename);

  fs.writeFileSync(fullPath, file.buffer);
  return `/uploads/fallback/${filename}`;
}

router.post('/', handleMulterUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (cloudinaryEnabled) {
      const folder = process.env.CLOUDINARY_FOLDER || 'ecommerce_products';

      try {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder,
              resource_type: 'image',
            },
            (error, uploadResult) => {
              if (error) {
                return reject(error);
              }
              resolve(uploadResult);
            }
          );

          stream.end(req.file.buffer);
        });

        // Return hosted image URL for Product.images
        return res.send(result.secure_url);
      } catch (cloudinaryError) {
        const message = String(cloudinaryError?.message || 'Cloudinary upload failed');
        const code = cloudinaryError?.http_code;

        if (code === 401 || /invalid cloud_name|invalid api_key|signature/i.test(message)) {
          disableCloudinary(`${code || 'auth'} ${message}`);
        } else {
          console.warn('[upload] Cloudinary upload failed. Using local fallback for this request.', {
            message,
            http_code: code,
          });
        }
      }
    }

    // Cloudinary not configured or failed: fallback to local disk so admin flow keeps working.
    const localUrl = saveLocally(req.file);
    if (cloudinaryDisabledReason) {
      res.set('x-upload-storage', 'local-fallback');
    }
    return res.send(localUrl);
  } catch (error) {
    console.error('Image upload error:', error);
    return res
      .status(500)
      .json({
        message: 'Image upload failed',
        error: error.message,
        hint:
          'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET correctly, or use local fallback uploads.',
      });
  }
});

module.exports = router;
