/**
 * SmartCardLegacy: HTML estático de cortesía 24h (GET /u/:token) cuando aplica.
 * Misma API: /api/public/universal-card (publicCardSlots). Ver también `BusinessCardWeb` (Next).
 */

const { acceptLanguageHeaderIsSpanish } = require('./httpRequestLocale');
const CARD_STUDIO_MAT_PATHS = require('./cardStudioMatPaths.js');
const PUBLIC_MEDAL_PATHS = require('./publicMedalPaths.cjs');

/** Tabla mínima de temas — misma lista que constants/themeChest.ts y frontend-web/lib/themes.ts. */
const THEME_TABLE = {
  deep_teal:         { bg: ['#E0F7FA','#B2EBF2','#4DD0C8'], bc: '#00E5FF', tc: '#00695C', sc: '#00897B', ic: '#00796B', bb: 'rgba(255,255,255,0.94)' },
  citrus_pop:        { bg: ['#FFFDE7','#FFF59D','#FFEE58'], bc: '#76FF03', tc: '#E65100', sc: '#EF6C00', ic: '#F57C00', bb: 'rgba(255,255,255,0.9)' },
  sky_indigo:        { bg: ['#E8EAF6','#C5CAE9','#9FA8DA'], bc: '#5C6BC0', tc: '#1A237E', sc: '#283593', ic: '#3949AB', bb: 'rgba(255,255,255,0.92)' },
  pure_snow:         { bg: ['#FFFFFF','#F5F5F5','#EEEEEE'], bc: '#BDBDBD', tc: '#212121', sc: '#616161', ic: '#424242', bb: 'rgba(250,250,250,0.98)' },
  neon_matrix:       { bg: ['#1B1B1B','#121212','#0A0A0A'], bc: '#00E676', tc: '#00E676', sc: '#69F0AE', ic: '#B9F6CA', bb: 'rgba(0,230,118,0.12)' },
  lavender_blush:    { bg: ['#FCE4EC','#F8BBD0','#F48FB1'], bc: '#E0E0E0', tc: '#AD1457', sc: '#C2185B', ic: '#880E4F', bb: 'rgba(255,255,255,0.88)' },
  royal_navy:        { bg: ['#0D1B2A','#1B2838','#162032'], bc: '#D4AF37', tc: '#D4AF37', sc: '#E6C966', ic: '#F0D875', bb: 'rgba(212,175,55,0.15)' },
  obsidian:          { bg: ['#1C1C1C','#121212','#050505'], bc: '#B0BEC5', tc: '#ECEFF1', sc: '#B0BEC5', ic: '#90A4AE', bb: 'rgba(176,190,197,0.14)' },
  emerald_crown:     { bg: ['#003D33','#00695C','#00897B'], bc: '#D4AF37', tc: '#FFFFFF', sc: '#A7FFEB', ic: '#B2DFDB', bb: 'rgba(212,175,55,0.18)' },
  texas_burnt_orange: { bg: ['#BF5700','#9E4500','#6D3000'], bc: '#FFFFFF', tc: '#FFFFFF', sc: '#FFCCBC', ic: '#FFE0B2', bb: 'rgba(255,255,255,0.16)' },
  texas_whiteout:    { bg: ['#FFFFFF','#F5F5F5','#EEEEEE'], bc: '#BF5700', tc: '#BF5700', sc: '#5D4037', ic: '#8D4E37', bb: 'rgba(191,87,0,0.08)' },
  texas_night_game:  { bg: ['#0D1117','#161B22','#1F2937'], bc: '#BF5700', tc: '#BF5700', sc: '#9CA3AF', ic: '#D1D5DB', bb: 'rgba(191,87,0,0.12)' },
};
const DEFAULT_THEME_ID = 'obsidian';

function resolveCourtesyTheme(themeId) {
  return THEME_TABLE[themeId] || THEME_TABLE[DEFAULT_THEME_ID];
}

