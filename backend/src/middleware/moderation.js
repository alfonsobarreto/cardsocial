/**
 * Azure Content Safety moderation middleware.
 *
 * When AZURE_CONTENT_SAFETY_KEY and AZURE_CONTENT_SAFETY_ENDPOINT are
 * configured the middleware calls the real Azure API.  When they are absent
 * (e.g. in a local/test environment) it simply passes through so that the
 * rest of the application keeps working.
 */

let createContentSafetyClient;
try {
  createContentSafetyClient = require('@azure-rest/ai-content-safety').default;
} catch (_) {
  // SDK not available – graceful fallback
}

let AzureKeyCredential;
try {
  AzureKeyCredential = require('@azure/core-auth').AzureKeyCredential;
} catch (_) {
  // graceful fallback
}

const THRESHOLD = 2; // Severity ≥ 2 triggers rejection

/**
 * Analyse a block of text through Azure Content Safety.
 * Returns { safe: boolean, reason: string }.
 */
const analyseText = async (text) => {
  const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
  const key = process.env.AZURE_CONTENT_SAFETY_KEY;

  if (!endpoint || !key || !createContentSafetyClient || !AzureKeyCredential) {
    return { safe: true, reason: '' };
  }

  try {
    const client = createContentSafetyClient(endpoint, new AzureKeyCredential(key));
    const result = await client.path('/text:analyze').post({ body: { text } });
    const categories = (result.body && result.body.categoriesAnalysis) || [];
    const flagged = categories.filter((c) => c.severity >= THRESHOLD);
    if (flagged.length > 0) {
      const reason = flagged.map((c) => `${c.category}(${c.severity})`).join(', ');
      return { safe: false, reason };
    }
    return { safe: true, reason: '' };
  } catch (err) {
    console.error('Azure Content Safety error – content allowed through (requires manual review):', err.message);
    return { safe: true, reason: '' };
  }
};

/**
 * Express middleware that checks req.body fields listed in `fields`.
 * Usage:  router.post('/', moderateContent(['bio', 'name']), handler)
 */
const moderateContent = (fields = ['bio', 'name']) => {
  return async (req, res, next) => {
    const text = fields
      .map((f) => req.body[f])
      .filter(Boolean)
      .join('\n');

    if (!text.trim()) return next();

    const { safe, reason } = await analyseText(text);
    if (!safe) {
      return res.status(422).json({
        message: 'Content flagged by moderation',
        reason,
      });
    }
    next();
  };
};

module.exports = { moderateContent, analyseText };
