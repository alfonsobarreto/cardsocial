import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './layout/AdminLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Campaigns from './pages/Campaigns';
import Moderation from './pages/Moderation';
import PlaceholderPage from './pages/PlaceholderPage';
import RulesTiers from './pages/RulesTiers';
import Studio from './pages/Studio';
import PrivateRoute from './routes/PrivateRoute';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<PrivateRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="moderacion" element={<Moderation />} />
          <Route path="rules-tiers" element={<RulesTiers />} />
          <Route path="campanas-vip" element={<Campaigns />} />
          <Route path="studio" element={<Studio />} />
          <Route path="finanzas" element={<PlaceholderPage />} />
          <Route path="nfc-ops" element={<PlaceholderPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
