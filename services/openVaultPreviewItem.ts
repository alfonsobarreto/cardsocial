import { InteractionManager, Platform } from 'react-native';
import { ActionController } from '@/services/ActionController';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { buildLinkOpenCandidates, getMirrorVaultOpenPlan } from '@/services/mirrorVaultItemOpenPlan';
import { resolveVaultMediaUrlForApp } from '@/services/resolveVaultMediaUrl';
import type { IssuerSnapshotPayload } from '@/services/qrApi';

export { ensureWebUrl } from '@/services/mirrorVaultItemOpenPlan';

import type { CoreLocaleKey } from '@/services/coreI18n';

export type OpenVaultPreviewItemDeps = {
  t: (key: CoreLocaleKey, vars?: Record<string, string | number>) => string;
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
  peerFullName?: string;
  peerNickname?: string;
  /** Business only: logo del negocio (= `businessCards.bcLogoUrl`). */
  bcLogoUrl?: string | null;
  /** Business only: nombre comercial (= `businessCards.bcName`). */
  bcName?: string | null;
  /** Business only: contacto en tarjeta (= `businessCards.bcContactName`). */
  bcContactName?: string | null;
  /** Business: snapshot del emisor (mirror de `item.issuerSnapshot` en Calls). */
  issuerSnapshot?: IssuerSnapshotPayload | null;
  /** Business: avatar del receptor (mirror de `item.userAvatarUrl` en Calls). */
  userAvatarUrl?: string | null;
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

  // Navegador (Expo web / RN Web): documentos y enlaces en nueva pestaña, sin modales
  // (misma idea que `frontend-web` `runPublicWebSlotAction` en /u y /b).
  if (Platform.OS === 'web' && typeof globalThis !== 'undefined') {
    const w = globalThis as unknown as { open?: (u: string, t: string, f: string) => void };
    if (typeof w.open === 'function') {
      if (plan.kind === 'link') {
        const candidates = buildLinkOpenCandidates(plan.url);
        const httpsUrl = candidates[candidates.length - 1];
        if (httpsUrl) {
          try {
            w.open(httpsUrl, '_blank', 'noopener,noreferrer');
          } catch {
            // ignore
          }
        }
        return;
      }
      if (plan.kind === 'document') {
        const uRaw = String(plan.value || '').trim();
        const u = resolveVaultMediaUrlForApp(uRaw) ?? uRaw;
        if (u.startsWith('http://') || u.startsWith('https://')) {
          try {
            w.open(u, '_blank', 'noopener,noreferrer');
          } catch {
            // ignore
          }
        }
        return;
      }
    }
  }

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
        peerFullName: deps.peerFullName ?? deps.peerDisplayName,
        peerNickname: deps.peerNickname,
        bcLogoUrl: deps.bcLogoUrl ?? null,
        bcName: deps.bcName ?? null,
        bcContactName: deps.bcContactName ?? null,
        issuerSnapshot: deps.issuerSnapshot ?? null,
        userAvatarUrl: deps.userAvatarUrl ?? photo,
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
        value: plan.value || deps.t('common_no_content'),
        title: plan.title || deps.t('common_data_label'),
      });
      return;
  }
}
