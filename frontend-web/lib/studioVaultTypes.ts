/**
 * Paridad con `users/{uid}/links` en Firestore (misma forma que la app en `vault.tsx` / NewInfoForm).
 */
export type StudioVaultLink = {
  id: string;
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
};
