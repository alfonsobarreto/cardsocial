/**
 * Preferencia de idioma del cliente (Accept-Language).
 * Regla: solo español (primer tag `es*`). Cualquier otro (en, de, zh, fr, vacío) → tratar como inglés (fallback USA).
 */

function acceptLanguageHeaderIsSpanish(acceptLanguageHeader) {
  const first = String(acceptLanguageHeader || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return first.startsWith('es');
}

function clientLocaleIsSpanish(req) {
  const h = req?.headers?.['accept-language'] ?? req?.headers?.['Accept-Language'] ?? '';
  return acceptLanguageHeaderIsSpanish(h);
}

module.exports = {
  acceptLanguageHeaderIsSpanish,
  clientLocaleIsSpanish,
};
