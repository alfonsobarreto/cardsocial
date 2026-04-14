const express = require("express");
const crypto = require('crypto');
const { sendAzureEmail } = require('./services/azureEmail');

const { env, assertRequiredConfig } = require("./config");
const { createAzureSafetyClient } = require("./services/azureSafety");
const { createMongoStorage } = require("./services/mongoStorage");
const { createModerationRoutes } = require("./routes/moderationRoutes");
const { createVaultFileProxyRoutes } = require("./routes/vaultFileProxyRoutes");
const { createQrRoutes } = require("./routes/qrRoutes");
const { createPublicUniversalRoutes } = require("./routes/publicUniversalRoutes");
const { createUniversalEntryHttpRoutes } = require("./routes/universalEntryHttpRoutes");
const revenueCatRoutes = require("./routes/revenueCatRoutes");
const { createAdminRoutes } = require("./routes/adminRoutes");
const { ensureMongoHardening } = require("./security/mongoHardening");
const {
  createGatewayKeyMiddleware,
  createJwtAuthMiddleware,
  createUploadScopeMiddleware,
  createQrScopeMiddleware,
  createTokenIssuer,
} = require("./middleware/strongAuth");

async function bootstrap() {

  assertRequiredConfig();

  const azureSafety = createAzureSafetyClient({
    endpoint: env.azureEndpoint,
    apiKey: env.azureApiKey,
    apiVersion: env.azureApiVersion,
  });

  const storage = createMongoStorage({
    uri: env.mongoUri,
    dbName: env.mongoDbName,
  });

  const db = await storage.connect();
  await ensureMongoHardening(db);

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.locals.db = db;

  // Universal Links verification files (iOS AASA + Android assetlinks)
  app.get('/.well-known/apple-app-site-association', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({
      applinks: {
        apps: [],
        details: [{ appID: 'APPLE_TEAM_ID.com.cardsocial.app', paths: ['/u/*'] }],
      },
    });
  });
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.cardsocial.app',
        sha256_cert_fingerprints: ['REPLACE_WITH_RELEASE_SHA256_FROM_PLAY_CONSOLE_OR_KEYTOOL'],
      },
    }]);
  });

  // --- Action Token Model ---
  const { createActionTokenModel } = require('./models/actionToken');
  const actionTokenModel = createActionTokenModel(db);

  const gatewayKeyMiddleware = createGatewayKeyMiddleware({
    apiGatewayKey: env.apiGatewayKey,
  });
  const jwtAuthMiddleware = createJwtAuthMiddleware({
    jwtSecret: env.jwtSecret,
    jwtIssuer: env.jwtIssuer,
    jwtAudience: env.jwtAudience,
  });
  const uploadScopeMiddleware = createUploadScopeMiddleware();
  const qrScopeMiddleware = createQrScopeMiddleware();
  const issueUploadToken = createTokenIssuer({
    jwtSecret: env.jwtSecret,
    jwtIssuer: env.jwtIssuer,
    jwtAudience: env.jwtAudience,
  });

  // --- Endpoint: Reset Password Link ---
  app.get('/reset-password', async (req, res) => {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.redirect('https://cardsocial.me/link-expired');
    }
    const found = await actionTokenModel.findValid(token, 'reset-password');
    if (!found) {
      return res.redirect('https://cardsocial.me/link-expired');
    }
    await actionTokenModel.markUsed(token);
    // Redirige al frontend con el token para que el usuario pueda cambiar su contraseña
    return res.redirect(`https://cardsocial.me/reset-password?token=${encodeURIComponent(token)}`);
  });

  // --- Endpoint: Email Verification Link ---
  app.get('/verify-email', async (req, res) => {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.redirect('https://cardsocial.me/link-expired');
    }
    const found = await actionTokenModel.findValid(token, 'verify-email');
    if (!found) {
      return res.redirect('https://cardsocial.me/link-expired');
    }
    await actionTokenModel.markUsed(token);
    // Aquí podrías marcar el email como verificado en la base de datos del usuario si lo deseas
    return res.redirect('https://cardsocial.me/verify-success');
  });

  const otpMailer = (env.azureEmailConnectionString && env.emailFrom)
    ? {
        sendMail: async ({ from, to, subject, text, html }) => {
          return sendAzureEmail({
            from,
            to,
            subject,
            text,
            html,
            connectionString: env.azureEmailConnectionString,
          });
        },
      }
    : null;

