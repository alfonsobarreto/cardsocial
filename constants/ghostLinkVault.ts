/**
 * Vault ítem exclusivo Ghost-Link: sin número ni URL; la acción es VoIP vía startGhostLinkVoipCall.
 * Los ítems tipo "Teléfono" tradicionales no usan estas constantes.
 */
export const GHOST_LINK_VAULT_TYPE = 'Ghost-Link' as const;
/** Sin número almacenado; el VoIP usa el UID del titular de la tarjeta. */
export const GHOST_LINK_VAULT_VALUE = '';
/** Legacy en datos antiguos (migración suave). */
export const GHOST_LINK_VAULT_LEGACY_VALUE = 'ghost-link:';

/** Id estable del ítem Ghost-Link preinstalado (sincronización nube/local). */
export const BUILTIN_GHOST_LINK_ITEM_ID = 'cs_builtin_ghost_link_v1';

/**
 * Ítems Ghost-Link no se pueden eliminar de la cuenta (solo editar título/icono).
 * Eso no obliga a mostrarlos en ninguna Smart Card: la visibilidad por tarjeta es solo `itemIds`.
 */
export function isGhostLinkVaultDeletionProtected(type: string | null | undefined): boolean {
  return isGhostLinkVaultType(type);
}

export function isGhostLinkVaultType(type: string | null | undefined): boolean {
  const t = String(type || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return t === 'ghost-link' || t === 'ghost_link';
}
