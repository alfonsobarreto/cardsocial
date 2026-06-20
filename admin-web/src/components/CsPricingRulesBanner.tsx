type Props = {
  simulatedBalance: number;
  onSimulatedBalanceChange: (value: number) => void;
};

export default function CsPricingRulesBanner({ simulatedBalance, onSimulatedBalanceChange }: Props) {
  return (
    <section className="rounded-3xl border border-sky-200 bg-sky-50/80 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-700">Visibilidad en app</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">Reglas de precios USD / CS</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
        <li>
          <strong>USD &gt; 0</strong> → se muestra el precio en dólares (MercadoPago / tienda).
        </li>
        <li>
          <strong>CS &gt; 0 y saldo del usuario &gt; 0</strong> → se muestra la opción en monedas CS.
        </li>
        <li>
          Si ambos son <strong>0</strong>, esa fila u opción <strong>no aparece</strong> en la app.
        </li>
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700">Saldo CS simulado (preview):</span>
        <button
          type="button"
          className={[
            'rounded-full px-4 py-1.5 text-sm font-semibold transition',
            simulatedBalance === 0 ? 'bg-sky-600 text-white' : 'border border-slate-300 bg-white text-slate-700',
          ].join(' ')}
          onClick={() => onSimulatedBalanceChange(0)}
        >
          0
        </button>
        <button
          type="button"
          className={[
            'rounded-full px-4 py-1.5 text-sm font-semibold transition',
            simulatedBalance > 0 ? 'bg-sky-600 text-white' : 'border border-slate-300 bg-white text-slate-700',
          ].join(' ')}
          onClick={() => onSimulatedBalanceChange(5000)}
        >
          5.000
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Los campos CS siguen guardándose en Firestore; la app los oculta hasta que haya clientes con saldo.
      </p>
    </section>
  );
}

export function CsPricingRulesInline() {
  return (
    <p className="mt-0.5 text-xs text-violet-600/90">
      Oculto en app si CS=0 o saldo usuario=0
    </p>
  );
}
