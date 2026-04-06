/**
 * Página HTML única para GET /u/:token (token válido): vista pública + countdown + CTA tienda.
 * Solo datos ya expuestos por /api/public/universal-card (publicCardSlots).
 */

const { acceptLanguageHeaderIsSpanish } = require('./httpRequestLocale');

const BG = '#000000';
const GOLD = '#d4af37';
const GOLD_DIM = '#a68b2d';

function acceptLanguageIsSpanish(acceptLanguage) {
  return acceptLanguageHeaderIsSpanish(acceptLanguage);
}

function buildExpiredHtml(isEs) {
  const title = isEs ? 'Card-Social — Acceso expirado' : 'Card-Social — Access expired';
  const msg = isEs
    ? 'Acceso expirado. Contacta a quien te compartió el enlace para un código nuevo.'
    : 'Access expired. Contact the person who shared this link for a new code.';
  return `<!DOCTYPE html>
<html lang="${isEs ? 'es' : 'en'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="theme-color" content="${BG}"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: ${BG}; color: ${GOLD}; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      padding: 24px; text-align: center;
    }
    p { max-width: 24rem; line-height: 1.5; font-size: 1.05rem; border: 1px solid ${GOLD_DIM}; border-radius: 14px; padding: 22px 18px; }
  </style>
</head>
<body>
  <p>${msg}</p>
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

  const t = {
    title: isEs ? 'Card-Social' : 'Card-Social',
    countdown: isEs ? 'Acceso temporal:' : 'Temporary access:',
    remaining: isEs ? 'restantes' : 'remaining',
    addContacts: isEs ? 'Descargar Card-Social' : 'Download Card-Social',
    openApp: isEs ? 'Abrir en la app' : 'Open in app',
    loadErr: isEs ? 'No se pudo cargar la tarjeta.' : 'Could not load the card.',
    expired: isEs ? 'Este acceso ha expirado.' : 'This access has expired.',
    holders: isEs ? 'receptores' : 'holders',
    reviews: isEs ? 'reseñas' : 'reviews',
  };

  const safeToken = JSON.stringify(token);
  const safeExpires = JSON.stringify(expiresAtIso);
  const safeApi = JSON.stringify(apiBase);

  return `<!DOCTYPE html>
<html lang="${isEs ? 'es' : 'en'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="theme-color" content="${BG}"/>
  <title>${t.title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: ${BG}; color: ${GOLD}; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-height: 100vh; }
    .banner {
      position: sticky; top: 0; z-index: 10;
      text-align: center; padding: 12px 14px; font-weight: 700; font-size: 0.95rem;
      background: linear-gradient(180deg, rgba(212,175,55,0.18), rgba(0,0,0,0));
      border-bottom: 1px solid ${GOLD_DIM}; color: ${GOLD};
      letter-spacing: 0.02em;
    }
    .wrap { max-width: 420px; margin: 0 auto; padding: 16px 18px 32px; }
    /* card shell: clona wireframeLayoutStyles.wireVerticalCard + IsolatedWireframeCard */
    .card {
      border: 1px solid ${GOLD_DIM};
      border-radius: 16px;
      overflow: hidden;
      padding: 0;
      background: linear-gradient(180deg, rgba(212,175,55,0.10) 0%, rgba(0,0,0,0) 55%), #050505;
      box-shadow: 0 0 0 1px rgba(212,175,55,0.12), 0 12px 40px rgba(0,0,0,0.65);
    }
    /* vertHeader */
    .card-header {
      display: flex; align-items: center; justify-content: center;
      gap: 6px; padding: 6px 8px; font-weight: 700; font-size: 0.82rem;
      opacity: 0.85; color: ${GOLD};
    }
    /* vertTop: avatar + info */
    .card-top { display: flex; flex-direction: column; padding: 0 8px; }
    /* vertAvatarBox */
    .avatar-box { display: flex; justify-content: center; padding: 4px 0 10px; }
    .avatar {
      width: 72px; height: 72px;
      border-radius: 16px; /* 22% of ~72px */
      object-fit: cover;
      border: 2px solid ${GOLD};
      display: block;
      box-shadow: 0 2px 6px rgba(212,175,55,0.35);
    }
    .avatar-ph {
      width: 72px; height: 72px;
      border-radius: 16px;
      border: 2px solid ${GOLD};
      display: flex; align-items: center; justify-content: center;
      font-size: 1.6rem; background: #111;
      box-shadow: 0 2px 6px rgba(212,175,55,0.35);
    }
    /* vertInfoBox */
    .card-info { padding: 8px 8px 12px; text-align: center; display: flex; flex-direction: column; gap: 5px; }
    h1 { margin: 0; font-size: 1.2rem; text-align: center; color: ${GOLD}; font-weight: 800; }
    .sub { text-align: center; opacity: 0.88; font-size: 0.82rem; margin: 0; }
    .cn { text-align: center; font-size: 0.88rem; font-weight: 700; margin: 0; color: ${GOLD}; }
    /* wireStatsRowInline */
    .stats-row {
      display: flex; flex-direction: row; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 8px; width: 100%; padding: 0 2px; margin: 6px 0 10px;
      font-size: 0.72rem;
    }
    .stats-pill {
      display: inline-flex; align-items: center; gap: 4px;
      border-radius: 999px; border: 1px solid ${GOLD_DIM};
      background: rgba(212,175,55,0.08); padding: 3px 8px;
      font-size: 0.72rem; font-weight: 800; color: ${GOLD};
    }
    /* vertIconsBox: paddingHorizontal 24px, gap 12px entre filas */
    .slot-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      padding: 12px 24px 22px;
    }
    /* wireIconCell / WireframeSlotTile */
    .slot {
      border: 1px solid ${GOLD_DIM};
      border-radius: 12px;
      padding: 10px 6px;
      text-align: center;
      min-height: 72px;
      background: rgba(255,255,255,0.03);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .slot-ic { font-size: 1.2rem; margin-bottom: 4px; }
    .slot-lb { font-size: 0.62rem; color: rgba(212,175,55,0.85); line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .actions { margin-top: 22px; display: flex; flex-direction: column; gap: 10px; }
    .btn {
      display: block; width: 100%; padding: 14px 16px; border-radius: 12px; font-weight: 800; font-size: 0.95rem;
      text-align: center; text-decoration: none; cursor: pointer; border: none;
    }
    .btn-primary { background: ${GOLD}; color: #0a0a0a; }
    .btn-ghost { background: transparent; color: ${GOLD}; border: 1px solid ${GOLD_DIM}; }
    .err { text-align: center; padding: 24px; color: #c44; }
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
  </div>
  <script>
(function(){
  var TOKEN = ${safeToken};
  var EXPIRES_AT = ${safeExpires};
  var API_PREFIX = ${safeApi};
  var IS_ES = ${isEs ? 'true' : 'false'};
  var T = ${JSON.stringify(t)};
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

  fetch(apiUrl('/api/public/universal-card?token='+encodeURIComponent(TOKEN)+'&source=qr_scan'))
    .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
    .then(function(res){
      if (!res.ok || !res.j.ok || !res.j.card) {
        document.getElementById('root').innerHTML = '<p class="err">' + esc(res.j.error || T.expired) + '</p>';
        return;
      }
      var c = res.j.card;
      EXPIRES_AT = c.expiresAt || EXPIRES_AT;
      var photo = c.ownerPhotoUrl ? '<img class="avatar" src="'+esc(c.ownerPhotoUrl)+'" alt=""/>' : '<div class="avatar-ph">★</div>';
      var nick = c.ownerNickname ? ('@'+esc(c.ownerNickname)) : '';
      var slots = Array.isArray(c.slots) ? c.slots : [];
      var grid = slots.slice(0,12).map(function(s){
        var lb = esc(s.label || s.type || '—');
        return '<div class="slot"><div class="slot-ic">◆</div><div class="slot-lb">'+lb+'</div></div>';
      }).join('');
      if (!grid) grid = '<p style="text-align:center;opacity:0.7;font-size:0.85rem;padding:0 24px;">—</p>';
      document.getElementById('root').innerHTML =
        '<div class="card-header"><span>★</span> Card-Social</div>'+
        '<div class="card-top">'+
          '<div class="avatar-box">'+photo+'</div>'+
          '<div class="card-info">'+
            '<h1>'+esc(c.ownerDisplayName || c.name || 'Card-Social')+'</h1>'+
            (nick ? '<div class="sub">'+nick+'</div>' : '')+
            '<div class="cn">'+esc(c.name || '')+'</div>'+
            '<div class="stats-row">'+
              '<span>'+
                (c.ratingAvg!=null ? Number(c.ratingAvg).toFixed(1) : '—')+
                ' · '+(c.totalRatings||0)+' '+T.reviews+
              '</span>'+
              '<span class="stats-pill">👤 '+(c.holdersCount||0)+' '+T.holders+'</span>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="slot-grid">'+grid+'</div>';
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
};
