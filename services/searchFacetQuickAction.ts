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
  issuerCardId: string | null;
  issuerDisplayName: string;
  issuerCardPhoto?: string | null;
  issuerCardType?: 'business' | 'personal';
}): void {
  const { type, label, value, issuerUid, issuerCardName, issuerCardId, issuerDisplayName } = params;

  trackCardAnalyticsFireAndForget({
    cardId: issuerCardId,
    iconType: type,
    source: 'search',
  });
  const v = String(value || '').trim();
  const tNorm = String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (isGhostLinkVaultType(type)) {
    void ActionController.ActionGhostLinkVaultItem({
      targetUid: issuerUid,
      sourceCardName: issuerCardName,
      sourceCardId: issuerCardId,
      userName: issuerDisplayName,
      cardPhoto: params.issuerCardPhoto ?? null,
      peerPhotoUrl: params.issuerCardPhoto ?? null,
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
      sourceCardId: issuerCardId,
      userName: issuerDisplayName,
      cardPhoto: params.issuerCardPhoto ?? null,
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
