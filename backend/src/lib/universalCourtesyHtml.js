/**
 * Genera el HTML completo de la Web de Cortesía — Espejo Estético de la tarjeta física.
 *
 * Reglas de diseño:
 * - Siempre modo oscuro (background negro/carbón, acentos dorados #d4af37).
 * - Idioma: si Accept-Language empieza con 'es' → español; cualquier otro → inglés.
 * - Muestra nombre real del dueño (ownerDisplayName), ocupación, foto, y slots públicos.
 * - Botón "Agregar / Add": copia el token al portapapeles y redirige a la Store.
 * - Token Ocupado (bunkerToken) se inyecta en el HTML para que JS lo use en el clipboard.
 */

'use strict';

const STORE_URL_ANDROID = 'https://play.google.com/store/apps/details?id=com.cardsocial.app';
const STORE_URL_IOS = 'https://apps.apple.com/app/card-social/id0000000000'; // reemplazar con ID real
const CARDSOCIAL_SCHEME = 'cardsocial://bunker?token=';

/**
 * Detecta si el Accept-Language del request es español.
 * @param {string|undefined} acceptLanguage
 * @returns {boolean}
 */
function isSpanish(acceptLanguage) {
  const lang = String(acceptLanguage || '').toLowerCase();
  return lang.startsWith('es');
}

/**
 * Escapa caracteres especiales HTML.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Construye el HTML de la tarjeta expirada (sin token ni datos de dueño).
 * @param {string} acceptLanguage
 * @returns {string}
 */
function buildExpiredHtml(acceptLanguage) {
  const es = isSpanish(acceptLanguage);
  const title = es ? 'Card-Social — Acceso expirado' : 'Card-Social — Access Expired';
  const msg = es
    ? 'Este acceso ha expirado. Escanea el QR actualizado o descarga la App.'
    : 'This access has expired. Scan the updated QR or download the App.';
  const btnLabel = es ? 'Descargar Card-Social' : 'Download Card-Social';

  return `<!DOCTYPE html>
<html lang="${es ? 'es' : 'en'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#000000;color:#d4af37;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
      padding:32px 24px;text-align:center;
    }
    .card{max-width:360px;width:100%}
    .icon{font-size:3rem;margin-bottom:20px}
    p{color:rgba(255,255,255,0.8);font-size:1rem;line-height:1.55;margin-bottom:28px}
    .btn{
      display:inline-block;background:#d4af37;color:#000;
      font-weight:700;font-size:1rem;border-radius:999px;
      padding:14px 28px;text-decoration:none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏰</div>
    <p>${escHtml(msg)}</p>
    <a class="btn" href="${escHtml(STORE_URL_ANDROID)}">${escHtml(btnLabel)}</a>
  </div>
</body>
</html>`;
}

/**
 * Construye el HTML completo de la Web de Cortesía con todos los datos de la tarjeta.
 *
 * @param {object} params
 * @param {string} params.token              - Token opaco de 24h (se copiará al clipboard).
 * @param {string} params.ownerDisplayName   - Nombre real del dueño.
 * @param {string|null} params.ownerNickname
 * @param {string|null} params.ownerOccupation
 * @param {string|null} params.ownerPhotoUrl
 * @param {string} params.cardName
 * @param {Array<{type:string,label:string,value:string}>} params.slots - Slots públicos.
 * @param {number} params.holdersCount
 * @param {number} params.ratingAvg
 * @param {string} params.acceptLanguage     - Valor del header Accept-Language.
 * @returns {string}
 */
