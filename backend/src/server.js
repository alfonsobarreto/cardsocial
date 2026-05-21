const express = require("express");
const crypto = require('crypto');

const { env, assertRequiredConfig } = require("./config");
const { buildUserFacingJson } = require("./lib/userFacingErrors");
const { createAzureSafetyClient } = require("./services/azureSafety");
const { createMongoStorage } = require("./services/mongoStorage");
const { createModerationRoutes } = require("./routes/moderationRoutes");
const { createVaultFileProxyRoutes } = require("./routes/vaultFileProxyRoutes");
const { createQrRoutes } = require("./routes/qrRoutes");
const { createBusinessCardsRoutes } = require("./routes/businessCardsRoutes");
const { createMarketVectorRoutes } = require("./routes/marketVectorRoutes");
const { createBusinessLicensesRoutes } = require("./routes/businessLicensesRoutes");
const { createSmartCardsRoutes } = require("./routes/smartCardsRoutes");
const { createPublicUniversalRoutes } = require("./routes/publicUniversalRoutes");
const { createUniversalEntryHttpRoutes } = require("./routes/universalEntryHttpRoutes");
const { createNfcRoutes } = require("./routes/nfcRoutes");
const { createNfcPublicRoutes } = require("./routes/nfcPublicRoutes");
const { attachPublicEmailSignatureQrRoute } = require("./routes/publicEmailSignatureQrRoutes");
const revenueCatRoutes = require("./routes/revenueCatRoutes");
const { createAdminRoutes } = require("./routes/adminRoutes");
const { createAdminMediaRouter, getAdminMediaUploadsDir } = require("./routes/adminMediaRoutes");
const { createAdminSystemStatsHandler } = require("./routes/adminSystemStatsRoutes");
const { createAdminBudgetHandlers } = require("./routes/adminBudgetRoutes");
const { createBroadcastRouter } = require("./routes/broadcastRoutes");
const { createAuthVerificationEmailRouter } = require("./routes/authVerificationEmailRoutes");
const { EMAIL_SENDERS } = require("./config/emailSenders");
const { ensureMongoHardening } = require("./security/mongoHardening");
const {
  createGatewayKeyMiddleware,
  createJwtAuthMiddleware,
  createScopeMiddleware,
  createUploadScopeMiddleware,
  createQrScopeMiddleware,
  createTokenIssuer,
} = require("./middleware/strongAuth");
const { createAdminWebCorsMiddleware } = require("./middleware/adminWebCors");

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
  app.set("trust proxy", 1);
  /** Debe ir antes de express.json y de las rutas para que OPTIONS (preflight) reciba cabeceras CORS. */
  app.use(createAdminWebCorsMiddleware());
  app.use(express.json({ limit: "2mb" }));
  const fsEarly = require("fs");
  const adminPublicUploadsDir = getAdminMediaUploadsDir();
  try {
    fsEarly.mkdirSync(adminPublicUploadsDir, { recursive: true });
  } catch (e) {
    console.warn("[media] Could not mkdir uploads:", e?.message || e);
  }
  app.use(
    "/uploads",
    express.static(adminPublicUploadsDir, {
      maxAge: "7d",
      fallthrough: true,
    }),
  );
  app.locals.db = db;

  // Universal Links verification files (iOS AASA + Android assetlinks)
  app.get('/.well-known/apple-app-site-association', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({
      applinks: {
        apps: [],
        details: [
          { appID: 'APPLE_TEAM_ID.com.cardsocial.app', paths: ['/u/*', '/b/*'] },
        ],
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
  const {
    sendEmail,
    isEmailSendConfigured,
    usernameRecoveryTemplate,
    accountDeletionScheduledTemplate,
  } = require('./services/email.service');

  /** Una sola fuente: `env.apiGatewayKey` ← `process.env.API_GATEWAY_KEY` (Portal Azure). */
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

  const adminConsoleUidAllowlist = new Set(
    [
      ...String(process.env.ADMIN_SYSTEM_STATS_UIDS || "")
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      ...String(process.env.ADMIN_BROADCAST_UIDS || "")
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ],
  );
  const adminSystemStatsHandler = createAdminSystemStatsHandler({ getMongoDb: () => db });
  const { budgetSummaryHandler, budgetSettingsPutHandler } = createAdminBudgetHandlers({
    getMongoDb: () => db,
  });
  const adminSystemScopeMiddleware = createScopeMiddleware("admin.system");
  const adminBroadcastScopeMiddleware = createScopeMiddleware("admin.broadcast");
  const broadcastRouter = createBroadcastRouter({ getMongoDb: () => db });

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

  /** Mismo canal Resend que `email.service.sendEmail` (borrado de cuenta, broadcast, etc.). */
  const otpMailer = isEmailSendConfigured()
    ? {
        sendMail: async ({ from, to, subject, text, html }) => {
          await sendEmail({
            to,
            subject,
            html: html || `<p>${String(text || '').replace(/</g, '&lt;')}</p>`,
            text: text || '',
            from: from || EMAIL_SENDERS.verification,
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

  /**
   * La raíz `/` la sirve Next (landing `frontend-web/app/page.tsx`).
   * Health / probes: usar `GET /api/health` (JSON), no `/` con texto "ok".
   */

  app.use("/api/auth", createAuthVerificationEmailRouter());

  /**
   * Fallback app → mismo Mongo que moderation: resuelve @nick o fragmento tipo email → email(es) Firebase Auth.
   * Útil si `/api/studio/resolve-username` no está alcanzable desde producción móvil.
   */
  app.post("/api/auth/resolve-sign-in-email", gatewayKeyMiddleware, async (req, res) => {
    try {
      const rawIn = String(req.body?.username || req.body?.query || "").trim();
      const raw = rawIn.replace(/^@+/u, "").trim();
      if (!raw) {
        return res.status(400).json({ ok: false, error: "username_or_email_required" });
      }

      const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
      const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const pickSignInEmails = (user) => {
        const primary = String(user?.emailLower || user?.email || "")
          .trim()
          .toLowerCase();
        const pending = String(user?.pendingEmailLower || user?.pendingEmail || "")
          .trim()
          .toLowerCase();
        return Array.from(new Set([primary, pending].filter((email) => EMAIL_LIKE.test(email))));
      };

      const lookupPrimaryEmailFromMongoUserDoc = async (filter) => {
        const user = await db.collection("users").findOne(filter, {
          projection: { emailLower: 1, email: 1, pendingEmailLower: 1, pendingEmail: 1 },
        });
        const emails = pickSignInEmails(user);
        return emails.length ? emails : null;
      };

      const lookupPrimaryEmailFromFirestoreUserDoc = async (field, value) => {
        try {
          const { getFirestoreOptional } = require('./lib/firebaseAdminApp');
          const fs = getFirestoreOptional();
          if (!fs) return null;
          const snap = await fs.collection("users").where(field, "==", value).limit(1).get();
          if (snap.empty) return null;
          const emails = pickSignInEmails(snap.docs[0].data());
          return emails.length ? emails : null;
        } catch (firestoreError) {
          console.warn("[resolve-sign-in-email] Firestore lookup skipped", field, firestoreError?.message || firestoreError);
          return null;
        }
      };

      let emails = null;

      if (raw.includes("@")) {
        const lower = raw.toLowerCase();
        emails =
          (await lookupPrimaryEmailFromFirestoreUserDoc("emailLower", lower)) ||
          (await lookupPrimaryEmailFromFirestoreUserDoc("email", lower)) ||
          (await lookupPrimaryEmailFromMongoUserDoc({
          $or: [{ emailLower: lower }, { email: new RegExp(`^${escapeRe(lower)}$`, "iu") }],
        }));
      } else {
        const lower = raw.toLowerCase();
        const nickRe = new RegExp(`^${escapeRe(raw)}$`, "iu");
        emails =
          (await lookupPrimaryEmailFromFirestoreUserDoc("userNickNameLower", lower)) ||
          (await lookupPrimaryEmailFromFirestoreUserDoc("nicknameLower", lower)) ||
          (await lookupPrimaryEmailFromFirestoreUserDoc("userNickName", raw)) ||
          (await lookupPrimaryEmailFromFirestoreUserDoc("nickname", raw)) ||
          (await lookupPrimaryEmailFromMongoUserDoc({
          $or: [{ userNickName: nickRe }, { nickname: nickRe }],
        }));
      }

      if (!emails?.length) {
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      return res.status(200).json({ ok: true, emails, email: emails[0] });
    } catch (error) {
      console.error("[/api/auth/resolve-sign-in-email]", error?.message || error, error?.stack);
      return res.status(500).json(buildUserFacingJson(req, "server_error", "SERVER_INTERNAL_ERROR"));
    }
  });

  app.post("/api/auth/token", gatewayKeyMiddleware, (req, res) => {
    try {
      const uid = String(req.body?.uid || "").trim();
      const requestedScope = String(req.body?.scope || "moderation.upload").trim();
      const allowedScopes = new Set(["moderation.upload", "qr.access", "admin.system", "admin.broadcast"]);
      if (!uid) {
        return res.status(400).json({ ok: false, error: "uid is required" });
      }
      if (!allowedScopes.has(requestedScope)) {
        return res.status(400).json({ ok: false, error: "scope is not allowed" });
      }
      if (requestedScope === "admin.system" || requestedScope === "admin.broadcast") {
        if (!adminConsoleUidAllowlist.has(uid)) {
          return res.status(403).json(
            buildUserFacingJson(req, 'admin_restricted', 'ADMIN_CONSOLE_TOKEN_SCOPE_DENIED'),
          );
        }
      }

      const token = issueUploadToken({ uid, scope: requestedScope });
      return res.status(200).json({ ok: true, token });
    } catch (error) {
      console.error("[/api/auth/token]", error?.message || error, error?.stack);
      return res.status(500).json(buildUserFacingJson(req, "server_error", "SERVER_INTERNAL_ERROR"));
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
      console.error("[/api/auth/github/exchange]", error?.message || error, error?.stack);
      return res.status(500).json(buildUserFacingJson(req, "server_error", "SERVER_INTERNAL_ERROR"));
    }
  });

  app.post('/api/auth/email-otp/send', gatewayKeyMiddleware, async (req, res) => {
    try {
      const emailLower = String(req.body?.email || '').trim().toLowerCase();
      if (!emailLower) {
        return res.status(400).json({ ok: false, error: 'email is required' });
      }
      if (!otpMailer) {
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
        from: EMAIL_SENDERS.verification,
        to: emailLower,
        subject: 'Card-Social OTP de verificación',
        text: `Tu código OTP de Card-Social es ${code}. Caduca en 1 minuto. Si no ves el correo en la bandeja principal, revisa Spam; como empresa nueva, algunos filtros retienen el primer mensaje.`,
        html: `<p>Tu código OTP de <strong>Card-Social</strong> es:</p><h2>${code}</h2><p>Caduca en 1 minuto.</p><p style="font-size:13px;color:#555;">Si no ves este mensaje en la bandeja de entrada, revisa <strong>Spam</strong> o correo no deseado. Como empresa en crecimiento, algunos proveedores filtran con más cautela hasta generar reputación con <strong>cardsocial.me</strong>.</p>`,
      });

      return res.status(200).json({
        ok: true,
        sessionId,
        expiresAt: toSafeIso(expiresAt),
      });
    } catch (error) {
      console.error("[/api/auth/email-otp/send]", error?.message || error, error?.stack);
      return res.status(500).json(buildUserFacingJson(req, "server_error", "SERVER_INTERNAL_ERROR"));
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
      console.error("[/api/auth/email-otp/verify]", error?.message || error, error?.stack);
      return res.status(500).json(buildUserFacingJson(req, "server_error", "SERVER_INTERNAL_ERROR"));
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
      console.error("[/api/auth/email-otp/expire]", error?.message || error, error?.stack);
      return res.status(500).json(buildUserFacingJson(req, "server_error", "SERVER_INTERNAL_ERROR"));
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
      console.error("[/api/favicon/fetch]", error?.message || error, error?.stack);
      return res.status(500).json(buildUserFacingJson(req, "server_error", "SERVER_INTERNAL_ERROR"));
    }
  });

  // Serve admin panel HTML at /admin and /admin/
  const _adminHtmlPath = require('path').resolve(__dirname, 'admin-panel.html');
  app.get(['/admin', '/admin/'], (_req, res) => {
    res.sendFile(_adminHtmlPath);
  });

  /**
   * Estadísticas sistema (Mongo) para admin-web Growth.
   Auth: API gateway key + JWT emitido por POST /api/auth/token con scope admin.system.
   */
  app.get(
    "/api/admin/system-stats",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    adminSystemScopeMiddleware,
    adminSystemStatsHandler,
  );

  app.get(
    "/api/admin/budget-summary",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    adminSystemScopeMiddleware,
    budgetSummaryHandler,
  );
  app.put(
    "/api/admin/budget-settings",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    adminSystemScopeMiddleware,
    budgetSettingsPutHandler,
  );

  app.use(
    "/api/admin/broadcast",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    adminBroadcastScopeMiddleware,
    broadcastRouter,
  );

  app.use(
    "/api/admin/media",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    adminSystemScopeMiddleware,
    createAdminMediaRouter({ uploadDir: adminPublicUploadsDir }),
  );

  // Admin Routes (marketing, market asset drafts, stats)
  app.use(
    "/api/admin",
    createAdminRoutes({
      gatewayKeyMiddleware,
      jwtAuthMiddleware,
      adminSystemScopeMiddleware,
    }),
  );

  app.use("/api/public", createPublicUniversalRoutes({ storage }));
  app.use("/n", createNfcPublicRoutes({ storage }));

  // Next.js frontend-web: ficha pública, legal, Card Studio, login, assets.
  // Sin estos montajes Express responde 404 aunque Next esté levantado (p. ej. /studio, /login).
  // /api/studio/* es Route Handler en Next (p. ej. resolve-username); debe ir a Next antes de app.use("/api", …).
  // En monorepo la app real suele estar en `repo/frontend-web`; `backend/frontend-web` a veces es solo stub de deploy.
  const pathMod = require('path');
  const fs = require('fs');
  const resolveNextWebDir = () => {
    const candidates = [
      pathMod.join(__dirname, '..', '..', 'frontend-web'),
      pathMod.join(__dirname, '..', 'frontend-web'),
    ];
    const hasRoutes = (dir) =>
      fs.existsSync(dir) &&
      (fs.existsSync(pathMod.join(dir, 'app')) || fs.existsSync(pathMod.join(dir, 'pages')));
    for (const dir of candidates) {
      if (hasRoutes(dir)) return dir;
    }
    return candidates.find((d) => fs.existsSync(d)) ?? candidates[1];
  };
  const nextWebDir = resolveNextWebDir();
  if (fs.existsSync(nextWebDir)) {
    const { spawn } = require('child_process');
    const NEXT_PORT = 3001;
    const nextEnv = {
      ...process.env,
      PORT: String(NEXT_PORT),
      HOSTNAME: '127.0.0.1',
      // Next.js llama directo al backend Express en localhost para evitar loop de proxy
      INTERNAL_API_URL: `http://127.0.0.1:${env.port}`,
    };
    // Selección del modo Next por presencia de archivos, no por NODE_ENV
    // (Azure App Service no siempre expone NODE_ENV='production' al proceso padre,
    //  y el launcher standalone ya fija internamente NODE_ENV='production').
    // Orden de preferencia:
    //   1) standalone launcher `server.js` + `.next/BUILD_ID` → producción real (lo que CI sube a Azure)
    //   2) `next dev` si hay código fuente (`app/` o `pages/`) y CLI disponible → dev local
    //   3) `next start` si hay build de producción real (`.next/BUILD_ID`) y CLI disponible
    // Nota: `.next/` puede existir como cache de `next dev` SIN ser un build de producción.
    //       Por eso detectamos build válido por la presencia de `.next/BUILD_ID`.
    const nextBuildDir = pathMod.join(nextWebDir, '.next');
    const nextBuildIdFile = pathMod.join(nextBuildDir, 'BUILD_ID');
    const standaloneLauncher = pathMod.join(nextWebDir, 'server.js');
    const nextBin = pathMod.join(nextWebDir, 'node_modules', 'next', 'dist', 'bin', 'next');
    const hasProdBuild = fs.existsSync(nextBuildIdFile);
    const hasStandalone = hasProdBuild && fs.existsSync(standaloneLauncher);
    const hasNextCli = fs.existsSync(nextBin);
    const hasSource =
      fs.existsSync(pathMod.join(nextWebDir, 'app')) ||
      fs.existsSync(pathMod.join(nextWebDir, 'pages'));

    let nextServer = null;
    if (hasStandalone) {
      nextServer = spawn('node', ['server.js'], {
        cwd: nextWebDir,
        env: nextEnv,
        stdio: 'inherit',
      });
      console.log('[next-web] standalone server.js spawned at', nextWebDir);
    } else if (hasSource && hasNextCli) {
      nextServer = spawn(process.execPath, [nextBin, 'dev', '-p', String(NEXT_PORT)], {
        cwd: nextWebDir,
        env: nextEnv,
        stdio: 'inherit',
      });
      console.log('[next-web] next dev spawned at', nextWebDir);
    } else if (hasProdBuild && hasNextCli) {
      nextServer = spawn(process.execPath, [nextBin, 'start', '-p', String(NEXT_PORT)], {
        cwd: nextWebDir,
        env: { ...nextEnv, NODE_ENV: 'production' },
        stdio: 'inherit',
      });
      console.log('[next-web] next start spawned at', nextWebDir);
    } else {
      console.warn(
        '[next-web] No se pudo arrancar Next. dir=%s hasProdBuild=%s hasStandalone=%s hasNextCli=%s hasSource=%s',
        nextWebDir,
        hasProdBuild,
        hasStandalone,
        hasNextCli,
        hasSource,
      );
    }
    if (nextServer) {
      nextServer.on('error', (e) => console.warn('[next-web] spawn error:', e.message));
      process.on('exit', () => nextServer.kill());
    }

    const http = require('http');
    /**
     * Express, en `app.use('/legal', …)`, deja `req.url` sin el prefijo (/privacidad).
     * `req.originalUrl` a veces llega ya truncado detrás de Azure/iisnode → Next ve /privacidad y 404.
     * `req.baseUrl + req.url` reconstruye siempre la ruta pública (/legal/privacidad).
     */
    const nextProxy = (req, res) => {
      let pathWithQuery;
      if (req.baseUrl != null && req.baseUrl !== '' && typeof req.url === 'string') {
        const tail = req.url;
        // Montajes exactos (p. ej. app.use('/icon.png')) suelen llegar con tail '' o '/'.
        if (tail === '' || tail === '/') {
          pathWithQuery = req.baseUrl;
        } else if (tail.startsWith('/')) {
          pathWithQuery = `${req.baseUrl}${tail}`;
        } else {
          pathWithQuery = `${req.baseUrl}/${tail}`;
        }
      } else {
        pathWithQuery = req.originalUrl || req.url;
      }
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
    app.use('/b', nextProxy);
    app.use('/legal', nextProxy);
    app.use('/es', nextProxy);
    app.use('/executive-summary', nextProxy);
    app.use('/studio', nextProxy);
    app.use('/login', nextProxy);
    app.use('/api/studio', nextProxy);
    app.use('/api/waitlist', nextProxy);
    app.use('/api/email-signature', nextProxy);
    app.use('/api/embed', nextProxy);
    app.use('/embed', nextProxy);
    app.use('/_next', nextProxy);
    // File conventions del App Router (metadata): sin proxy el navegador pide /icon.png y Express no lo reenvía a Next.
    app.use('/icon.png', nextProxy);
    app.use('/apple-icon.png', nextProxy);
    app.get('/favicon.ico', (_req, res) => {
      res.redirect(302, '/icon.png');
    });
    app.get('/', nextProxy);
  } else {
    // Fallback: legacy HTML courtesy page
    app.use("/", createUniversalEntryHttpRoutes({ storage }));
  }

  /**
   * Firma HTML (correo): mismo PNG que Next (`/api/qr/generate`) pero generado aquí —
   * no dependemos de proxear al proceso Next en :3001 (frágil en producción).
   * Público, sin JWT. Debe registrar antes de `/api` y de `/api/qr` protegidos.
   */
  attachPublicEmailSignatureQrRoute(app);

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

  app.post('/api/account/deletion-scheduled-notify', gatewayKeyMiddleware, async (req, res) => {
    const { verifyFirebaseIdToken } = require('./lib/firebaseAdminApp');
    const { getFirestoreOptional } = require('./lib/firebaseAdminApp');

    try {
      const authHeader = String(req.headers.authorization || '');
      const idToken = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';
      if (!idToken) {
        return res.status(401).json(buildUserFacingJson(req, 'auth_forbidden', 'missing_token'));
      }

      let decoded;
      try {
        decoded = await verifyFirebaseIdToken(idToken);
      } catch (e) {
        console.error('[account/deletion-scheduled-notify] token', e?.message || e);
        return res.status(401).json(buildUserFacingJson(req, 'auth_forbidden', 'invalid_token'));
      }

      const uid = String(decoded.uid || '').trim();
      const emailTo = String(decoded.email || '').trim().toLowerCase();
      if (!uid || !emailTo) {
        return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'no_email_on_token'));
      }

      const body = req.body || {};
      const deadlineIso = String(body.deadlineIso || '').trim();
      const locale = body.locale === 'en' ? 'en' : 'es';
      const intlLocaleTag = String(body.intlLocaleTag || (locale === 'es' ? 'es-MX' : 'en-US')).slice(0, 32);
      const firstName = String(body.firstName || '').trim().slice(0, 80);

      if (!deadlineIso || Number.isNaN(Date.parse(deadlineIso))) {
        return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'invalid_deadline_iso'));
      }

      const fs = getFirestoreOptional();
      if (!fs) {
        return res.status(503).json(buildUserFacingJson(req, 'auth_forbidden', 'firestore_admin_unavailable'));
      }

      const userRef = fs.collection('users').doc(uid);
      const snap = await userRef.get();
      if (!snap.exists || !snap.data()?.pendingDeletion) {
        return res.status(409).json(buildUserFacingJson(req, 'auth_forbidden', 'not_marked_for_deletion'));
      }

      const dd = snap.data().deletionDeadline;
      let deadlineMs;
      if (dd && typeof dd.toMillis === 'function') deadlineMs = dd.toMillis();
      else if (dd instanceof Date) deadlineMs = dd.getTime();
      else deadlineMs = new Date(dd).getTime();

      const isoMs = Date.parse(deadlineIso);
      if (!Number.isFinite(deadlineMs) || !Number.isFinite(isoMs) || Math.abs(deadlineMs - isoMs) > 120000) {
        return res.status(409).json(buildUserFacingJson(req, 'auth_forbidden', 'deadline_mismatch'));
      }

      const deadlineDate = new Date(deadlineIso);
      const deadlineFormatted = deadlineDate.toLocaleDateString(intlLocaleTag, {
        year: 'numeric',
        month: 'long',
        day: '2-digit',
      });

      const { html, text, subject } = accountDeletionScheduledTemplate({
        firstName,
        deadlineFormatted,
        locale,
      });

      await sendEmail({ to: emailTo, subject, html, text, from: EMAIL_SENDERS.verification });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[account/deletion-scheduled-notify]', error);
      return res.status(500).json(buildUserFacingJson(req, 'auth_forbidden', 'send_failed'));
    }
  });

  app.post("/api/recovery/username", gatewayKeyMiddleware, async (req, res) => {
    const generic = {
      ok: true,
      message: "Si encontramos una cuenta con ese telefono, enviaremos el usuario al email registrado.",
    };
    try {
      const rawPhone = String(req.body?.phone || "").trim();
      const phoneNormalized = rawPhone.replace(/[^\d+]/g, "");
      if (!phoneNormalized || phoneNormalized.length < 8 || phoneNormalized.length > 18) {
        return res.status(200).json(generic);
      }
      const candidates = Array.from(
        new Set([
          phoneNormalized,
          phoneNormalized.startsWith("+") ? phoneNormalized.slice(1) : `+${phoneNormalized}`,
          rawPhone,
        ].filter(Boolean)),
      );
      const user = await db.collection("users").findOne({
        $or: [
          { phoneNormalized: { $in: candidates } },
          { phone: { $in: candidates } },
        ],
      });
      if (user) {
        const email = String(user.emailLower || user.email || "").trim().toLowerCase();
        const username = String(user.userNickName || user.nickname || "").trim().replace(/^@+/, "");
        if (email && username) {
          await sendEmail({
            to: email,
            subject: "Tu usuario de Card-Social",
            html: usernameRecoveryTemplate({ username }),
            text: `Tu usuario de Card-Social es @${username}. Si no solicitaste esta ayuda, ignora este correo.`,
            from: EMAIL_SENDERS.support,
          });
        }
      }
      return res.status(200).json(generic);
    } catch (error) {
      console.error("[recovery/username]", error);
      return res.status(200).json(generic);
    }
  });

  app.use("/api/qr/vault-proxy", vaultFileProxyRouter);

  app.use("/api/qr", gatewayKeyMiddleware, jwtAuthMiddleware, qrScopeMiddleware, createQrRoutes({
    storage,
  }));

  app.use(
    "/api/nfc",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    qrScopeMiddleware,
    createNfcRoutes({ storage }),
  );

  app.use(
    "/api/business-cards",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    qrScopeMiddleware,
    createBusinessCardsRoutes({ storage }),
  );

  app.use(
    "/api/market",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    qrScopeMiddleware,
    createMarketVectorRoutes({ storage }),
  );

  app.use(
    "/api/smart-cards",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    qrScopeMiddleware,
    createSmartCardsRoutes({ storage }),
  );

  app.use(
    "/api/business-card-licenses",
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    qrScopeMiddleware,
    createBusinessLicensesRoutes({ storage }),
  );

  // RevenueCat webhook routes (no auth middleware - validates API key internally)
  app.use("/api/revenueCat", revenueCatRoutes);

  app.use((err, req, res, _next) => {
    console.error("[Express error]", err?.stack || err?.message || err);
    res.status(500).json(buildUserFacingJson(req, "server_error", "SERVER_INTERNAL_ERROR"));
  });

  const PORT = env.port;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Moderation backend listening on 0.0.0.0:${PORT} (LAN: http://<tu-ip>:${PORT})`
    );
  });
}

bootstrap().catch((error) => {
  console.error("Fatal startup error:", error.message);
  process.exit(1);
});
