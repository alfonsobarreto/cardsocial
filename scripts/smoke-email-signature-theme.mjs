/**
 * Smoke: paridad de tema en firma HTML (backend Express).
 * Run: node scripts/smoke-email-signature-theme.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getCardRowTheme } = require('../backend/src/lib/cardRowTheme.js');
const { buildBusinessCardEmailSignatureHtml } = require('../backend/src/lib/businessCardEmailSignatureHtml.js');

const obsidian = getCardRowTheme('obsidian');
assert.equal(obsidian.gradient[2], '#050505');
assert.equal(obsidian.titleColor, '#ECEFF1');
assert.equal(obsidian.borderColor, '#B0BEC5');

const royal = getCardRowTheme('royal_navy');
assert.equal(royal.titleColor, '#7A4DFF');
assert.equal(royal.metaColor, '#E6C966');

const htmlObs = buildBusinessCardEmailSignatureHtml({
  webBaseUrl: 'https://cardsocial.me',
  publicCardUrl: 'https://cardsocial.me/b/test?uid=u1',
  bcName: 'Acme Corp',
  subtitle: 'Jane Doe',
  themeId: 'obsidian',
});
assert.match(htmlObs, /background-color:#050505/);
assert.match(htmlObs, /color:#ECEFF1/);

const htmlRoyal = buildBusinessCardEmailSignatureHtml({
  webBaseUrl: 'https://cardsocial.me',
  publicCardUrl: 'https://cardsocial.me/b/test?uid=u1',
  bcName: 'Acme Corp',
  subtitle: 'Jane Doe',
  themeId: 'royal_navy',
});
assert.match(htmlRoyal, /background-color:#162032/);
assert.match(htmlRoyal, /color:#7A4DFF/);
assert.doesNotMatch(htmlRoyal, /background-color:#F2F2F7/);

console.log('smoke-email-signature-theme: ok');
