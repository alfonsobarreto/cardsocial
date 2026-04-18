import { isGhostLinkVaultType } from '@/constants/ghostLinkVault';
import { ActionController } from '@/services/ActionController';
import { trackCardAnalyticsFireAndForget } from '@/services/cardAnalytics';
import { facetIconNameForSearch, inferMciIconFromContext } from '@/services/searchFacetIcons';
import { Alert, Linking } from 'react-native';

export { facetIconNameForSearch, inferMciIconFromContext };

export function runSearchFacetQuickAction(params: {
  type: string;
  label: string;
  value: string;
  issuerUid: string;
  issuerCardName: string;
  issuerSid: string | null;
  issuerBId: string | null;
  issuerDisplayName: string;
  /** Nombre completo del titular (smart) o etiqueta humana; pastilla VoIP. */
  issuerPeerFullName?: string;
  /** Negocio: bcContactName para pastilla (no repetir título). */
  issuerCardContactName?: string | null;
  issuerPeerNickname?: string;
  /** @deprecated Preferir `issuerUserAvatarUrl` + `issuerBusinessLogoUrl` (no mezclar logo con persona). */
  issuerCardPhoto?: string | null;
  /** Foto de perfil del emisor (Mongo / contactos). */
  issuerUserAvatarUrl?: string | null;
  /** Logo de negocio en doc tarjeta (solo business). */
  issuerBusinessLogoUrl?: string | null;
  issuerCardType?: 'business' | 'personal';
}): void {
  const { type, label, value, issuerUid, issuerCardName, issuerSid, issuerBId, issuerDisplayName } = params;

  trackCardAnalyticsFireAndForget({
    sid: issuerSid,
    bId: issuerBId,
    iconType: type,
    source: 'search',
  });
  const v = String(value || '').trim();
  const tNorm = String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  const biz = params.issuerCardType === 'business';
  const issuerBcContact = String(params.issuerCardContactName ?? '').trim() || null;
  const peerFace =
    params.issuerUserAvatarUrl != null && String(params.issuerUserAvatarUrl).trim()
      ? String(params.issuerUserAvatarUrl).trim()
      : !biz && params.issuerCardPhoto
        ? String(params.issuerCardPhoto).trim()
        : null;
  const brandLogo =
    biz && params.issuerBusinessLogoUrl != null && String(params.issuerBusinessLogoUrl).trim()
      ? String(params.issuerBusinessLogoUrl).trim()
      : biz && params.issuerCardPhoto
        ? String(params.issuerCardPhoto).trim()
        : null;

  if (isGhostLinkVaultType(type)) {
    void ActionController.ActionGhostLinkVaultItem({
      targetUid: issuerUid,
      sourceCardName: issuerCardName,
      sourceSid: issuerSid,
      sourceBId: issuerBId,
      userName: issuerDisplayName,
      peerFullName: params.issuerPeerFullName ?? issuerDisplayName,
      peerNickname: params.issuerPeerNickname,
      bcLogoUrl: brandLogo,
      bcName: biz ? issuerCardName || null : null,
      bcContactName: biz ? issuerBcContact : null,
      cardPhoto: params.issuerCardPhoto ?? null,
      peerPhotoUrl: peerFace,
      cardType: params.issuerCardType ?? 'personal',
    });
    return;
  }

  if (!v) {
    Alert.alert(label || '—', 'Dato no disponible');
    return;
  }

  if (tNorm.includes('email')) {
    ActionController.ActionEmail({ value: v });
    return;
  }

  if (
    tNorm.includes('tel') ||
    tNorm.includes('phone') ||
    tNorm.includes('telefono') ||
    type.toLowerCase().includes('teléfono')
  ) {
    void ActionController.ActionGhostLinkVaultItem({
      targetUid: issuerUid,
      sourceCardName: issuerCardName,
      sourceSid: issuerSid,
      sourceBId: issuerBId,
      userName: issuerDisplayName,
      peerFullName: params.issuerPeerFullName ?? issuerDisplayName,
      peerNickname: params.issuerPeerNickname,
      bcLogoUrl: brandLogo,
      bcName: biz ? issuerCardName || null : null,
      bcContactName: biz ? issuerBcContact : null,
      cardPhoto: params.issuerCardPhoto ?? null,
      peerPhotoUrl: peerFace,
      cardType: params.issuerCardType ?? 'personal',
    });
    return;
  }

  if (tNorm.includes('whatsapp')) {
    const url = v.startsWith('http://') || v.startsWith('https://') ? v : `https://wa.me/${v.replace(/\D/g, '')}`;
    void Linking.openURL(url);
    return;
  }

  if (tNorm.includes('map') || tNorm.includes('ubic')) {
    void Linking.openURL(v.startsWith('http') ? v : `https://maps.google.com/?q=${encodeURIComponent(v)}`);
    return;
  }

  if (tNorm.includes('pdf') || tNorm.includes('document')) {
    ActionController.ActionDocument({ value: v });
    return;
  }

  if (tNorm.includes('link') || tNorm.includes('web') || tNorm.includes('enlace')) {
    ActionController.ActionLink({ value: v, title: label });
    return;
  }

  if (tNorm.includes('texto')) {
    ActionController.ActionText({ value: v, title: label });
    return;
  }

  Alert.alert(label || 'Dato', v);
}
