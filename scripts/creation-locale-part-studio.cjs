const { s } = require('./creation-locale-helpers.cjs');

module.exports = s({
  studio_unlock_icon: ['Desbloquear icono', 'Unlock icon'],
  studio_buy_icon_body: [
    'Incluye este icono en tu bóveda por {{price}} Créditos CS.',
    'Add this icon to your vault for {{price}} CS credits.',
  ],
  studio_buy: ['Comprar', 'Buy', { it: 'Compra', pt: 'Comprar', fr: 'Acheter', de: 'Kaufen' }],
  studio_purchase_failed: ['No se pudo comprar', 'Purchase failed'],
  studio_check_cs_balance: ['Revisa tu saldo de Créditos CS.', 'Check your CS credit balance.'],
  studio_bundle_unlocked: ['Bundle desbloqueado', 'Bundle unlocked'],
  studio_bundle_unlocked_body: [
    'Tus 3 variantes de tema y el pack de iconos ya están disponibles.',
    'Your 3 theme variants and icon pack are now available.',
  ],
  studio_purchase_failed_balance: ['Saldo insuficiente u error de red.', 'Insufficient balance or network error.'],
  studio_delete_icon_title: ['Eliminar icono "{{label}}"', 'Delete icon "{{label}}"'],
  studio_delete_icon_body: [
    'Si lo eliminas, los datos del Búnker que usen este ícono quedarán con el ícono por defecto. ¿Deseas continuar?',
    'If you delete it, Vault items using this icon will revert to the default icon. Continue?',
  ],
  studio_delete: ['Eliminar', 'Delete', { it: 'Elimina', pt: 'Excluir', fr: 'Supprimer', de: 'Löschen' }],
  studio_card_studio: ['Card-Studio', 'Card-Studio'],
  studio_cs_credits_line: ['Créditos CS: {{balance}}', 'CS credits: {{balance}}'],
  studio_hint_paid: [
    'Candado: compra con CS. Mantén presionado (icono desbloqueado) para quitar del Bóveda.',
    'Lock: buy with CS. Long press (unlocked icon) to remove from Vault.',
  ],
  studio_hint_free: [
    'Toca un icono para elegirlo. Mantén presionado para quitarlo de tu Bóveda (si aplica).',
    'Tap an icon to choose it. Long press to remove from your Vault (if applicable).',
  ],
  studio_dismiss_bg: ['Cerrar fondo', 'Dismiss'],
  studio_balance_cs: ['Saldo: {{balance}} CS', 'Balance: {{balance}} CS'],
  studio_bundles_subtitle: [
    'Bundles temáticos: 3 estilos de tarjeta + pack de iconos vinculado.',
    'Theme bundles: 3 card styles + linked icon pack.',
  ],
  studio_owned: ['En tu cuenta', 'Owned'],
  studio_close: ['Cerrar', 'Close', { it: 'Chiudi', pt: 'Fechar', fr: 'Fermer', de: 'Schließen' }],
  studio_header_links: ['Enlaces', 'Links'],
  studio_header_phone: ['Teléfono', 'Phone'],
  studio_header_ghost: ['Ghost Link', 'Ghost Link'],
  studio_header_email: ['Email', 'Email'],
  studio_header_text: ['Texto', 'Text'],
  studio_header_document: ['Documento', 'Document'],
  studio_bundle_meta: ['3 temas + {{n}} iconos · {{price}} CS', '3 themes + {{n}} icons · {{price}} CS'],
});