function acceptLanguageIsSpanish(acceptLanguage) {
  return acceptLanguageHeaderIsSpanish(acceptLanguage);
}

function buildExpiredHtml(isEs) {
  const dt = THEME_TABLE[DEFAULT_THEME_ID];
  const SITE = 'https://cardsocial.me';
  const title = isEs ? 'Card-Social — Acceso expirado' : 'Card-Social — Access expired';
  const msg = isEs
    ? 'Acceso expirado. Contacta a quien te compartió el enlace para un código nuevo.'
    : 'Access expired. Contact the person who shared this link for a new code.';
  const footPrivacy = isEs ? 'Privacidad' : 'Privacy';
  const footTerms = isEs ? 'Términos' : 'Terms';
  const footUsage = isEs ? 'Uso' : 'Usage';
  const footSupport = isEs ? 'Soporte' : 'Support';
  return `<!DOCTYPE html>
<html lang="${isEs ? 'es' : 'en'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="theme-color" content="${dt.bg[0]}"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: linear-gradient(180deg, ${dt.bg[0]}, ${dt.bg[1]}, ${dt.bg[2]}); color: ${dt.tc}; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      padding: 24px; text-align: center;
    }
    p { max-width: 24rem; line-height: 1.5; font-size: 1.05rem; border: 1px solid ${dt.bc}; border-radius: 14px; padding: 22px 18px; }
    .legal-foot {
      margin-top: 22px; max-width: 24rem; font-size: 0.65rem; font-weight: 300; line-height: 1.55;
      color: ${dt.sc}; opacity: 0.85;
    }
    .legal-foot a { color: inherit; text-decoration: underline; }
  </style>
</head>
<body>
  <p>${msg}</p>
  <footer class="legal-foot" aria-label="Legal">
    <a href="${SITE}/legal/privacidad" target="_blank" rel="noopener noreferrer">${footPrivacy}</a>
    <span aria-hidden="true"> · </span>
    <a href="${SITE}/legal/terminos" target="_blank" rel="noopener noreferrer">${footTerms}</a>
    <span aria-hidden="true"> · </span>
    <a href="${SITE}/legal/uso" target="_blank" rel="noopener noreferrer">${footUsage}</a>
    <span aria-hidden="true"> · </span>
    <a href="mailto:soporte@card-social.com?subject=Soporte%20Card-Social">${footSupport}</a>
  </footer>
</body>
</html>`;
}

/**
 * @param {object} opts
 * @param {string} opts.token
 * @param {string} opts.expiresAtIso
 * @param {boolean} opts.isEs
 * @param {string} opts.apiPrefix - ej. "" si mismo host, o "https://api.example.com"
 */
