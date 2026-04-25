import { GHOST_LINK_VAULT_TYPE, isGhostLinkVaultType } from '@card-social/constants/ghostLinkVault';

export type FormDataType = 'link' | 'email' | 'phone' | 'text' | 'document' | 'ghost';

const SERVER_TO_FORM: Record<string, FormDataType> = {
  Enlaces: 'link',
  Email: 'email',
  Teléfono: 'phone',
  telefono: 'phone',
  'Texto Plain': 'text',
  Texto: 'text',
  Documento: 'document',
  [GHOST_LINK_VAULT_TYPE]: 'ghost',
};

const FORM_TO_SERVER: Record<FormDataType, string> = {
  link: 'Enlaces',
  email: 'Email',
  phone: 'Teléfono',
  text: 'Texto Plain',
  document: 'Documento',
  ghost: GHOST_LINK_VAULT_TYPE,
};

export function mapServerTypeToForm(type: string | undefined): FormDataType {
  const t = String(type || '').trim();
  if (isGhostLinkVaultType(t)) return 'ghost';
  return SERVER_TO_FORM[t] || 'link';
}

export function mapFormTypeToServer(ft: FormDataType): string {
  return FORM_TO_SERVER[ft] || 'Enlaces';
}

export const CREATE_TYPES: FormDataType[] = ['link', 'email', 'phone', 'text', 'document'];
