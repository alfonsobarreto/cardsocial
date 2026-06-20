import {
  formatCsPaymentPriceLine,
  formatUsdPriceLine,
  joinPriceSegments,
  normalizePricePair,
  shouldShowPriceOption,
} from '../lib/subscriptionPriceVisibility';
import { resolveTierAnnualPricing } from '../lib/tierAnnualPricing';

type TierPreviewLimits = {
  monthlyPriceUsd: number;
  monthlyEquivalentCs: number;
  annualDiscountPercent: number;
  annualTrialDays: 0 | 15;
  annualPriceUsd: number;
  annualEquivalentCs: number;
  freeTrialDays?: number;
};

type Props = {
  tier: TierPreviewLimits;
  simulatedBalance: number;
};

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

function previewLine(
  label: string,
  usd: number,
  cs: number,
  simulatedBalance: number,
  suffix: string,
): { label: string; visible: boolean; text: string } {
  const pair = normalizePricePair(usd, cs);
  const visible = shouldShowPriceOption(pair, simulatedBalance);
  const text =
    joinPriceSegments([
      formatUsdPriceLine(pair, { formatUsd: fmtUsd, suffix: usd > 0 ? suffix : '' }),
      formatCsPaymentPriceLine(pair, simulatedBalance),
    ]) || '— (oculto en app)';
  return { label, visible, text };
}

export default function TierPriceVisibilityPreview({ tier, simulatedBalance }: Props) {
  const derived = resolveTierAnnualPricing({
    monthlyPriceUsd: tier.monthlyPriceUsd,
    monthlyEquivalentCs: tier.monthlyEquivalentCs,
    annualDiscountPercent: tier.annualDiscountPercent,
    annualTrialDays: tier.annualTrialDays,
    annualPriceUsd: tier.annualPriceUsd,
    freeTrialDays: tier.freeTrialDays,
  });

  const monthly = previewLine(
    'Mensual',
    tier.monthlyPriceUsd,
    tier.monthlyEquivalentCs,
    simulatedBalance,
    ' / mes',
  );
  const annual = previewLine(
    'Anual',
    derived.annualPriceUsd,
    derived.annualEquivalentCs,
    simulatedBalance,
    ' / año',
  );
  const annualTrial =
    derived.annualTrialDays > 0 ? `${derived.annualTrialDays} días de prueba (solo anual)` : null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Vista app (preview)</p>
      <p className="mt-1 text-xs text-slate-500">
        Saldo CS simulado: <strong>{simulatedBalance.toLocaleString()}</strong>
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {[monthly, annual].map((row) => (
          <li key={row.label} className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-slate-700">{row.label}:</span>
            <span className={row.visible ? 'text-slate-900' : 'text-slate-400 line-through'}>{row.text}</span>
            {!row.visible ? (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                oculto
              </span>
            ) : null}
          </li>
        ))}
        {annualTrial ? (
          <li className="text-xs text-amber-700">
            <span className="font-medium">Prueba:</span> {annualTrial}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
