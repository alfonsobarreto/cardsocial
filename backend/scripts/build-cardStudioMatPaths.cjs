/* eslint-disable no-console */
/**
 * Genera `backend/src/lib/cardStudioMatPaths.js` desde @mdi/js (misma matriz que frontend-web
 * `lib/cardStudioFreeIconPaths.ts`). Ejecutar desde la raíz del repo o backend:
 *   node scripts/build-cardStudioMatPaths.cjs
 */
const path = require('path');
const fs = require('fs');
const m = require(path.join(__dirname, '../../frontend-web/node_modules/@mdi/js'));
const outPath = path.join(__dirname, '../src/lib/cardStudioMatPaths.js');

const map = {
  linkedin: 'mdiLinkedin',
  instagram: 'mdiInstagram',
  facebook: 'mdiFacebook',
  whatsapp: 'mdiWhatsapp',
  twitter: 'mdiTwitter',
  'music-note': 'mdiMusicNote',
  youtube: 'mdiYoutube',
  snapchat: 'mdiSnapchat',
  web: 'mdiWeb',
  'link-variant': 'mdiLinkVariant',
  'phone-in-talk': 'mdiPhoneInTalk',
  apple: 'mdiApple',
  android: 'mdiAndroid',
  phone: 'mdiPhone',
  'phone-classic': 'mdiPhoneClassic',
  cellphone: 'mdiCellphone',
  'tablet-cellphone': 'mdiTabletCellphone',
  vibrate: 'mdiVibrate',
  'phone-voip': 'mdiPhoneVoip',
  contacts: 'mdiContacts',
  gmail: 'mdiGmail',
  'email-outline': 'mdiEmailOutline',
  'email-open': 'mdiEmailOpen',
  'microsoft-outlook': 'mdiMicrosoftOutlook',
  yahoo: 'mdiYahoo',
  mailbox: 'mdiMailbox',
  send: 'mdiSend',
  certificate: 'mdiCertificate',
  at: 'mdiAt',
  email: 'mdiEmail',
  'text-box-outline': 'mdiTextBoxOutline',
  'format-text': 'mdiFormatText',
  'note-text-outline': 'mdiNoteTextOutline',
  'message-text-outline': 'mdiMessageTextOutline',
  'clipboard-text-outline': 'mdiClipboardTextOutline',
  text: 'mdiText',
  'format-paragraph': 'mdiFormatParagraph',
  'format-quote-close': 'mdiFormatQuoteClose',
  pen: 'mdiPen',
  'pencil-outline': 'mdiPencilOutline',
  key: 'mdiKey',
  'shield-check': 'mdiShieldCheck',
  lock: 'mdiLock',
  'folder-lock': 'mdiFolderLock',
  'eye-outline': 'mdiEyeOutline',
  fingerprint: 'mdiFingerprint',
  star: 'mdiStar',
  'diamond-stone': 'mdiDiamondStone',
  crown: 'mdiCrown',
  heart: 'mdiHeart',
  flash: 'mdiFlash',
  'file-pdf-box': 'mdiFilePdfBox',
  'file-image': 'mdiFileImage',
  'file-video': 'mdiFileVideo',
  'file-word': 'mdiFileWord',
  'file-excel': 'mdiFileExcel',
  'file-document': 'mdiFileDocument',
  presentation: 'mdiPresentation',
  'file-music': 'mdiFileMusic',
  'zip-box': 'mdiZipBox',
  'folder-zip': 'mdiFolderZip',
  'card-text': 'mdiCardText',
  'help-circle': 'mdiHelpCircle',
  football: 'mdiFootball',
  trophy: 'mdiTrophy',
  bullhorn: 'mdiBullhorn',
  flag: 'mdiFlag',
  'map-marker': 'mdiMapMarker',
  fire: 'mdiFire',
  'shield-half-full': 'mdiShieldHalfFull',
  'account-group': 'mdiAccountGroup',
  'silverware-fork-knife': 'mdiSilverwareForkKnife',
  'white-balance-sunny': 'mdiWhiteBalanceSunny',
  medal: 'mdiMedal',
  basketball: 'mdiBasketball',
  horse: 'mdiHorse',
};

const out = {};
for (const [k, v] of Object.entries(map)) {
  const d = m[v];
  if (typeof d !== 'string' || !d) {
    console.error('Missing export', v, 'for', k);
    process.exit(1);
  }
  out[k] = d;
}

const head = `/**
 * Paths SVG (d=) alineados con Material Design Icons y con
 * \`frontend-web/lib/cardStudioFreeIconPaths.ts\` + galería CardStudioVault.
 * Generado: scripts/build-cardStudioMatPaths.cjs — no editar a mano.
 */
module.exports = `;

fs.writeFileSync(outPath, head + JSON.stringify(out, null, 0) + ';\n', 'utf8');
console.log('Wrote', outPath, 'keys', Object.keys(out).length);
