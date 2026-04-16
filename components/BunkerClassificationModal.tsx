import type { MyCardsPayload } from '@/components/MyCards/MyCardsPreviewModal';
import { MyCardsPreviewModal } from '@/components/MyCards/MyCardsPreviewModal';
import React from 'react';

/**
 * Modal de aceptación de tarjeta entrante (token universal o QR dinámico).
 * Vista previa completa igual que Mis Tarjetas / Contactos, con Aceptar / Cancelar y grupo Búnker.
 */
export type BunkerClassificationModalProps = {
  visible: boolean;
  mode: 'universal' | 'dynamic_qr' | 'business_permanent';
  /** Vacío si `mode === 'business_permanent'` (canje vía uid + bId). */
  token: string;
  issuerUid: string;
  sid: string | null;
  bId: string | null;
  /** Nombre público del emisor (Ghost-Link / peer). */
  issuerFullName: string;
  receiverUid: string;
  /** Payload visual; debe construirse con `myCardsPayloadFromUniversalCard` / `myCardsPayloadFromQrPreview`. */
  previewPayload: MyCardsPayload | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function BunkerClassificationModal({
  visible,
  mode,
  token,
  issuerUid,
  sid,
  bId,
  issuerFullName,
  receiverUid,
  previewPayload,
  onClose,
  onSuccess,
}: BunkerClassificationModalProps) {
  return (
    <MyCardsPreviewModal
      visible={visible}
      onClose={onClose}
      variant="incoming"
      payload={previewPayload}
      incomingRedeem={{
        mode,
        token,
        issuerUid,
        sid,
        bId,
        receiverUid,
        onSuccess,
      }}
      ghostTargetUid={issuerUid}
      sourceSid={sid}
      sourceBId={bId}
      sourceCardName={previewPayload?.cardName}
      peerDisplayName={issuerFullName}
      ratingCardType={mode === 'business_permanent' ? 'business' : 'smart'}
    />
  );
}
