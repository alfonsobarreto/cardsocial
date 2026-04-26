export type NfcCardStatus = 'active' | 'paused' | 'lost' | 'blocked' | 'unclaimed';

export type NfcMountedTargetType = 'businessCard' | 'smartCard' | 'publicProfile' | 'url';

export type NfcMountedTarget = {
  type: NfcMountedTargetType;
  id: string;
  displayName: string;
  publicUrl: string;
  isTemporary: boolean;
  expiresAt?: string | null;
};

export type NfcFallbackTarget = {
  type: Exclude<NfcMountedTargetType, 'url'> | 'url';
  id: string;
  displayName: string;
  publicUrl: string;
};

export type NfcRecoveryContact = {
  iconDataId: string;
  label: string;
  type: string;
  value: string;
};

export type NfcCardDoc = {
  nfcCardId: string;
  ownerUid: string | null;
  label: string;
  material?: 'plastic_matte' | 'wood' | 'metal' | 'unknown';
  status: NfcCardStatus;
  isClaimed: boolean;
  activatedAt?: string | null;
  mountedTarget: NfcMountedTarget | null;
  fallbackTarget: NfcFallbackTarget | null;
  recoveryContact: NfcRecoveryContact | null;
  lastMountedAt?: string | null;
  lastConfirmedAt?: string | null;
  lastResolvedAt?: string | null;
  version: number;
};

export type NfcMountOption = {
  type: 'businessCard' | 'smartCard';
  id: string;
  displayName: string;
  subtitle: string | null;
  isTemporary: boolean;
  expiresInLabel: string | null;
};

export type NfcLinkInput = {
  nfcCardId: string;
  activationPin: string;
  label: string;
  material?: NfcCardDoc['material'];
};

export type NfcMountInput = {
  targetType: 'businessCard' | 'smartCard';
  targetId: string;
  fallbackTargetType: 'businessCard' | 'url';
  fallbackTargetId?: string | null;
  fallbackPublicUrl?: string | null;
  fallbackDisplayName?: string | null;
};

export type NfcStatusInput = {
  status: Extract<NfcCardStatus, 'active' | 'paused' | 'lost'>;
  recoveryContact?: NfcRecoveryContact | null;
};

export type NfcCardEventType =
  | 'linked'
  | 'mounted'
  | 'fallback_used'
  | 'lost_enabled'
  | 'lost_disabled'
  | 'paused'
  | 'blocked'
  | 'resolved';

export type NfcCardEvent = {
  id: string;
  nfcCardId: string;
  type: NfcCardEventType;
  createdAt: string;
  actorUid?: string | null;
  previousStatus?: NfcCardStatus | null;
  nextStatus?: NfcCardStatus | null;
  previousTarget?: NfcMountedTarget | null;
  nextTarget?: NfcMountedTarget | null;
};
