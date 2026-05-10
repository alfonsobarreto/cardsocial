/** Copy compartido: Next route + documentación server (ES). */

export type BenefitMilestone = 'pvc_or_higher' | 'metal_card';

export const LEGACY_PHYSICAL_BENEFIT_SUBJECT_ES = '¡Tu beneficio físico de Card-Social está listo!';

export function minReferralsMetForBenefitNotify(milestone: BenefitMilestone): number {
  if (milestone === 'metal_card') return 750;
  return 500;
}

export function buildLegacyBenefitPlainTextEs(displayName: string, milestone: BenefitMilestone, count: number): string {
  const body =
    milestone === 'metal_card'
      ? [
          `Hola ${displayName},`,
          '',
          '¡Felicitaciones! Ganaste estado Metal en el Camino Legacy (750+ referidos completados). Preparamos tu tarjeta física Premium grabada en láser más un mes Business de cortesía.',
          `Referidos válidos registrados: ${count}.`,
          '',
          'Nuestro equipo coordinará tu beneficio físico con la dirección ligada a tu cuenta.',
          '',
          'Card-Social',
        ]
      : [
          `Hola ${displayName},`,
          '',
          '¡Felicitaciones! Ganaste nivel Oro en el Camino Legacy (500+ referidos completados): mantienes Business Card gratis y prepararemos tu tarjeta física NFC en PVC con envío gratuito.',
          `Referidos válidos registrados: ${count}.`,
          '',
          'Nuestro equipo coordinará el envío usando los datos que tenemos sobre tu cuenta.',
          '',
          'Card-Social',
        ];
  return body.join('\n');
}
