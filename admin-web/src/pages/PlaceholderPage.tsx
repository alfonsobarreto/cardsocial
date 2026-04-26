import { useLocation } from 'react-router-dom';

const titles: Record<string, string> = {
  '/moderacion': 'Moderacion',
  '/rules-tiers': 'Rules & Tiers',
  '/campanas-vip': 'Campanas VIP',
  '/studio': 'Studio',
  '/finanzas': 'Finanzas',
  '/nfc-ops': 'NFC Ops',
};

export default function PlaceholderPage() {
  const location = useLocation();
  const title = titles[location.pathname] || 'Modulo';

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">
        Placeholder
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-950">{title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
        Este modulo queda reservado para la siguiente fase. El Admin Core ya protege la ruta y
        mantiene la navegacion lista sin conectar logica sensible todavia.
      </p>
    </section>
  );
}
