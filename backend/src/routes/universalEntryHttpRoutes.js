/**
 * GET /u/:token — Portero HTTP (Azure).
 * Token inválido/expirado: 410 + HTML OLED (i18n Accept-Language).
 * Token válido: 200 + página de cortesía (countdown, slots públicos, CTA tienda + deep link).
 */

const express = require('express');
const { parseAndValidateTemporaryAccess } = require('../lib/temporaryAccessToken');
const {
  acceptLanguageIsSpanish,
  buildExpiredHtml,
  buildValidCourtesyPageHtml,
} = require('../lib/SmartCardLegacy');

function createUniversalEntryHttpRoutes({ storage }) {
  const router = express.Router();

  /**
   * GET /b/:bId no se define aquí: lo sirve Next.js (proxy en server.js) con BusinessCardWeb,
   * misma línea visual que /u/ y la app. El 24h sigue en /u/:token abajo.
   */

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
