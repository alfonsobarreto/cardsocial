import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AdminLanguageToggle } from '../components/AdminLanguageToggle';
import { useAuth } from '../auth/useAuth';
import { useAdminT } from '../i18n/useAdminT';

import { BrandNodesBackground } from '../components/BrandNodesBackground';
import { brandColors } from '../lib/brandTheme';

export default function AdminLayout() {
  const { t } = useAdminT();
  const { logout, user } = useAuth();

  const navItems = useMemo(
    () => [
      { label: 'Dashboard', to: '/' },
      { label: 'Communication Hub', to: '/communication' },
      { label: 'Megáfono in-app', to: '/megafono' },
      { label: 'Estadisticas', to: '/estadisticas' },
      { label: 'Moderacion', to: '/moderacion' },
      { label: 'Legal & Compliance', to: '/compliance' },
      { label: 'Identity & Anti-Abuso', to: '/identity-risk' },
      { label: 'B2B & Enterprise', to: '/b2b-enterprise' },
      { label: 'Growth & Afiliados', to: '/growth' },
      { label: 'Rules & Tiers', to: '/rules-tiers' },
      { label: 'Economía CS (bonos)', to: '/rules-cs-economy' },
      { label: 'Complementos app', to: '/rules-commerce' },
      { label: 'Campanas VIP', to: '/campanas-vip' },
      { label: t('admin_nav_media_manager'), to: '/medios' },
      { label: 'Studio', to: '/studio' },
      { label: 'Finanzas & Revenue', to: '/finance' },
      { label: 'NFC Ops', to: '/nfc-ops' },
    ],
    [t],
  );
  return (
    <div className="relative min-h-screen bg-transparent text-slate-950">
      <BrandNodesBackground mode="day" className="fixed inset-0 -z-10" />
      <aside
        className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col overflow-hidden border-r border-white/10 lg:flex"
        style={{ backgroundColor: brandColors.midnightNavy }}
      >
        <BrandNodesBackground mode="night" />
        <div className="relative z-[1] flex h-full flex-col">
        <div className="border-b border-white/10 px-7 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#4D8FFF]">Card-Social</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">SuperAdmin</h1>
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
                    ? 'bg-[#2F7BFF] text-white shadow-lg shadow-[#2F7BFF]/20'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-6 py-5">
          <p className="truncate text-xs text-slate-400">{t('admin_layout_session')}</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-100">{user?.email}</p>
        </div>
        </div>
      </aside>

      <div className="lg:pl-72 relative z-[1]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-5 py-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#2F7BFF]">
                {t('admin_layout_header_eyebrow')}
              </p>
              <h2 className="text-lg font-semibold text-slate-950">{t('admin_layout_header_title')}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <AdminLanguageToggle />
              <button
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                type="button"
                onClick={() => void logout()}
              >
                {t('admin_layout_logout')}
              </button>
            </div>
          </div>
        </header>

        <main className="px-5 py-6 sm:px-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
