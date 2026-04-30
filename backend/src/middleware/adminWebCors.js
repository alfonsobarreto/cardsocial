/**
 * CORS explícito para el admin-web en Heroku (y orígenes extra vía ADMIN_CORS_ORIGINS).
 * Sin comodines: solo URLs listadas.
 *
 * Responde OPTIONS (preflight) con 204 y cabeceras completas; en el resto de métodos
 * fija Allow-Origin para que el navegador acepte la respuesta real.
 *
 * No envía Access-Control-Allow-Credentials: el admin-web usa fetch sin credentials: 'include'.
 *
 * Azure: si en el portal de App Service tenés "CORS" habilitado con reglas distintas,
 * puede pisar o anular lo que devuelve Node; en ese caso desactivá CORS en el portal
 * y dejá solo este middleware, o alineá los orígenes allí con los mismos valores.
 */

const DEFAULT_ADMIN_ORIGINS = ['https://cardsocial-admin-890673da6872.herokuapp.com'];

function normalizeOrigin(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '');
}

function buildAllowedOriginSet() {
  const set = new Set(DEFAULT_ADMIN_ORIGINS.map(normalizeOrigin));
  String(process.env.ADMIN_CORS_ORIGINS || '')
    .split(/[,;\s]+/)
    .map(normalizeOrigin)
    .filter(Boolean)
    .forEach((o) => set.add(o));
  return set;
}

function createAdminWebCorsMiddleware() {
  const allowedOrigins = buildAllowedOriginSet();

  return function adminWebCors(req, res, next) {
    const origin = normalizeOrigin(req.headers.origin);
    if (!origin || !allowedOrigins.has(origin)) {
      return next();
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      [
        'Content-Type',
        'Authorization',
        'x-api-gateway-key',
        'X-Api-Gateway-Key',
        'Accept',
        'Accept-Language',
      ].join(', '),
    );
    res.setHeader('Access-Control-Max-Age', '7200');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  };
}

module.exports = { createAdminWebCorsMiddleware };
