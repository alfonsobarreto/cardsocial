const statCards = [
  { label: 'Usuarios', value: '--', hint: 'Pendiente de conectar API' },
  { label: 'Reportes', value: '--', hint: 'Moderacion y Trust & Safety' },
  { label: 'Campanas VIP', value: '--', hint: 'Influencers y Businesses' },
  { label: 'NFC activas', value: '--', hint: 'Inventario fisico' },
];

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">
          Founder View
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          Card-Social SuperAdmin
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          Estructura inicial del Admin Core: autenticacion, rutas protegidas, layout y navegacion
          principal. Los modulos operativos se conectaran despues de definir APIs y permisos.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className="mt-4 text-4xl font-semibold text-slate-950">{card.value}</p>
            <p className="mt-3 text-sm text-slate-500">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Modulos preparados en navegacion</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Dashboard, Moderacion, Rules & Tiers, Campanas VIP, Studio, Finanzas y NFC Ops ya
          aparecen en el sidebar como placeholders de arquitectura.
        </p>
      </section>
    </div>
  );
}
