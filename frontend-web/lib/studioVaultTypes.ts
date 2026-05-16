/**
 * Paridad con `users/{uid}/links` en Firestore (misma forma que la app en `vault.tsx` / NewInfoForm).
 */
export type StudioVaultLink = {
  id: string;
  /** Dueño del documento en Firestore (copiado en claro cuando aplica). */
  uid?: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  vaultProtected?: boolean;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
  vaultMimeType?: string;
  iconVaultId?: string;
  category?: string;
  /** Presente solo en Firestore cuando hay cifrado de campo activo. */
  securePayload?: string;
  secureIv?: string;
  vaultCipherVersion?: number;
};
