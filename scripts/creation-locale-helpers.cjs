/**
 * @param {Record<string, [string, string, object?]>} map
 */
function s(map) {
  const out = {};
  for (const [key, tup] of Object.entries(map)) {
    const [es, en, extra] = tup;
    out[key] = {
      es,
      en,
      it: extra?.it ?? en,
      pt: extra?.pt ?? en,
      fr: extra?.fr ?? en,
      de: extra?.de ?? en,
    };
  }
  return out;
}

module.exports = { s };
