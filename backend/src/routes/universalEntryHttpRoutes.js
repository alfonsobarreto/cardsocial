/**
 * GET /u/:token — Portero HTTP (Azure).
 * Token inválido/expirado: 410 + HTML OLED (i18n Accept-Language).
 * Token válido: 200 + página de cortesía (countdown, slots públicos, CTA tienda + deep link).
 */

const express = require('express');
const { parseAndValidateTemporaryAccess } = require('../lib/temporaryAccessToken');
const { env } = require('../config');
const axios = require('axios');
const {
  acceptLanguageIsSpanish,
  buildExpiredHtml,
  buildValidCourtesyPageHtml,
} = require('../lib/universalCourtesyHtml');
const {
  buildBusinessCardPublicPageHtml,
  buildBusinessNotFoundHtml,
} = require('../lib/businessPublicHtml');

function createUniversalEntryHttpRoutes({ storage }) {
  const router = express.Router();

  /**
   * GET /b/:bId — ficha pública de negocio (HTML) sin depender de Next en el despliegue.
   * Datos: GET /api/public/business-card-preview (misma fuente que la app y frontend-web).
   */
  router.get('/b/:bId', async (req, res) => {
    const bId = String(req.params.bId || '').trim();
    const uid = String(req.query.uid || req.query.owner || '').trim();
    const acceptLang = req.headers['accept-language'] || '';
    const isEs = acceptLanguageIsSpanish(acceptLang);
    if (!bId || !uid) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      const msg = isEs
        ? 'Falta <code>uid</code> en el enlace. Usa el enlace completo del negocio (incluye ?uid=…).'
        : 'Missing <code>uid</code> in the link. Use the full business link (including ?uid=…).';
      return res.status(400).send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Card-Social</title></head><body style="font-family:system-ui,sans-serif;padding:24px;">${msg}</body></html>`,
      );
    }
    try {
      const base = `http://127.0.0.1:${env.port}/api/public/business-card-preview`;
      const { data, status } = await axios.get(base, {
        params: { bId, uid },
        timeout: 20000,
        validateStatus: () => true,
      });
      if (status !== 200 || !data || !data.ok) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).send(buildBusinessNotFoundHtml(isEs));
      }
      const html = buildBusinessCardPublicPageHtml(data, { bId, uid, isEs });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(html);
    } catch (error) {
      console.error('[GET /b/:bId]', error?.message || error);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).send(buildBusinessNotFoundHtml(isEs));
    }
  });

  router.get('/u/:token', async (req, res) => {
    try {
      const token = String(req.params.token || '').trim();
      const acceptLang = req.headers['accept-language'] || '';
      const isEs = acceptLanguageIsSpanish(acceptLang);

      const db = await storage.connect();
      const validation = await parseAndValidateTemporaryAccess(db, token);

      if (!validation.ok) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(410).send(buildExpiredHtml(isEs));
      }

      const expiresAtIso = validation.expiresAt.toISOString();
      const apiPrefix = String(process.env.PUBLIC_API_HTML_PREFIX || '').trim().replace(/\/+$/, '');

      const html = buildValidCourtesyPageHtml({
        token,
        expiresAtIso,
        isEs,
        apiPrefix,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(html);
    } catch (error) {
      console.error('[GET /u/:token]', error?.message || error);
      const isEs = acceptLanguageIsSpanish(req.headers['accept-language'] || '');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).send(buildExpiredHtml(isEs));
    }
  });

  return router;
}

module.exports = {
  createUniversalEntryHttpRoutes,
};