function buildCourtesyHtml({
  token,
  ownerDisplayName,
  ownerNickname,
  ownerOccupation,
  ownerPhotoUrl,
  cardName,
  slots,
  holdersCount,
  ratingAvg,
  acceptLanguage,
}) {
  const es = isSpanish(acceptLanguage);
  const lang = es ? 'es' : 'en';

  const safeToken = escHtml(String(token || ''));
  const safeName = escHtml(String(ownerDisplayName || ownerNickname || 'Card-Social'));
  const safeNick = ownerNickname ? escHtml(String(ownerNickname)) : '';
  const safeOccupation = ownerOccupation ? escHtml(String(ownerOccupation)) : '';
  const safeCardName = escHtml(String(cardName || 'Smart Card'));
  const safePhoto = ownerPhotoUrl ? escHtml(String(ownerPhotoUrl)) : null;

  const safeHolders = Math.max(0, Math.floor(Number(holdersCount) || 0));
  const safeRating = Number.isFinite(Number(ratingAvg)) ? Number(ratingAvg).toFixed(1) : '5.0';

  const publicSlots = Array.isArray(slots) ? slots.slice(0, 8) : [];

  // i18n strings
  const i18n = {
    pageTitle: es
      ? `${safeName} — Card-Social`
      : `${safeName} — Card-Social`,
    tagline: es ? 'Tarjeta de Contacto Digital' : 'Digital Contact Card',
    holders: es ? 'titulares' : 'holders',
    ratingLabel: es ? 'valoración' : 'rating',
    addBtn: es ? 'Agregar al Búnker' : 'Add to Bunker',
    addingMsg: es ? 'Abriendo Card-Social…' : 'Opening Card-Social…',
    copiedMsg: es ? '¡Token copiado! Abriendo la Store…' : 'Token copied! Opening Store…',
    noClipMsg: es
      ? 'Descarga Card-Social para agregar este contacto.'
      : 'Download Card-Social to add this contact.',
    downloadBtn: es ? 'Descargar App' : 'Download App',
    expiryNote: es
      ? 'Este enlace es válido por 24 horas desde que se generó el QR.'
      : 'This link is valid for 24 hours from when the QR was generated.',
    slots: {
      phone: es ? 'Teléfono' : 'Phone',
      email: es ? 'Correo' : 'Email',
      link: es ? 'Enlace' : 'Link',
      location: es ? 'Ubicación' : 'Location',
      social: 'Social',
      website: 'Website',
    },
  };

  // Build slots HTML
  let slotsHtml = '';
  if (publicSlots.length > 0) {
    const slotItems = publicSlots.map((s) => {
      const slotLabel = escHtml(String(s.label || s.type || ''));
      const slotVal = escHtml(String(s.value || ''));
      const iconMap = {
        phone: '📞', email: '✉️', link: '🔗', social: '🌐',
        website: '🌐', location: '📍', default: '•',
      };
      const icon = iconMap[String(s.type || '').toLowerCase()] || iconMap.default;
      return `<div class="slot"><span class="slot-icon">${icon}</span><div class="slot-body"><span class="slot-label">${slotLabel}</span><span class="slot-val">${slotVal}</span></div></div>`;
    });
    slotsHtml = `<div class="slots">${slotItems.join('')}</div>`;
  }

  // Avatar HTML
  const avatarHtml = safePhoto
    ? `<img class="avatar" src="${safePhoto}" alt="${safeName}" onerror="this.style.display='none';document.getElementById('avatar-fallback').style.display='flex'"/><div class="avatar-fallback" id="avatar-fallback" style="display:none">${safeName.charAt(0).toUpperCase()}</div>`
    : `<div class="avatar-fallback" id="avatar-fallback">${safeName.charAt(0).toUpperCase()}</div>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
  <meta name="theme-color" content="#000000"/>
  <title>${i18n.pageTitle}</title>
  <meta property="og:title" content="${safeName} — Card-Social"/>
  <meta property="og:description" content="${i18n.tagline}"/>
  ${safePhoto ? `<meta property="og:image" content="${safePhoto}"/>` : ''}
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    :root{
      --gold:#d4af37;--gold-dim:rgba(212,175,55,0.18);--gold-border:rgba(212,175,55,0.35);
      --bg:#000000;--surface:#0f0f10;--surface2:#1c1c1e;
      --text:#ffffff;--text2:rgba(255,255,255,0.75);--text3:rgba(255,255,255,0.45);
      --radius:20px;--radius-sm:12px;
    }
    html,body{
      background:var(--bg);color:var(--text);min-height:100vh;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
      -webkit-font-smoothing:antialiased;
    }
    body{
      display:flex;flex-direction:column;align-items:center;
      padding:24px 16px 48px;
    }
    /* Card shell */
    .card{
      width:100%;max-width:400px;
      background:linear-gradient(160deg,#1c1c1e 0%,#0f0f10 60%,#000000 100%);
      border:1px solid var(--gold-border);border-radius:var(--radius);
      padding:32px 24px 28px;
      box-shadow:0 0 40px rgba(212,175,55,0.12),0 8px 32px rgba(0,0,0,0.6);
      position:relative;overflow:hidden;
    }
    .card::before{
      content:'';position:absolute;inset:0;
      background:radial-gradient(ellipse at 50% 0%,rgba(212,175,55,0.06) 0%,transparent 65%);
      pointer-events:none;
    }
    /* Header brand */
    .brand{
      text-align:center;margin-bottom:28px;
    }
    .brand-logo{
      font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;
      color:var(--gold);opacity:0.7;
    }
    .brand-divider{
      width:40px;height:1px;background:var(--gold-border);margin:8px auto 0;
    }
    /* Avatar */
    .avatar-wrap{
      display:flex;justify-content:center;margin-bottom:20px;position:relative;
    }
    .avatar{
      width:88px;height:88px;border-radius:50%;
      border:2.5px solid var(--gold);object-fit:cover;
      box-shadow:0 0 16px rgba(212,175,55,0.28);
    }
    .avatar-fallback{
      width:88px;height:88px;border-radius:50%;
      border:2.5px solid var(--gold);
      background:var(--surface2);
      display:flex;align-items:center;justify-content:center;
      font-size:2rem;font-weight:700;color:var(--gold);
      box-shadow:0 0 16px rgba(212,175,55,0.28);
    }
    /* Identity */
    .identity{text-align:center;margin-bottom:20px}
    .identity-name{
      font-size:1.45rem;font-weight:700;color:var(--text);
      line-height:1.2;margin-bottom:4px;
    }
    .identity-nick{
      font-size:0.875rem;color:var(--gold);margin-bottom:6px;
    }
    .identity-occ{
      font-size:0.875rem;color:var(--text2);
    }
    /* Stats row */
    .stats{
      display:flex;gap:16px;justify-content:center;margin-bottom:24px;
    }
    .stat{
      background:var(--gold-dim);border:1px solid var(--gold-border);
      border-radius:var(--radius-sm);padding:8px 18px;text-align:center;
    }
    .stat-val{font-size:1.1rem;font-weight:700;color:var(--gold)}
    .stat-label{font-size:0.7rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-top:2px}
    /* Card name badge */
    .card-name-badge{
      text-align:center;margin-bottom:24px;
    }
    .card-name-pill{
      display:inline-block;background:var(--surface2);
      border:1px solid var(--gold-border);border-radius:999px;
      padding:5px 16px;font-size:0.8rem;color:var(--text2);
    }
    /* Slots */
    .slots{margin-bottom:28px;display:flex;flex-direction:column;gap:10px}
    .slot{
      display:flex;align-items:center;gap:12px;
      background:var(--surface2);border:1px solid rgba(255,255,255,0.07);
      border-radius:var(--radius-sm);padding:10px 14px;
    }
    .slot-icon{font-size:1.1rem;flex-shrink:0;width:24px;text-align:center}
    .slot-body{display:flex;flex-direction:column;min-width:0}
    .slot-label{font-size:0.7rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px}
    .slot-val{font-size:0.9rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* Add button */
    .add-btn{
      width:100%;padding:16px;border:none;border-radius:999px;
      background:linear-gradient(135deg,#d4af37 0%,#b8962e 100%);
      color:#000;font-size:1.05rem;font-weight:800;letter-spacing:0.02em;
      cursor:pointer;transition:opacity 0.15s,transform 0.1s;
      box-shadow:0 4px 20px rgba(212,175,55,0.38);
      margin-bottom:14px;
    }
    .add-btn:active{opacity:0.85;transform:scale(0.98)}
    .add-btn:disabled{opacity:0.5;cursor:default}
    /* Download link */
    .dl-link{
      display:block;text-align:center;font-size:0.82rem;
      color:var(--text3);text-decoration:underline;text-underline-offset:3px;
      margin-bottom:20px;
    }
    /* Expiry note */
    .expiry{
      text-align:center;font-size:0.72rem;color:var(--text3);
      border-top:1px solid rgba(255,255,255,0.07);padding-top:16px;
      line-height:1.45;
    }
    /* Toast */
    .toast{
      position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(80px);
      background:var(--surface2);border:1px solid var(--gold-border);
      color:var(--text);border-radius:12px;padding:12px 20px;
      font-size:0.875rem;white-space:nowrap;
      box-shadow:0 4px 24px rgba(0,0,0,0.6);
      transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s;
      opacity:0;pointer-events:none;z-index:999;
    }
    .toast.show{transform:translateX(-50%) translateY(0);opacity:1}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-logo">Card-Social</div>
      <div class="brand-divider"></div>
    </div>

    <div class="avatar-wrap">
      ${avatarHtml}
    </div>

    <div class="identity">
      <div class="identity-name">${safeName}</div>
      ${safeNick ? `<div class="identity-nick">@${safeNick}</div>` : ''}
      ${safeOccupation ? `<div class="identity-occ">${safeOccupation}</div>` : ''}
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-val">${safeHolders}</div>
        <div class="stat-label">${i18n.holders}</div>
      </div>
      <div class="stat">
        <div class="stat-val">⭐ ${safeRating}</div>
        <div class="stat-label">${i18n.ratingLabel}</div>
      </div>
    </div>

    <div class="card-name-badge">
      <span class="card-name-pill">📋 ${safeCardName}</span>
    </div>

    ${slotsHtml}

    <button class="add-btn" id="add-btn" onclick="handleAdd()">
      ${i18n.addBtn}
    </button>

    <a class="dl-link" href="${STORE_URL_ANDROID}" target="_blank" rel="noopener">${i18n.downloadBtn}</a>

    <div class="expiry">${i18n.expiryNote}</div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    var BUNKER_TOKEN = ${JSON.stringify(safeToken)};
    var SCHEME_URL = ${JSON.stringify(CARDSOCIAL_SCHEME + safeToken)};
    var STORE_ANDROID = ${JSON.stringify(STORE_URL_ANDROID)};
    var STORE_IOS = ${JSON.stringify(STORE_URL_IOS)};
    var MSG_ADDING = ${JSON.stringify(i18n.addingMsg)};
    var MSG_COPIED = ${JSON.stringify(i18n.copiedMsg)};
    var MSG_NO_CLIP = ${JSON.stringify(i18n.noClipMsg)};

    function isIOS() {
      return /iphone|ipad|ipod/i.test(navigator.userAgent);
    }

    function showToast(msg, duration) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(function() { t.classList.remove('show'); }, duration || 3000);
    }

    function redirectToStore() {
      window.location.href = isIOS() ? STORE_IOS : STORE_ANDROID;
    }

    function handleAdd() {
      var btn = document.getElementById('add-btn');
      btn.disabled = true;

      // Try deep link first (app installed)
      var deepLinkAttempted = false;
      var storeTimer = setTimeout(function() {
        if (!deepLinkAttempted) {
          redirectToStore();
        }
      }, 1500);

      // Try to open app via custom scheme
      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = SCHEME_URL;
      document.body.appendChild(iframe);

      // Copy token to clipboard regardless (app will read it)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(BUNKER_TOKEN).then(function() {
          deepLinkAttempted = true;
          clearTimeout(storeTimer);
          showToast(MSG_COPIED, 3500);
          setTimeout(redirectToStore, 500);
        }).catch(function() {
          deepLinkAttempted = true;
          clearTimeout(storeTimer);
          showToast(MSG_NO_CLIP, 3500);
          setTimeout(redirectToStore, 800);
        });
      } else {
        // Fallback: no clipboard API (older browsers)
        deepLinkAttempted = true;
        clearTimeout(storeTimer);
        showToast(MSG_NO_CLIP, 3500);
        setTimeout(redirectToStore, 800);
      }
    }
  </script>
</body>
</html>`;
}

module.exports = {
  buildCourtesyHtml,
  buildExpiredHtml,
  isSpanish,
};
