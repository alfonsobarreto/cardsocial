import type { MintMarketRadarIssue } from '@/services/mintMarketRadarEmbedUrl';

/** Mensajes para el usuario final: sin detalles técnicos ni trazas de servidor. */
export function marketRadarMintUserMessage(
  issue: MintMarketRadarIssue,
  tr: (es: string, en: string) => string,
): string {
  switch (issue.code) {
    case 'studio_url_missing':
      return tr(
        'El radar no está disponible en este momento. Actualiza la app o inténtalo más tarde.',
        'Radar is unavailable right now. Update the app or try again later.',
      );
    case 'not_signed_in':
      return tr('Inicia sesión para abrir el radar.', 'Sign in to open the radar.');
    case 'embed_secret_missing':
    case 'embed_secret_too_short':
      return tr(
        'El radar no está disponible temporalmente. Inténtalo más tarde.',
        'Radar is temporarily unavailable. Please try again later.',
      );
    case 'firebase_credentials_missing':
    case 'firebase_json_malformed':
    case 'firebase_credentials_file_missing':
    case 'firebase_credentials_file_malformed':
    case 'firebase_private_key_invalid':
      return tr(
        'No pudimos preparar el radar. Inténtalo más tarde o contacta con soporte.',
        'We could not prepare the radar. Try again later or contact support.',
      );
    case 'missing_bearer_token':
      return tr('Vuelve a iniciar sesión e inténtalo de nuevo.', 'Sign in again and try once more.');
    case 'invalid_or_expired_id_token':
      return tr(
        'Tu sesión expiró. Cierra sesión y vuelve a entrar, luego reabre el radar.',
        'Your session expired. Sign out, sign in again, then reopen the radar.',
      );
    case 'mint_bad_response':
      return tr(
        'Respuesta inesperada al abrir el radar. Inténtalo de nuevo.',
        'Unexpected response while opening the radar. Please try again.',
      );
    case 'market_radar_requires_business_card':
      return tr(
        'Market Radar solo está disponible con al menos una Tarjeta de Negocio activa.',
        'Market Radar is only available once you have at least one active Business Card.',
      );
    case 'market_radar_pro_required':
      return tr(
        'Activa Market Radar Pro en Suscripción para desbloquear esta vista.',
        'Activate Market Radar Pro in Subscription to unlock this view.',
      );
    case 'market_radar_gate_failed':
      return tr('No se pudo validar el acceso al radar.', 'Could not validate Market Radar access.');
    default:
      return tr('Ha ocurrido un inconveniente con el radar.', 'Something went wrong with the radar.');
  }
}
