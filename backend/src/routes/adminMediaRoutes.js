/**
 * Admin media upload — POST /api/admin/media/upload
 * Auth: x-api-gateway-key + JWT (scope admin.system), same as system-stats.
 * Stores files under backend/public/uploads and serves them at GET /uploads/:file
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg']);

function extForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return 'bin';
}

function getAdminMediaUploadsDir() {
  return path.join(__dirname, '..', '..', 'public', 'uploads');
}

function resolvePublicBaseUrl(req) {
  const fixed = String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  const rawProto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const proto = String(rawProto).split(',')[0].trim();
  const rawHost = req.get('x-forwarded-host') || req.get('host') || '';
  const host = String(rawHost).split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

function createAdminMediaRouter(options = {}) {
  const uploadDir = options.uploadDir || getAdminMediaUploadsDir();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
      } catch (e) {
        return cb(e);
      }
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const id =
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : crypto.randomBytes(16).toString('hex');
      const ext = extForMime(file.mimetype);
      cb(null, `${Date.now()}_${id}.${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('INVALID_IMAGE_TYPE'));
      }
    },
  });

  const router = express.Router();

  router.post('/upload', (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.message === 'INVALID_IMAGE_TYPE') {
          return res.status(400).json({ ok: false, error: 'INVALID_IMAGE_TYPE' });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ ok: false, error: 'FILE_TOO_LARGE' });
        }
        console.error('[admin/media/upload]', err);
        return res.status(500).json({ ok: false, error: 'UPLOAD_FAILED' });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });
      }

      const base = resolvePublicBaseUrl(req);
      const filename = req.file.filename;
      const publicPath = `/uploads/${filename}`;
      const url = base ? `${base}${publicPath}` : publicPath;

      return res.status(200).json({
        ok: true,
        url,
        filename,
        mime: req.file.mimetype,
        path: publicPath,
      });
    });
  });

  return router;
}

module.exports = {
  createAdminMediaRouter,
  getAdminMediaUploadsDir,
};
