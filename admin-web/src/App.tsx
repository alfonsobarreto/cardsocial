import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './layout/AdminLayout';
import Compliance from './pages/Compliance';
import Dashboard from './pages/Dashboard';
import Enterprise from './pages/Enterprise';
import Finance from './pages/Finance';
import Growth from './pages/Growth';
import IdentityRisk from './pages/IdentityRisk';
import Login from './pages/Login';
import Campaigns from './pages/Campaigns';
import Moderation from './pages/Moderation';
import NfcOps from './pages/NfcOps';
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
          <Route path="compliance" element={<Compliance />} />
          <Route path="identity-risk" element={<IdentityRisk />} />
          <Route path="b2b-enterprise" element={<Enterprise />} />
          <Route path="growth" element={<Growth />} />
          <Route path="rules-tiers" element={<RulesTiers />} />
          <Route path="campanas-vip" element={<Campaigns />} />
          <Route path="studio" element={<Studio />} />
          <Route path="finance" element={<Finance />} />
          <Route path="nfc-ops" element={<NfcOps />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
