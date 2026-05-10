import { emitBunkerContactPremiumGlow } from '@/services/bunkerContactPremiumGlowBus';
import { runVaultMagneticSaveFeedback } from '@/services/magneticVaultSaveFeedback';

/**
 * Experiencia “Ferrari” al añadir tarjeta al Búnker (Mercado / QR / entrada):
 * mismo cierre magnético que la Bóveda (Heavy + MP3) + pulso dorado en Contactos.
 * Perfil estándar: sin háptico ni audio (contraste claro).
 */
export async function runBunkerContactTieredSaveFeedback(opts: {
  premiumSensory: boolean;
  linkKey: string;
}): Promise<void> {
  if (!opts.premiumSensory || !String(opts.linkKey || '').trim()) return;

  await runVaultMagneticSaveFeedback(true);

  emitBunkerContactPremiumGlow({ linkKey: opts.linkKey.trim() });
}
