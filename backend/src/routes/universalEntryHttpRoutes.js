/**
 * Entrada HTTP GET /u/:token en el mismo proceso que la API (Azure).
 * Valida temporary_access (24h); si es válido redirige a la SPA en cardsocial.me.
 *
 * Enrutamiento sugerido (Azure Front Door / Application Gateway / nginx):
 * - Enviar https://cardsocial.me/u/* a este backend, O exponer la misma ruta en api.cardsocial.me
 *   y usar el QR solo hacia el host que ejecute este handler.
 *
 * Si todo /u/* del dominio público se proxifica siempre al API, puede haber bucle al redirigir
 * de nuevo a /u/. En ese caso define UNIVERSAL_VALID_REDIRECT_USE_ROOT=1 para redirigir a
 * https://cardsocial.me/?universalToken=...&source=qr_scan (ruta que no reenvíes al API).
 */

const express = require('express');
const { env } = require('../config');
const { parseAndValidateTemporaryAccess } = require('../lib/temporaryAccessToken');

const EXPIRED_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Card-Social — Acceso expirado</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #000000; color: #d4af37; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      padding: 24px; text-align: center;
    }
    p { max-width: 22rem; line-height: 1.45; font-size: 1rem; }
  </style>
</head>
<body>
  <p>Este acceso ha expirado. Escanea el QR actualizado o únete al Búnker.</p>
</body>
</html>`;

function buildValidRedirectLocation(token) {
  const base = String(env.publicUniversalCardBaseUrl || 'https://cardsocial.me').replace(/\/+$/, '');
  const baseWithSlash = `${base}/`;

  if (env.universalValidRedirectUseRoot) {
    const u = new URL(baseWithSlash);
    u.searchParams.set('universalToken', token);
    u.searchParams.set('source', 'qr_scan');
    return u.toString();
  }

  const u = new URL(`u/${encodeURIComponent(token)}`, baseWithSlash);
  u.searchParams.set('source', 'qr_scan');
  return u.toString();
}

function createUniversalEntryHttpRoutes({ storage }) {
  const router = express.Router();

  router.get('/u/:token', async (req, res) => {
    try {
      const token = String(req.params.token || '').trim();
      const db = await storage.connect();
      const validation = await parseAndValidateTemporaryAccess(db, token);

      if (!validation.ok) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(EXPIRED_HTML);
      }

      const location = buildValidRedirectLocation(token);
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, location);
    } catch (error) {
      console.error('[GET /u/:token]', error?.message || error);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(EXPIRED_HTML);
    }
  });

  return router;
}

module.exports = {
  createUniversalEntryHttpRoutes,
};
