import type { MintMarketRadarIssue } from '@/services/mintMarketRadarEmbedUrl';

/** Maps server `error` codes from `/api/embed/mint-market-radar` to user-facing copy. */
export function marketRadarMintUserMessage(
  issue: MintMarketRadarIssue,
  tr: (es: string, en: string) => string,
): string {
  const detail = issue.detail?.trim();
  const tech = detail ? `\n\n${detail}` : '';

  switch (issue.code) {
    case 'studio_url_missing':
      return (
        tr(
          'Falta EXPO_PUBLIC_STUDIO_WEB_URL (o EXPO_PUBLIC_MARKET_RADAR_WEB_ORIGIN) en .env del proyecto; reinicia Metro.',
          'Missing EXPO_PUBLIC_STUDIO_WEB_URL (or EXPO_PUBLIC_MARKET_RADAR_WEB_ORIGIN) in project .env; restart Metro.',
        ) + tech
      );
    case 'not_signed_in':
      return tr('Inicia sesión para abrir el radar.', 'Sign in to open the radar.') + tech;
    case 'embed_secret_missing':
      return (
        tr(
          'En Card Studio falta STUDIO_EMBED_SECRET en .env.local (servidor Next). Añádelo y reinicia `next dev`.',
          'Card Studio is missing STUDIO_EMBED_SECRET in .env.local. Add it and restart `next dev`.',
        ) + tech
      );
    case 'embed_secret_too_short':
      return (
        tr(
          'STUDIO_EMBED_SECRET debe tener al menos 16 caracteres en frontend-web/.env.local.',
          'STUDIO_EMBED_SECRET must be at least 16 characters in frontend-web/.env.local.',
        ) + tech
      );
    case 'firebase_credentials_missing':
      return (
        tr(
          'Firebase Admin no está configurado: define FIREBASE_SERVICE_ACCOUNT_JSON o FIREBASE_SERVICE_ACCOUNT_PATH en Studio (.env.local).',
          'Firebase Admin is not configured: set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in Studio .env.local.',
        ) + tech
      );
    case 'firebase_json_malformed':
      return (
        tr(
          'FIREBASE_SERVICE_ACCOUNT_JSON no es JSON válido (comillas o escapes rotos). Corrige el valor o usa un archivo con FIREBASE_SERVICE_ACCOUNT_PATH.',
          'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Fix quoting/escapes or use FIREBASE_SERVICE_ACCOUNT_PATH with a file.',
        ) + tech
      );
    case 'firebase_credentials_file_missing':
      return (
        tr(
          'No existe el archivo del service account (FIREBASE_SERVICE_ACCOUNT_PATH). Coloca el JSON descargado de Firebase en esa ruta.',
          'Service account file from FIREBASE_SERVICE_ACCOUNT_PATH was not found. Place the Firebase JSON key at that path.',
        ) +
        (detail ? `\n\n${detail}` : '') +
        tech
      );
    case 'firebase_credentials_file_malformed':
      return (
        tr(
          'El archivo de FIREBASE_SERVICE_ACCOUNT_PATH no es JSON válido.',
          'The file at FIREBASE_SERVICE_ACCOUNT_PATH is not valid JSON.',
        ) + tech
      );
    case 'firebase_private_key_invalid':
      return (
        tr(
          'La clave privada del service account es inválida o está corrupta. Genera una clave nueva en Firebase Console → Cuentas de servicio y sustituye el JSON.',
          'The service account private key is invalid or corrupt. Create a new key in Firebase Console → Service accounts and replace the JSON.',
        ) + tech
      );
    case 'missing_bearer_token':
      return tr('Petición sin token de Firebase.', 'Request missing Firebase ID token.') + tech;
    case 'invalid_or_expired_id_token':
      return (
        tr(
          'Tu sesión expiró o el token no es válido. Cierra sesión y vuelve a entrar, luego reabre Analítica.',
          'Session expired or ID token is invalid. Sign out and sign in again, then reopen Analytics.',
        ) + tech
      );
    case 'mint_bad_response':
      return (
        tr(
          'Respuesta inválida del servidor Studio.',
          'Invalid response from Studio server.',
        ) + (issue.httpStatus != null ? ` (${issue.httpStatus})` : '') + tech
      );
    case 'network_unreachable':
      return (
        tr(
          'No hay red hasta Card Studio. Comprueba Wi‑Fi, VPN, que Studio esté en marcha y la IP/puerto en EXPO_PUBLIC_STUDIO_WEB_URL.',
          'Cannot reach Card Studio over the network. Check Wi‑Fi, VPN, that Studio is running, and EXPO_PUBLIC_STUDIO_WEB_URL.',
        ) + tech
      );
    default:
      return (
        tr('Error del radar', 'Radar error') +
        `: ${issue.code}` +
        (issue.httpStatus != null ? ` (HTTP ${issue.httpStatus})` : '') +
        tech
      );
  }
}
