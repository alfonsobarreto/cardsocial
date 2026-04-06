/**
 * Preferencia de idioma del cliente (Accept-Language).
 * Regla de producto: si no es estrictamente español → inglés.
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
