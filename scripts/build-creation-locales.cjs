const fs = require('fs');
const path = require('path');
const create = require('./creation-locale-part-create.cjs');
const form = require('./creation-locale-part-form.cjs');
const studio = require('./creation-locale-part-studio.cjs');

const outPath = path.join(__dirname, '../services/i18n/creationLocales.json');
const merged = { ...create, ...form, ...studio };
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2, 'utf8'));
console.log('Wrote', outPath, 'keys:', Object.keys(merged).length);
