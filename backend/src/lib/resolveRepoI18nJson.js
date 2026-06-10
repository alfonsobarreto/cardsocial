/**
 * Carga JSON de i18n compartidos con la app (`services/i18n/*`).
 * En Azure wwwroot solo existe `backend/` — no el monorepo completo.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {string} fileName e.g. `emailLocales.json`
 * @returns {string} primera ruta existente o la candidata preferida para logs
 */
function resolveRepoI18nJsonPath(fileName) {
  const base = String(fileName || '').trim();
  if (!base) return '';

  const candidates = [
    path.join(process.cwd(), 'i18n', base),
    path.join(__dirname, '../../i18n', base),
    path.join(__dirname, '../i18n', base),
    path.join(__dirname, '../../../services/i18n', base),
    path.join(process.cwd(), 'services/i18n', base),
    path.join(process.cwd(), '..', 'services/i18n', base),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return candidates[0];
}

/**
 * @param {string} fileName
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function readRepoI18nJson(fileName, label) {
  const abs = resolveRepoI18nJsonPath(fileName);
  try {
    if (!abs || !fs.existsSync(abs)) {
      console.warn(`[i18n] ${label}: missing at ${abs || fileName} — using {}`);
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error(`[i18n] ${label} read failed (${abs}):`, err?.message || err);
    return {};
  }
}

module.exports = {
  resolveRepoI18nJsonPath,
  readRepoI18nJson,
};
