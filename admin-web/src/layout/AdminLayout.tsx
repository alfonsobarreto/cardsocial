import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const navItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Moderacion', to: '/moderacion' },
  { label: 'Legal & Compliance', to: '/compliance' },
  { label: 'Identity & Anti-Abuso', to: '/identity-risk' },
  { label: 'B2B & Enterprise', to: '/b2b-enterprise' },
  { label: 'Growth & Afiliados', to: '/growth' },
  { label: 'Rules & Tiers', to: '/rules-tiers' },
  { label: 'Campanas VIP', to: '/campanas-vip' },
  { label: 'Studio', to: '/studio' },
  { label: 'Finanzas & Revenue', to: '/finance' },
  { label: 'NFC Ops', to: '/nfc-ops' },
];

export default function AdminLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col border-r border-white/10 bg-slate-950 text-white lg:flex">
        <div className="border-b border-white/10 px-7 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Card-Social</p>
          <h1 className="mt-3 text-2xl font-semibold">SuperAdmin</h1>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-6">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                [
                  'block rounded-xl px-4 py-3 text-sm font-medium transition',
                  isActive
                    ? 'bg-amber-300 text-slate-950 shadow-lg shadow-amber-300/10'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-6 py-5">
          <p className="truncate text-xs text-slate-400">Sesion activa</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-100">{user?.email}</p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-5 py-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-600">
                Admin Core
              </p>
              <h2 className="text-lg font-semibold text-slate-950">Card-Social Operations</h2>
            </div>

            <button
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              type="button"
              onClick={() => void logout()}
            >
              Cerrar Sesion
            </button>
          </div>
        </header>

        <main className="px-5 py-6 sm:px-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