function buildValidCourtesyPageHtml(opts) {
  const { token, expiresAtIso, isEs, apiPrefix } = opts;
  const apiBase = String(apiPrefix || '').replace(/\/+$/, '');
  const dt = THEME_TABLE[DEFAULT_THEME_ID];

  const SITE = 'https://cardsocial.me';
  const t = {
    title: isEs ? 'Card-Social' : 'Card-Social',
    countdown: isEs ? 'Acceso temporal:' : 'Temporary access:',
    remaining: isEs ? 'restantes' : 'remaining',
    addContacts: isEs ? 'Descargar Card-Social' : 'Download Card-Social',
    openApp: isEs ? 'Abrir en la app' : 'Open in app',
    loadErr: isEs ? 'No se pudo cargar la tarjeta.' : 'Could not load the card.',
    expired: isEs ? 'Este acceso ha expirado.' : 'This access has expired.',
    footPrivacy: isEs ? 'Privacidad' : 'Privacy',
    footTerms: isEs ? 'Términos' : 'Terms',
    footUsage: isEs ? 'Uso' : 'Usage',
    footSupport: isEs ? 'Soporte' : 'Support',
  };

  const safeToken = JSON.stringify(token);
  const safeExpires = JSON.stringify(expiresAtIso);
  const safeApi = JSON.stringify(apiBase);
  const matPathJson = JSON.stringify(CARD_STUDIO_MAT_PATHS);
  const medalPathsForScript = JSON.stringify({
    social: PUBLIC_MEDAL_PATHS.SOCIAL,
    business: PUBLIC_MEDAL_PATHS.BUSINESS,
  });

  return `<!DOCTYPE html>
<html lang="${isEs ? 'es' : 'en'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="theme-color" content="${dt.bg[0]}"/>
  <title>${t.title}</title>
  <style>
    :root {
      --bg0: ${dt.bg[0]}; --bg1: ${dt.bg[1]}; --bg2: ${dt.bg[2]};
      --bc: ${dt.bc}; --tc: ${dt.tc}; --sc: ${dt.sc}; --ic: ${dt.ic}; --bb: ${dt.bb};
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: linear-gradient(180deg, var(--bg0), var(--bg1), var(--bg2)); color: var(--tc); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-height: 100vh; transition: background 0.4s; }
    .banner {
      position: sticky; top: 0; z-index: 10;
      text-align: center; padding: 12px 14px; font-weight: 700; font-size: 0.95rem;
      background: linear-gradient(180deg, color-mix(in srgb, var(--bc) 18%, transparent), transparent);
      border-bottom: 1px solid var(--bc); color: var(--bc);
      letter-spacing: 0.02em;
    }
    .wrap { max-width: 420px; margin: 0 auto; padding: 16px 18px 32px; }
    .card {
      border: 3px solid var(--bc);
      border-radius: 16px;
      overflow: hidden;
      padding: 0;
      background: linear-gradient(180deg, var(--bg0), var(--bg1), var(--bg2));
      box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    }
    .card-header {
      display: flex; align-items: center; justify-content: center;
      gap: 6px; padding: 6px 8px; font-weight: 700; font-size: 0.82rem;
      opacity: 0.85; color: var(--tc);
    }
    /* Marco 1.1× el slot; zoom PNG alineado con cabecera Card-Social en la web (icon.png) */
    .card-header-logo {
      width: calc(32px * 1.1);
      height: calc(32px * 1.1);
      border-radius: calc(8px * 1.1);
      flex-shrink: 0;
      overflow: hidden;
      display: flex; align-items: center; justify-content: center; background: #fff;
    }
    .card-header-logo img {
      width: 32px; height: 32px; object-fit: cover; display: block;
      transform: scale(1.35);
      transform-origin: center;
    }
    .card-top { display: flex; flex-direction: column; padding: 0 8px; }
    .avatar-box { display: flex; justify-content: center; padding: 4px 0 10px; }
    .avatar {
      width: 72px; height: 72px;
      border-radius: 16px;
      object-fit: cover;
      border: 2px solid var(--bc);
      display: block;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }
    .avatar-ph {
      width: 72px; height: 72px;
      border-radius: 16px;
      border: 2px solid var(--bc);
      display: flex; align-items: center; justify-content: center;
      font-size: 1.6rem; background: var(--bb);
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }
    .card-info { padding: 8px 8px 12px; text-align: center; display: flex; flex-direction: column; gap: 5px; }
    h1 { margin: 0; font-size: 1.2rem; text-align: center; color: var(--tc); font-weight: 800; }
    .sub { text-align: center; color: var(--sc); opacity: 0.88; font-size: 0.82rem; margin: 0; }
    .cn { text-align: center; font-size: 0.88rem; font-weight: 700; margin: 0; color: var(--tc); }
    .medal-strip {
      width: 100%;
      margin-top: 6px;
      padding: 0 2px;
      box-sizing: border-box;
    }
    .medal-strip-inner {
      display: flex; flex-direction: row; align-items: center; justify-content: space-evenly;
      flex-wrap: nowrap; gap: 4px; border-radius: 999px;
      background: rgba(255,255,255,0.12);
      border: 2px solid var(--bc);
      padding: 10px;
      box-sizing: border-box;
    }
    .medal-it {
      display: inline-flex; flex-direction: row; align-items: center; gap: 3px;
      flex-shrink: 1; min-width: 0;
      font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ic);
    }
    .medal-it svg { flex-shrink: 0; display: block; }
    .slot-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      padding: 12px 24px 22px;
    }
    .slot {
      border: 1px solid var(--bc);
      border-radius: 12px;
      padding: 10px 6px;
      text-align: center;
      min-height: 72px;
      background: var(--bb);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      cursor: pointer;
    }
    .slot:focus { outline: 2px solid var(--bc); outline-offset: 2px; }
    .slot-ic { font-size: 1.2rem; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; color: var(--ic); }
    .slot-ic svg { display: block; }
    .slot-ic img { display: block; }
    .slot-lb { font-size: 0.62rem; color: var(--ic); opacity: 0.85; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .actions { margin-top: 22px; display: flex; flex-direction: column; gap: 10px; }
    .btn {
      display: block; width: 100%; padding: 14px 16px; border-radius: 12px; font-weight: 800; font-size: 0.95rem;
      text-align: center; text-decoration: none; cursor: pointer; border: none;
    }
    .btn-primary { background: var(--bc); color: var(--bg0); }
    .btn-ghost { background: transparent; color: var(--bc); border: 1px solid var(--bc); }
    .err { text-align: center; padding: 24px; color: #c44; }
    .legal-foot {
      margin-top: 18px;
      text-align: center;
      font-size: 0.62rem;
      font-weight: 300;
      line-height: 1.55;
      color: var(--sc);
      opacity: 0.82;
      padding: 12px 6px 4px;
      border-top: 1px solid color-mix(in srgb, var(--bc) 22%, transparent);
    }
    .legal-foot a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  </style>
</head>
<body>
  <div class="banner" id="banner">${t.countdown} <span id="cd">--:--:--</span> ${t.remaining}.</div>
  <div class="wrap">
    <div id="root" class="card">
      <p class="err" id="loading">${t.loadErr}</p>
    </div>
    <div class="actions" id="actions" style="display:none">
      <button type="button" class="btn btn-primary" id="btn-store">${t.addContacts}</button>
      <a class="btn btn-ghost" id="btn-app" href="#">${t.openApp}</a>
    </div>
    <footer class="legal-foot" aria-label="Legal">
      <a href="${SITE}/legal/privacidad" target="_blank" rel="noopener noreferrer">${t.footPrivacy}</a>
      <span aria-hidden="true"> · </span>
      <a href="${SITE}/legal/terminos" target="_blank" rel="noopener noreferrer">${t.footTerms}</a>
      <span aria-hidden="true"> · </span>
      <a href="${SITE}/legal/uso" target="_blank" rel="noopener noreferrer">${t.footUsage}</a>
      <span aria-hidden="true"> · </span>
      <a href="mailto:soporte@card-social.com?subject=Soporte%20Card-Social">${t.footSupport}</a>
    </footer>
  </div>
  <script>
(function(){
  var TOKEN = ${safeToken};
  var EXPIRES_AT = ${safeExpires};
  var API_PREFIX = ${safeApi};
  var IS_ES = ${isEs ? 'true' : 'false'};
  var T = ${JSON.stringify(t)};
  var MAT_PATH = ${matPathJson};
  var THEMES = ${JSON.stringify(THEME_TABLE)};
  var DEFAULT_TID = ${JSON.stringify(DEFAULT_THEME_ID)};
  var MEDAL_PATHS = ${medalPathsForScript};
  var SOCIAL_MEDAL_ORDER = ['creativo','conector','visionario','conversador','guru'];
  var BUSINESS_MEDAL_ORDER = ['compromiso','servicio','confianza','prestigio','excelencia'];
  function applyTheme(tid) {
    var th = THEMES[tid] || THEMES[DEFAULT_TID];
    var r = document.documentElement.style;
    r.setProperty('--bg0', th.bg[0]);
    r.setProperty('--bg1', th.bg[1]);
    r.setProperty('--bg2', th.bg[2]);
    r.setProperty('--bc', th.bc);
    r.setProperty('--tc', th.tc);
    r.setProperty('--sc', th.sc);
    r.setProperty('--ic', th.ic);
    r.setProperty('--bb', th.bb);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = th.bg[0];
  }
  // TODO: reemplazar IOS_URL con el link real de App Store cuando la app esté publicada
  // Ejemplo: 'https://apps.apple.com/app/card-social/id123456789'
  var IOS_URL = 'https://cardsocial.me';
  var AND_URL = 'https://play.google.com/store/apps/details?id=com.cardsocial.app';

  function apiUrl(path) {
    var p = API_PREFIX ? (API_PREFIX + path) : path;
    return p;
  }

  function pad(n){ return n < 10 ? '0'+n : ''+n; }
  function tick() {
    var end = Date.parse(EXPIRES_AT);
    var now = Date.now();
    var ms = Math.max(0, end - now);
    if (ms <= 0) {
      document.getElementById('cd').textContent = '00:00:00';
      location.reload();
      return;
    }
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    document.getElementById('cd').textContent = pad(h)+':'+pad(m)+':'+pad(sec);
  }
  setInterval(tick, 1000);
  tick();

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  function normMedalCount(x) {
    var n = Math.max(0, Math.floor(Number(x)));
    return Number.isFinite(n) ? n : 0;
  }
  /** Misma prioridad que BusinessCardWeb + normalizeUniversalCard (smart /u/ usa medallas sociales). */
  function buildMedalStripHtml(c) {
    if (!c) return '';
    var sid = c.sid != null && String(c.sid).trim();
    var bid = c.bId != null && String(c.bId).trim();
    var universalSmart = Boolean(sid && !bid);
    var counts = null;
    var order = null;
    var pathMap = null;
    if (universalSmart && c.socialMedalCounts) {
      counts = c.socialMedalCounts;
      order = SOCIAL_MEDAL_ORDER;
      pathMap = MEDAL_PATHS.social;
    } else if (c.businessMedalCounts) {
      counts = c.businessMedalCounts;
      order = BUSINESS_MEDAL_ORDER;
      pathMap = MEDAL_PATHS.business;
    } else if (c.socialMedalCounts) {
      counts = c.socialMedalCounts;
      order = SOCIAL_MEDAL_ORDER;
      pathMap = MEDAL_PATHS.social;
    } else {
      return '';
    }
    var parts = [];
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      var d = (pathMap && pathMap[k]) ? String(pathMap[k]) : '';
      var num = normMedalCount(counts[k]);
      parts.push(
        '<div class="medal-it" title="'+esc(k)+': '+num+'">' +
        '<svg viewBox="0 0 24 24" width="20" height="16" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path fill="currentColor" d="'+esc(d)+'"/></svg>' +
        '<span>'+num+'</span></div>'
      );
    }
    return '<div class="medal-strip" role="region" aria-label="'+(IS_ES ? 'Medallas públicas' : 'Public medals')+'"><div class="medal-strip-inner">'+
      parts.join('')+'</div></div>';
  }

  /** Fallback por tipo; con icon/iconName Material se usa MAT_PATH (misma matriz que cardStudioFreeIconPaths y el vault). */
  var SLOT_PATH = {
    phone: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
    email: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
    whatsapp: 'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.38 1.26 4.8L2.05 22l5.42-1.42c1.37.73 2.93 1.14 4.57 1.14 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01C17.18 3.03 14.69 2 12.04 2zm5.52 14.43c-.23.64-1.33 1.22-1.84 1.3-.47.07-1.07.1-1.72-.11-.4-.13-.91-.3-1.56-.58-2.74-1.18-4.53-3.95-4.67-4.13-.14-.18-1.13-1.5-1.13-2.86 0-1.36.71-2.03 1-2.34.23-.25.62-.37.99-.37.12 0 .23 0 .33.01.29.01.44.03.63.49.23.57.79 1.93.86 2.07.07.14.14.32.04.51-.09.2-.14.32-.28.49-.14.17-.29.38-.41.51-.14.14-.29.3-.12.58.17.29.74 1.22 1.59 1.97 1.09.97 2.01 1.27 2.3 1.41.29.14.46.12.63-.07.18-.2.74-.86.94-1.15.2-.29.39-.24.66-.14.27.1 1.7.8 1.99.95.29.14.48.21.55.33.07.12.07.69-.16 1.33z',
    linkedin: 'M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z',
    instagram: 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
    twitter: 'M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z',
    facebook: 'M17 2v4h-2c-.69 0-1 .81-1 1.5V10h3v4h-3v8h-4v-8H7v-4h3V6.5C10 4.57 11.57 3 13.5 3H17z',
    youtube: 'M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z',
    tiktok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z',
    telegram: 'M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z',
    website: 'M16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2m-5.15 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56M14.34 14H9.66c-.1-.66-.16-1.32-.16-2 0-.68.06-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2M12 19.96c-.83-1.2-1.5-2.53-1.91-3.96h3.82c-.41 1.43-1.08 2.76-1.91 3.96M8 8H5.08A7.923 7.923 0 0 1 9.4 4.44C8.8 5.55 8.35 6.75 8 8m-2.92 8H8c.35 1.25.8 2.45 1.4 3.56A8.008 8.008 0 0 1 5.08 16m-.82-2C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2M12 4.03c.83 1.2 1.5 2.54 1.91 3.97h-3.82c.41-1.43 1.08-2.77 1.91-3.97M18.92 8h-2.95a15.65 15.65 0 0 0-1.38-3.56c1.84.63 3.37 1.9 4.33 3.56M12 2C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10A10 10 0 0 0 22 12 10 10 0 0 0 12 2z',
    link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
    location: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    voip: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
    default: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
  };
  function normIconName(n) {
    var raw = String(n || '').toLowerCase().replace(/^mdi-/, '').replace(/-/g, '');
    var alias = {
      youtubese: 'youtube',
      youtubeplay: 'youtube',
      linkedin: 'linkedin',
      instagram: 'instagram',
      twitter: 'twitter',
      facebook: 'facebook',
      whatsapp: 'whatsapp',
      tiktok: 'tiktok',
      telegram: 'telegram',
      snapchat: 'snapchat',
      linkvariant: 'website',
      web: 'website',
      earth: 'website',
      yahoo: 'website',
      mapmarker: 'location',
      phoneintalk: 'phone',
      phonevoip: 'voip',
      phoneclassic: 'phone',
      phonelock: 'phone',
      phonelog: 'phone',
      phoneincomingoutgoing: 'phone',
      cellphone: 'phone',
      cellphonebasic: 'phone',
      cellphoneiphone: 'phone',
      cellphonekey: 'phone',
      cellphonemessage: 'phone',
      cellphoneoff: 'phone',
      cellphoneplay: 'phone',
      cellphonesound: 'phone',
      gmail: 'email',
      microsoftoutlook: 'email',
      outlook: 'email',
      account: 'default',
      cardtext: 'link',
      filedocument: 'link',
      filedocumentoutline: 'link',
      certificate: 'link',
      presentation: 'link',
      helpcircle: 'default',
    };
    return alias[raw] || raw;
  }
  var MAT_ALIAS = { 'file-presentation': 'presentation', 'alternate-email': 'email', stamp: 'certificate', sello: 'certificate', classic: 'card-text', clasico: 'card-text', 'cl\\u00e1sico': 'card-text' };
  var MAT_EXTRA = { tiktok: 'music-note' };
  function toMatKey(n) { return String(n || '').trim().toLowerCase().replace(/\\s+/g, '-').replace(/^mdi-/, ''); }
  function applyMatAlias(x) { var k = toMatKey(x); return MAT_EXTRA[k] || MAT_ALIAS[k] || k; }
  function matPathForSlot(s) {
    var ic = String(s.icon || '').trim();
    var cands = [];
    if (ic && !/^https?:\\/\\//i.test(ic)) cands.push(ic);
    if (s.iconName) cands.push(String(s.iconName));
    for (var i = 0; i < cands.length; i++) {
      var k = applyMatAlias(toMatKey(cands[i]));
      k = toMatKey(k);
      if (MAT_PATH[k]) return MAT_PATH[k];
    }
    return null;
  }
  function slotIconHtml(s) {
    var ic = String(s.icon || '').trim();
    if (/^https?:\\/\\//i.test(ic)) {
      return '<img src="'+esc(ic)+'" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover"/>';
    }
    var mpath = matPathForSlot(s);
    if (mpath) {
      return '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="'+mpath+'"/></svg>';
    }
    var k = s.iconName ? normIconName(s.iconName) : '';
    var typeRaw = String(s.type || 'link').toLowerCase();
    var typeK = typeRaw.replace(/[^a-z]/g, '') || 'link';
    if (typeRaw.indexOf('voip') >= 0 || typeK.indexOf('ghostlink') >= 0) {
      typeK = 'voip';
    }
    var path = (k && SLOT_PATH[k]) || SLOT_PATH[typeK] || SLOT_PATH.default;
    return '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="'+path+'"/></svg>';
  }
  function compactLb(s) {
    return String(s.label || s.type || '—').trim().split(/\\s+/).slice(0, 4).join(' ');
  }

  function normType(t) {
    return String(t || '').trim().toLowerCase().replace(/_/g, '-');
  }
  function ensureHttpUrl(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (/^https?:\\/\\//i.test(v)) return v;
    return 'https://' + v;
  }
  function courtesyOpenSlot(s) {
    var type = String(s.type || '').toLowerCase();
    if (type.indexOf('voip') >= 0) return;
    var typeN = normType(s.type);
    var value = String(s.value || '').trim();
    var title = String(s.label || '').trim() || 'Card-Social';
    if (typeN === 'ghost-link') {
      if (confirm('Ghost-Link: abre la app Card-Social para llamar sin mostrar tu número. ¿Abrir app?')) {
        window.location.href = 'cardsocial://';
      }
      return;
    }
    if (type.includes('email') || /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {
      window.location.href = 'mailto:' + value;
      return;
    }
    if (typeN.indexOf('telefono') >= 0 || typeN.indexOf('telephone') >= 0 || typeN === 'phone' || typeN === 'movil' || typeN === 'mobile') {
      var compact = value.replace(/\\s+/g, '');
      if (/^\\+?\\d{7,15}$/.test(compact)) window.location.href = 'tel:' + compact;
      else { alert(value); if (navigator.clipboard) navigator.clipboard.writeText(value); }
      return;
    }
    if (typeN.indexOf('texto') >= 0) {
      alert(title + '\\n\\n' + value);
      if (navigator.clipboard && confirm('¿Copiar al portapapeles?')) {
        navigator.clipboard.writeText(value);
      }
      return;
    }
    if (typeN.indexOf('documento') >= 0 || typeN.indexOf('pdf') >= 0 || /\\/api\\/vault\\/file\\//i.test(value) || /\\.pdf(\\?|$)/i.test(value) || /\\.(jpg|jpeg|png|gif|webp)(\\?|$)/i.test(value)) {
      if (/^https?:\\/\\//i.test(value)) window.open(value, '_blank', 'noopener');
      else alert(value || 'Sin archivo');
      return;
    }
    if (typeN.indexOf('enlace') >= 0 || typeN.indexOf('link') >= 0 || typeN.indexOf('web') >= 0 || /^https?:\\/\\//i.test(value) || /^(www\\.)/i.test(value)) {
      window.open(ensureHttpUrl(value), '_blank', 'noopener');
      return;
    }
    alert(title + ': ' + (value || '—'));
  }

  fetch(apiUrl('/api/public/universal-card?token='+encodeURIComponent(TOKEN)+'&source=qr_scan'))
    .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
    .then(function(res){
      if (!res.ok || !res.j.ok || !res.j.card) {
        document.getElementById('root').innerHTML = '<p class="err">' + esc(res.j.error || T.expired) + '</p>';
        return;
      }
      var c = res.j.card;
      if (c.themeId) applyTheme(c.themeId);
      EXPIRES_AT = c.expiresAt || EXPIRES_AT;
      var photo = c.ownerPhotoUrl ? '<img class="avatar" src="'+esc(c.ownerPhotoUrl)+'" alt=""/>' : '<div class="avatar-ph">★</div>';
      var nickRaw = String(c.ownerNickname || '').trim();
      var nick = nickRaw ? (nickRaw.charAt(0) === '@' ? esc(nickRaw) : '@'+esc(nickRaw)) : '';
      var cardNm = String(c.scName || '').trim();
      var person = String(c.ownerDisplayName || '').trim();
      var occ = String(c.ownerOccupation || '').trim();
      var dispName = cardNm || person || occ || 'Card-Social';
      var slots = Array.isArray(c.slots) ? c.slots : [];
      var grid = slots.slice(0,24).map(function(s, idx){
        var lb = esc(compactLb(s));
        return '<div class="slot" data-slot-idx="'+idx+'" role="button" tabindex="0"><div class="slot-ic">'+slotIconHtml(s)+'</div><div class="slot-lb">'+lb+'</div></div>';
      }).join('');
      if (!grid) grid = '<p style="text-align:center;opacity:0.7;font-size:0.85rem;padding:0 24px;">—</p>';
      document.getElementById('root').innerHTML =
        '<div class="card-header"><span class="card-header-logo"><img src="/icon.png" alt=""/></span><span>Card-Social</span></div>'+
        '<div class="card-top">'+
          '<div class="avatar-box">'+photo+'</div>'+
          '<div class="card-info">'+
            '<h1>'+esc(dispName)+'</h1>'+
            (nick ? '<div class="sub">'+nick+'</div>' : '')+
            buildMedalStripHtml(c)+
          '</div>'+
        '</div>'+
        '<div class="slot-grid">'+grid+'</div>';
      var rootEl = document.getElementById('root');
      var sg = rootEl && rootEl.querySelector('.slot-grid');
      if (sg && slots.length) {
        sg.addEventListener('click', function(ev) {
          var el = ev.target.closest('.slot');
          if (!el) return;
          var i = el.getAttribute('data-slot-idx');
          if (i == null) return;
          courtesyOpenSlot(slots[Number(i)]);
        });
      }
      document.getElementById('actions').style.display = 'flex';
      var deep = 'cardsocial://u/' + encodeURIComponent(TOKEN);
      var appLink = document.getElementById('btn-app');
      appLink.href = deep;

      document.getElementById('btn-store').onclick = function() {
        var ua = navigator.userAgent || '';
        var isIOS = /iPad|iPhone|iPod/.test(ua);
        var dest = isIOS ? IOS_URL : AND_URL;
        function go() { window.location.href = dest; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(String(TOKEN)).then(go).catch(go);
        } else {
          go();
        }
      };
    })
    .catch(function(){
      document.getElementById('root').innerHTML = '<p class="err">'+esc(T.loadErr)+'</p>';
    });
})();
  </script>
</body>
</html>`;
}

module.exports = {
  acceptLanguageIsSpanish,
  buildExpiredHtml,
  buildValidCourtesyPageHtml,
  resolveCourtesyTheme,
};
