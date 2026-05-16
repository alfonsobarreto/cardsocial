import { type FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { AdminLanguageToggle } from '../components/AdminLanguageToggle';
import { useAdminT } from '../i18n/useAdminT';

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export default function Login() {
  const { t } = useAdminT();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const state = location.state as LocationState | null;
  const redirectTo = state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (searchParams.get('error') === 'access_denied') {
      setError(t('admin_login_err_access_denied'));
    }
  }, [searchParams, t]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await login(email.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'super-admin-access-denied'
          ? t('admin_login_err_access_denied')
          : t('admin_login_err_bad_credentials');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#334155,_#020617_42%,_#000)] px-6 py-10 text-white">
      <div className="mb-6 flex justify-end">
        <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
          <AdminLanguageToggle className="[&_span]:text-slate-300 [&_select]:border-white/20 [&_select]:bg-slate-900 [&_select]:text-white" />
        </div>
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl backdrop-blur lg:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden border-r border-white/10 bg-slate-950/50 p-10 lg:block">
            <div className="flex h-full flex-col justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-300">
                  {t('admin_login_brand_eyebrow')}
                </p>
                <h1 className="mt-8 max-w-md text-5xl font-semibold leading-tight text-white">
                  {t('admin_login_hero_title')}
                </h1>
                <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">{t('admin_login_hero_subtitle')}</p>
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm leading-6 text-amber-100">
                {t('admin_login_hero_notice')}
              </div>
            </div>
          </div>

          <div className="bg-white p-8 text-slate-950 sm:p-10">
            <div className="mx-auto max-w-md">
              <div className="mb-8">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">
                  {t('admin_login_form_eyebrow')}
                </p>
                <h2 className="mt-3 text-3xl font-semibold">{t('admin_login_form_title')}</h2>
                <p className="mt-2 text-sm text-slate-500">{t('admin_login_form_hint')}</p>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t('admin_login_label_email')}</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t('admin_login_label_password')}</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                )}

                <button
                  className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? t('admin_login_submit_loading') : t('admin_login_submit')}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
