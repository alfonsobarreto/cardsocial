import { InteractionManager, Platform } from 'react-native';
import { ActionController } from '@/services/ActionController';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import {
  ensureWebUrl,
  getMirrorVaultOpenPlan,
} from '@/services/mirrorVaultItemOpenPlan';

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
  sourceSid: string | null;
  sourceBId: string | null;
  peerDisplayName: string;
  /**
   * Cierra el modal de vista previa (tarjeta flotante) antes de Ghost-Link.
   * En iOS, dos Modal superpuestos puede congelar la UI si no se cierra el primero.
   */
  dismissParentModal?: () => void;
  /** Foto del titular / contacto (preview espejo). */
  peerPhotoUrl?: string | null;
  cardPhoto?: string | null;
  cardType?: 'business' | 'personal';
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
      sid: String(deps.sourceSid || '').trim(),
      bId: String(deps.sourceBId || '').trim(),
      sourceCardName: deps.sourceCardName,
    },
  );

  switch (plan.kind) {
    case 'ghost':
      deps.dismissParentModal?.();
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });
      if (Platform.OS === 'ios') {
        await new Promise((r) => setTimeout(r, 220));
      }
      const photo = deps.peerPhotoUrl ?? deps.cardPhoto ?? null;
      await ActionController.ActionGhostLinkVaultItem({
        targetUid: deps.ghostTargetUid,
        sourceCardName: deps.sourceCardName,
        sourceSid: deps.sourceSid,
        sourceBId: deps.sourceBId,
        userName: deps.peerDisplayName,
        cardPhoto: deps.cardPhoto ?? photo,
        peerPhotoUrl: photo,
        cardType: deps.cardType ?? 'personal',
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
      await ActionController.ActionRaw({
        value: plan.value || deps.tr('Sin contenido', 'No content'),
        title: plan.title || deps.tr('Dato', 'Data'),
      });
      return;
  }
}
