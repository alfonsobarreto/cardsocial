import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const distPath = path.join(__dirname, 'dist');

const VERTEX_LOCATION = 'us-central1';
const VERTEX_MODEL = 'imagegeneration@006';

function sanitizeUploadBaseName(originalName) {
  const base = path.basename(String(originalName || 'file'), path.extname(String(originalName || '')))
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);
  return base || 'file';
}

function getSpacesConfig() {
  const endpoint = process.env.DO_SPACES_ENDPOINT?.trim();
  const key = process.env.DO_SPACES_KEY?.trim();
  const secret = process.env.DO_SPACES_SECRET?.trim();
  const bucket = process.env.DO_SPACES_BUCKET?.trim();
  const region = process.env.DO_SPACES_REGION?.trim() || 'nyc3';
  if (!endpoint || !key || !secret || !bucket) return null;
  return { endpoint: endpoint.replace(/\/$/, ''), key, secret, bucket, region };
}

/** @param {string} bucket
 * @param {string} endpointUrl */
function publicObjectUrl(bucket, endpointUrl, key) {
  try {
    const base = endpointUrl.startsWith('http') ? endpointUrl : `https://${endpointUrl}`;
    const { host } = new URL(base);
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `https://${bucket}.${host}/${encodedKey}`;
  } catch {
    return `https://${bucket}.digitaloceanspaces.com/${key}`;
  }
}

const spacesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 36 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname || '';
    const mime = file.mimetype || '';
    const ok = /\.(png|svg|jpe?g|webp)$/i.test(name) || /^image\//.test(mime);
    cb(null, ok);
  },
});

app.use(express.json());

app.post('/api/vertex-proxy', async (req, res) => {
  const projectId = process.env.VITE_GCP_PROJECT_ID?.trim();
  const accessToken = process.env.VITE_GCP_ACCESS_TOKEN?.trim();

  if (!projectId || !accessToken) {
    return res.status(503).json({
      error:
        'Vertex AI no configurado en el servidor: definir VITE_GCP_PROJECT_ID y VITE_GCP_ACCESS_TOKEN (process.env).',
    });
  }

  let instancePrompt;
  let parameters;

  if (typeof req.body.instancePrompt === 'string' && req.body.instancePrompt.length > 0) {
    instancePrompt = req.body.instancePrompt;
    parameters = req.body.parameters ?? { sampleCount: 1, aspectRatio: '1:1' };
  } else {
    const { prompt, hexColorBackground } = req.body;
    const bg = String(hexColorBackground || '#0B1220').trim() || '#0B1220';
    const safe =
      String(prompt || '')
        .replace(/\s+/g, ' ')
        .trim() || 'abstract premium app symbol';
    instancePrompt = `A minimalist flat vector iOS app icon of ${safe}, centered, solid background color ${bg}, dribbble style, high quality`;
    parameters = { sampleCount: 1, aspectRatio: '1:1' };
  }

  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:predict`;

  try {
    const googleRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [{ prompt: instancePrompt }],
        parameters,
      }),
    });

    const text = await googleRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[vertex-proxy] Respuesta no JSON de Vertex:', googleRes.status, text.slice(0, 800));
      return res.status(502).json({
        error: 'Vertex AI devolvio una respuesta no JSON',
        status: googleRes.status,
        raw: text.slice(0, 500),
      });
    }

    if (!googleRes.ok) {
      console.error('[vertex-proxy] Vertex error:', googleRes.status, JSON.stringify(data).slice(0, 800));
      return res.status(googleRes.status >= 400 && googleRes.status < 600 ? googleRes.status : 502).json(data);
    }

    return res.json(data);
  } catch (err) {
    console.error('[vertex-proxy]', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'vertex-proxy failed',
    });
  }
});

app.post('/api/upload-spaces', spacesUpload.array('files', 32), async (req, res) => {
  const cfg = getSpacesConfig();
  if (!cfg) {
    return res.status(503).json({
      error:
        'DigitalOcean Spaces no configurado: defina DO_SPACES_ENDPOINT, DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET (y opcional DO_SPACES_REGION).',
    });
  }

  const files = req.files;
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Envia uno o mas archivos en el campo multipart "files".' });
  }

  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint.startsWith('http') ? cfg.endpoint : `https://${cfg.endpoint}`,
    credentials: {
      accessKeyId: cfg.key,
      secretAccessKey: cfg.secret,
    },
    forcePathStyle: false,
  });

  const urls = [];
  const prefix = `forge/${new Date().toISOString().slice(0, 10)}`;

  try {
    for (const file of files) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
      const base = sanitizeUploadBaseName(file.originalname);
      const key = `${prefix}/${Date.now()}-${Math.random().toString(16).slice(2)}-${base}${ext}`;
      const contentType =
        file.mimetype && file.mimetype !== 'application/octet-stream'
          ? file.mimetype
          : ext === '.svg'
            ? 'image/svg+xml'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.webp'
                ? 'image/webp'
                : 'image/png';

      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: file.buffer,
          ACL: 'public-read',
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000',
        }),
      );

      urls.push(publicObjectUrl(cfg.bucket, cfg.endpoint, key));
    }

    return res.json({ urls });
  } catch (err) {
    console.error('[upload-spaces]', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'upload-spaces failed',
    });
  }
});

app.use(express.static(distPath));

const indexHtml = path.resolve(__dirname, 'dist', 'index.html');
const sendSpaIndex = (_req, res) => {
  res.sendFile(indexHtml);
};
// Express 5 / path-to-regexp: `*` alone is invalid; use a named splat for SPA fallback.
app.get('/{*path}', sendSpaIndex);
app.head('/{*path}', sendSpaIndex);

app.listen(port, () => {
  console.log(`Admin Web listening on port ${port}`);
});
