import { isGhostLinkVaultType } from '@/constants/ghostLinkVault';
import { ActionController } from '@/services/ActionController';
import { isClassicPhoneVaultType } from '@/services/vaultItemTypeGuards';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { Alert } from 'react-native';

export function ensureWebUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `https://${value}`;
}

export type OpenVaultPreviewItemDeps = {
  tr: (es: string, en: string) => string;
  openDocumentViewer: (item: MirrorVaultItem) => void | Promise<void>;
  /**
   * Ghost-Link: UID del titular de la tarjeta (quien recibe la llamada VoIP).
   * Vista previa del emisor: tu propio UID. Receptor: `contact.uid`.
   */
  ghostTargetUid: string | null | undefined;
  sourceCardName: string;
  sourceCardId: string | null;
  peerDisplayName: string;
};

/**
 * Misma lógica que el popover de datos en Mis Tarjetas (`openDataPopover` / `tryOpenInApp`).
 */
export async function openVaultPreviewItem(item: MirrorVaultItem, deps: OpenVaultPreviewItemDeps): Promise<void> {
  const type = String(item.type || '').toLowerCase();
  const value = String(item.value || '').trim();

  if (isGhostLinkVaultType(item.type)) {
    await ActionController.ActionGhostLinkVaultItem({
      targetUid: deps.ghostTargetUid,
      sourceCardName: deps.sourceCardName,
      sourceCardId: deps.sourceCardId,
      userName: deps.peerDisplayName,
    });
    return;
  }
  if (type.includes('email')) {
    await ActionController.ActionEmail({ value });
    return;
  }
  if (isClassicPhoneVaultType(item.type)) {
    await ActionController.ActionTelefono({ value });
    return;
  }
  if (type.includes('enlace') || type.includes('link') || type.includes('web')) {
    await ActionController.ActionLink({ value: ensureWebUrl(value), title: item.title });
    return;
  }
  if (
    type.includes('documento') ||
    type.includes('pdf') ||
    /\.pdf(\?|$)/i.test(value) ||
    /\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(value) ||
    (value.startsWith('file://') && !value.toLowerCase().endsWith('.pdf'))
  ) {
    await deps.openDocumentViewer(item);
    return;
  }
  if (type.includes('texto')) {
    await ActionController.ActionText({ value, title: item.title });
    return;
  }
  Alert.alert(deps.tr('Dato', 'Data'), value || deps.tr('Sin contenido', 'No content'));
}
