import { ActionController } from '@/services/ActionController';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import {
  ensureWebUrl,
  getMirrorVaultOpenPlan,
} from '@/services/mirrorVaultItemOpenPlan';
import { Alert } from 'react-native';

export { ensureWebUrl } from '@/services/mirrorVaultItemOpenPlan';

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
 * El discriminador de tipo vive en `getMirrorVaultOpenPlan` (compartido con web universal).
 */
export async function openVaultPreviewItem(item: MirrorVaultItem, deps: OpenVaultPreviewItemDeps): Promise<void> {
  const plan = getMirrorVaultOpenPlan(
    {
      type: item.type,
      value: item.value,
      title: item.title,
      vaultMimeType: item.vaultMimeType,
    },
    {
      cardOwnerUid: String(deps.ghostTargetUid || '').trim(),
      cardId: String(deps.sourceCardId || '').trim(),
      sourceCardName: deps.sourceCardName,
    },
  );

  switch (plan.kind) {
    case 'ghost':
      await ActionController.ActionGhostLinkVaultItem({
        targetUid: deps.ghostTargetUid,
        sourceCardName: deps.sourceCardName,
        sourceCardId: deps.sourceCardId,
        userName: deps.peerDisplayName,
      });
      return;
    case 'email':
      await ActionController.ActionEmail({ value: plan.value });
      return;
    case 'phone':
      await ActionController.ActionTelefono({ value: plan.value });
      return;
    case 'link':
      await ActionController.ActionLink({ value: plan.url, title: plan.title });
      return;
    case 'document':
      await deps.openDocumentViewer(item);
      return;
    case 'text':
      await ActionController.ActionText({ value: plan.value, title: plan.title });
      return;
    case 'raw':
      Alert.alert(deps.tr('Dato', 'Data'), plan.value || deps.tr('Sin contenido', 'No content'));
      return;
  }
}
