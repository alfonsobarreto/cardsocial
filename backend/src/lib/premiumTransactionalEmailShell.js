/**
 * Carcasa HTML premium para correos transaccionales (Resend).
 * Incluye bloque de confianza (spam / empresa nueva) en todos los usos.
 */

const { brandColors, brandGradients } = require('./brandTokens');

const ACCENT = brandColors.electricBlue;

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function spamAndDeliverabilityBlock(locale) {
  const es = locale === 'es';
  if (es) {
    return `<p style="margin:24px 0 0;font-size:14px;line-height:1.55;color:#cfcfcf;"><strong>Si no ves este mensaje en tu bandeja de entrada, revisa Spam o Correo no deseado.</strong> Como empresa en crecimiento, al principio enviamos pocos correos desde nuestro dominio; algunos proveedores filtran con más cautela hasta generar reputación. Añadir Card-Social a tus contactos o marcar el mensaje como «No es spam» ayuda a que los siguientes lleguen a la bandeja principal.</p>`;
  }
  return `<p style="margin:24px 0 0;font-size:14px;line-height:1.55;color:#cfcfcf;"><strong>If you don't see this email in your inbox, please check your Spam or Junk folder.</strong> As a newer company, we send a modest volume from our domain at first; some providers filter unfamiliar senders more strictly until reputation builds. Adding Card-Social to your contacts—or marking this message as &quot;Not spam&quot;—helps future messages reach your primary inbox.</p>`;
}

/**
 * @param {{ headline: string; innerHtml: string; locale: 'es' | 'en' }} p
 */
function wrapPremiumTransactionalEmail({ headline, innerHtml, locale }) {
  const es = locale === 'es';
  const closing = es
    ? 'Este es un correo automático de Card-Social (cardsocial.me). Si no solicitaste esta acción, ignóralo con tranquilidad.'
    : 'This is an automated message from Card-Social (cardsocial.me). If you did not request this action, you can safely ignore it.';
  return `
  <div style="background:${brandColors.midnightNavy};padding:28px 12px;font-family:'Segoe UI',system-ui,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#101E34;border-radius:20px;border:1px solid rgba(47,123,255,0.28);overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.35);">
      <div style="padding:26px 24px 10px;text-align:center;border-bottom:1px solid #2a2a2e;">
        <img src="${LOGO_URL}" alt="Card-Social" width="112" height="auto" style="display:inline-block;margin-bottom:14px;" />
        <div style="font-size:19px;font-weight:800;color:#fafafa;letter-spacing:-0.02em;line-height:1.25;">${escHtml(headline)}</div>
      </div>
      <div style="padding:22px 24px 26px;color:#e6e6e6;font-size:15px;line-height:1.65;">
        ${innerHtml}
        ${spamAndDeliverabilityBlock(locale)}
        <p style="margin:22px 0 0;font-size:13px;color:#9a9a9a;">${closing}</p>
        <p style="margin:16px 0 0;font-size:12px;color:#666;text-align:center;">© Card-Social · <a href="https://cardsocial.me" style="color:${ACCENT};text-decoration:none;">cardsocial.me</a></p>
      </div>
    </div>
  </div>`;
}

module.exports = { wrapPremiumTransactionalEmail, escHtml, spamAndDeliverabilityBlock };
