import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const distPath = path.join(__dirname, 'dist');

const VERTEX_LOCATION = 'us-central1';
const VERTEX_MODEL = 'imagegeneration@006';

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

app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(404).send('Not Found');
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Admin Web listening on port ${port}`);
});
