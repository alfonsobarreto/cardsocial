const jwt = require('jsonwebtoken');

function getBearerToken(authHeader) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

function createGatewayKeyMiddleware({ apiGatewayKey }) {
  return function gatewayKeyMiddleware(req, res, next) {
    const provided = String(req.header('x-api-gateway-key') || '').trim();
    if (!provided || provided !== apiGatewayKey) {
      return res.status(401).json({ ok: false, error: 'Missing or invalid API Gateway key' });
    }
    return next();
  };
}

function createJwtAuthMiddleware({ jwtSecret, jwtIssuer, jwtAudience }) {
  return function jwtAuthMiddleware(req, res, next) {
    const token = getBearerToken(req.header('authorization'));
    if (!token) {
      return res.status(401).json({ ok: false, error: 'Missing Bearer JWT token' });
    }

    try {
      const decoded = jwt.verify(token, jwtSecret, {
        issuer: jwtIssuer,
        audience: jwtAudience,
        algorithms: ['HS256'],
      });
      req.auth = decoded;
      return next();
    } catch (error) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired JWT token' });
    }
  };
}

function createScopeMiddleware(expectedScope) {
  return function scopeMiddleware(req, res, next) {
    const scope = String(req.auth?.scope || '');
    if (scope !== String(expectedScope || '')) {
      return res.status(403).json({ ok: false, error: 'JWT scope not allowed for this endpoint' });
    }
    return next();
  };
}

function createUploadScopeMiddleware() {
  return createScopeMiddleware('moderation.upload');
}

function createQrScopeMiddleware() {
  return createScopeMiddleware('qr.access');
}

function createTokenIssuer({ jwtSecret, jwtIssuer, jwtAudience }) {
  return function issueUploadToken(payload) {
    const uid = String(payload.uid || payload.ownerUid || '').trim();
    if (!uid) {
      throw new Error('uid is required to issue token');
    }

    const scope = String(payload.scope || 'moderation.upload').trim();

    return jwt.sign(
      {
        sub: uid,
        scope,
      },
      jwtSecret,
      {
        issuer: jwtIssuer,
        audience: jwtAudience,
        expiresIn: '5m',
      }
    );
  };
}

module.exports = {
  createGatewayKeyMiddleware,
  createJwtAuthMiddleware,
  createScopeMiddleware,
  createUploadScopeMiddleware,
  createQrScopeMiddleware,
  createTokenIssuer,
};