const otpHash = (emailLower, code) => {
  return crypto
    .createHash('sha256')
    .update(`${emailLower}:${code}:${env.emailOtpSecret}`)
    .digest('hex');
};

  const toSafeIso = (date) => {
    try {
      return new Date(date).toISOString();
    } catch {
      return new Date().toISOString();
    }
  };

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "moderation-backend" });
  });

  /**
   * Proxy de archivos vault → Spaces (sin URL DO pública).
   * - /api/vault/file/:id — legado; en Azure a veces WAF/Front Door no reenvía /api/vault/* al Node (0 logs).
   * - /api/qr/vault-proxy/file/:id — mismo handler; prefijo /api/qr suele estar permitido como el resto del API QR.
   */
  const vaultFileProxyRouter = createVaultFileProxyRoutes({ storage });
  app.use("/api/vault", vaultFileProxyRouter);

  /** QR universal: validación TTL en servidor antes de servir la SPA (ver README — proxy Azure). */
  app.use(createUniversalEntryHttpRoutes({ storage }));

  // Azure warmup probe commonly targets '/'. Keep it lightweight and always 200.
  app.get("/", (_req, res) => {
    res.status(200).send("ok");
  });

  app.post("/api/auth/token", gatewayKeyMiddleware, (req, res) => {
    try {
      const ownerUid = String(req.body?.ownerUid || "").trim();
      const requestedScope = String(req.body?.scope || "moderation.upload").trim();
      const allowedScopes = new Set(["moderation.upload", "qr.access"]);
      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: "ownerUid is required" });
      }
      if (!allowedScopes.has(requestedScope)) {
        return res.status(400).json({ ok: false, error: "scope is not allowed" });
      }

      const token = issueUploadToken({ ownerUid, scope: requestedScope });
      return res.status(200).json({ ok: true, token });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/auth/github/exchange", gatewayKeyMiddleware, async (req, res) => {
    try {
      const code = String(req.body?.code || '').trim();
      const redirectUri = String(req.body?.redirectUri || '').trim();

      if (!code) {
        return res.status(400).json({ ok: false, error: 'code is required' });
      }
      if (!redirectUri) {
        return res.status(400).json({ ok: false, error: 'redirectUri is required' });
      }
      if (!env.githubClientId || !env.githubClientSecret) {
        return res.status(500).json({ ok: false, error: 'GitHub OAuth backend credentials are not configured' });
      }

      const exchangeBody = new URLSearchParams({
        client_id: env.githubClientId,
        client_secret: env.githubClientSecret,
        code,
        redirect_uri: redirectUri,
      });

      const githubResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: exchangeBody.toString(),
      });

      const githubJson = await githubResponse.json().catch(() => ({}));
      const accessToken = String(githubJson?.access_token || '').trim();

      if (!githubResponse.ok || !accessToken) {
        const providerError = String(githubJson?.error_description || githubJson?.error || 'GitHub token exchange failed');
        return res.status(400).json({ ok: false, error: providerError });
      }

      return res.status(200).json({ ok: true, accessToken });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/auth/email-otp/send', gatewayKeyMiddleware, async (req, res) => {
    try {
      const emailLower = String(req.body?.email || '').trim().toLowerCase();
      if (!emailLower) {
        return res.status(400).json({ ok: false, error: 'email is required' });
      }
      if (!otpMailer || !env.emailFrom) {
        return res.status(500).json({ ok: false, error: 'Email OTP backend is not configured' });
      }

      const code = `${Math.floor(100000 + Math.random() * 900000)}`;
      const sessionId = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 1000);

      await db.collection('email_otps').updateMany(
        { emailLower, status: 'active' },
        { $set: { status: 'expired', expiredAt: new Date(), updatedAt: new Date() } }
      );

      await db.collection('email_otps').insertOne({
        sessionId,
        emailLower,
        codeHash: otpHash(emailLower, code),
        status: 'active',
        attempts: 0,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await otpMailer.sendMail({
        from: env.emailFrom,
        to: emailLower,
        subject: 'Card-Social OTP de verificación',
        text: `Tu código OTP de Card-Social es ${code}. Expira en 3 minutos.`,
        html: `<p>Tu código OTP de <strong>Card-Social</strong> es:</p><h2>${code}</h2><p>Expira en 3 minutos.</p>`,
      });

      return res.status(200).json({
        ok: true,
        sessionId,
        expiresAt: toSafeIso(expiresAt),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || 'email otp send failed' });
    }
  });

  app.post('/api/auth/email-otp/verify', gatewayKeyMiddleware, async (req, res) => {
    try {
      const emailLower = String(req.body?.email || '').trim().toLowerCase();
      const code = String(req.body?.code || '').trim();
      const sessionId = String(req.body?.sessionId || '').trim();
      if (!emailLower || !code || !sessionId) {
        return res.status(400).json({ ok: false, error: 'email, code and sessionId are required' });
      }

      const now = new Date();
      const otpDoc = await db.collection('email_otps').findOne({
        sessionId,
        emailLower,
      });

      if (!otpDoc) {
        return res.status(404).json({ ok: false, error: 'OTP session not found' });
      }
      if (otpDoc.status !== 'active') {
        return res.status(410).json({ ok: false, error: 'OTP is no longer active' });
      }
      if (!otpDoc.expiresAt || new Date(otpDoc.expiresAt).getTime() <= now.getTime()) {
        await db.collection('email_otps').updateOne(
          { _id: otpDoc._id },
          { $set: { status: 'expired', expiredAt: now, updatedAt: now } }
        );
        return res.status(410).json({ ok: false, error: 'OTP expired' });
      }

      const expectedHash = otpHash(emailLower, code);
      if (expectedHash !== String(otpDoc.codeHash || '')) {
        const attempts = Number(otpDoc.attempts || 0) + 1;
        await db.collection('email_otps').updateOne(
          { _id: otpDoc._id },
          {
            $set: {
              attempts,
              updatedAt: now,
              ...(attempts >= 5 ? { status: 'expired', expiredAt: now } : {}),
            },
          }
        );
        return res.status(401).json({ ok: false, error: attempts >= 5 ? 'OTP attempts exceeded' : 'OTP invalid' });
      }

      await db.collection('email_otps').updateOne(
        { _id: otpDoc._id },
        {
          $set: {
            status: 'verified',
            verifiedAt: now,
            updatedAt: now,
          },
        }
      );

      return res.status(200).json({ ok: true, verified: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || 'email otp verify failed' });
    }
  });

  app.post('/api/auth/email-otp/expire', gatewayKeyMiddleware, async (req, res) => {
    try {
      const emailLower = String(req.body?.email || '').trim().toLowerCase();
      const sessionId = String(req.body?.sessionId || '').trim();
      if (!emailLower || !sessionId) {
        return res.status(400).json({ ok: false, error: 'email and sessionId are required' });
      }

      await db.collection('email_otps').updateOne(
        { emailLower, sessionId, status: 'active' },
        { $set: { status: 'expired', expiredAt: new Date(), updatedAt: new Date() } }
      );

      return res.status(200).json({ ok: true, expired: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || 'email otp expire failed' });
    }
  });

  app.get('/api/favicon/fetch', gatewayKeyMiddleware, async (req, res) => {
    try {
      const rawUrl = String(req.query?.url || '').trim();
      if (!rawUrl) {
        return res.status(400).json({ ok: false, error: 'url is required' });
      }

      const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      const targetUrl = new URL(normalizedUrl);
      const pageResponse = await fetch(targetUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Card-Social-Favicon-Bot/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      const pageHtml = pageResponse.ok ? await pageResponse.text() : '';
      const iconHrefMatch = pageHtml.match(/<link[^>]+rel=["'][^"']*(?:icon|shortcut icon|apple-touch-icon)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i);

      const iconUrl = iconHrefMatch?.[1]
        ? new URL(iconHrefMatch[1], `${targetUrl.protocol}//${targetUrl.host}`).toString()
        : `https://www.google.com/s2/favicons?sz=128&domain=${targetUrl.hostname}`;

      return res.status(200).json({
        ok: true,
        domain: targetUrl.hostname,
        iconUrl,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || 'favicon fetch failed' });
    }
  });

  // Serve admin panel HTML at /admin and /admin/
  const _adminHtmlPath = require('path').resolve(__dirname, 'admin-panel.html');
  app.get(['/admin', '/admin/'], (_req, res) => {
    res.sendFile(_adminHtmlPath);
  });

  // Admin Routes (Marketing, Asset Minting, Stats)
  app.use("/api/admin", createAdminRoutes());

  app.use("/api/public", createPublicUniversalRoutes({ storage }));

  // Next.js frontend-web: proxy /u/:token and /_next/* to Next.js standalone server
  const nextWebDir = require('path').join(__dirname, '..', 'frontend-web');
  const fs = require('fs');
  if (fs.existsSync(nextWebDir)) {
    const { spawn } = require('child_process');
    const NEXT_PORT = 3001;
    const nextServer = spawn('node', ['server.js'], {
      cwd: nextWebDir,
      env: {
        ...process.env,
        PORT: String(NEXT_PORT),
        HOSTNAME: '127.0.0.1',
        // Next.js llama directo al backend Express en localhost para evitar loop de proxy
        INTERNAL_API_URL: `http://127.0.0.1:${env.port}`,
      },
      stdio: 'inherit',
    });
    nextServer.on('error', (e) => console.warn('[next-web] spawn error:', e.message));
    process.on('exit', () => nextServer.kill());

    const http = require('http');
    /**
     * Express, en `app.use('/legal', …)`, deja `req.url` sin el prefijo (/privacidad).
     * `req.originalUrl` a veces llega ya truncado detrás de Azure/iisnode → Next ve /privacidad y 404.
     * `req.baseUrl + req.url` reconstruye siempre la ruta pública (/legal/privacidad).
     */
    const nextProxy = (req, res) => {
      const pathWithQuery =
        req.baseUrl != null && req.baseUrl !== '' && typeof req.url === 'string'
          ? `${req.baseUrl}${req.url.startsWith('/') ? '' : '/'}${req.url}`
          : req.originalUrl || req.url;
      const options = {
        hostname: '127.0.0.1',
        port: NEXT_PORT,
        path: pathWithQuery,
        method: req.method,
        headers: req.headers,
      };
      const proxy = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });
      proxy.on('error', () => {
        if (!res.headersSent) res.status(502).send('Next.js not ready yet');
      });
      req.pipe(proxy, { end: true });
    };

    app.use('/u', nextProxy);
    app.use('/legal', nextProxy);
    app.use('/_next', nextProxy);
  } else {
    // Fallback: legacy HTML courtesy page
    app.use("/", createUniversalEntryHttpRoutes({ storage }));
  }

  const vaultPublicBase = String(env.publicVaultFileBaseUrl || "https://api.cardsocial.me").replace(/\/+$/, "");
  /** Ruta bajo /api/qr/* para evitar bloqueos de infra en /api/vault/*. */
  const buildVaultAccessUrl = (fileId) => `${vaultPublicBase}/api/qr/vault-proxy/file/${fileId}`;

  app.use("/api", createModerationRoutes({
    azureSafety,
    storage,
    limits: {
      imageMaxBytes: env.imageMaxBytes,
      docMaxBytes: env.docMaxBytes,
    },
    middlewares: [gatewayKeyMiddleware, jwtAuthMiddleware, uploadScopeMiddleware],
    buildVaultAccessUrl,
  }));

  app.use("/api/qr/vault-proxy", vaultFileProxyRouter);

  app.use("/api/qr", gatewayKeyMiddleware, jwtAuthMiddleware, qrScopeMiddleware, createQrRoutes({
    storage,
  }));

  // RevenueCat webhook routes (no auth middleware - validates API key internally)
  app.use("/api/revenueCat", revenueCatRoutes);

  app.use((err, _req, res, _next) => {
    res.status(500).json({ ok: false, error: err.message || "Unexpected error" });
  });

  const { runStorySpacesAssetCleanup } = require("./jobs/storySpacesCleanup");
  const STORY_SPACES_CLEANUP_MS = 24 * 60 * 60 * 1000;

  app.listen(env.port, () => {
    console.log(`Moderation backend running at http://localhost:${env.port}`);
    void runStorySpacesAssetCleanup(storage).catch((e) =>
      console.warn("[storySpacesCleanup] initial:", e?.message || e)
    );
    setInterval(() => {
      void runStorySpacesAssetCleanup(storage).catch((e) =>
        console.warn("[storySpacesCleanup] interval:", e?.message || e)
      );
    }, STORY_SPACES_CLEANUP_MS);
  });
}

bootstrap().catch((error) => {
  console.error("Fatal startup error:", error.message);
  process.exit(1);
});
