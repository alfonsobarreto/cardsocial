import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export default function PrivateRoute() {
  const { isSuperAdmin, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 shadow-2xl">
          <p className="text-sm font-medium tracking-wide text-amber-200">Validando sesion...</p>
        </div>
      </div>
    );
  }

  if (!user || !isSuperAdmin(user)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
