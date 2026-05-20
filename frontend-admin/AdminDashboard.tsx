/**
 * AdminDashboard Web Component
 * Interfaz completa para gestión de Market Assets
 *
 * Features:
 * - Login seguro (admin_pochobs / Arantza11@)
 * - Interfaz de borradores (drag‑drop / Card‑Studio)
 * - Real-time preview renderer
 * - Publish confirmation
 * - Asset listing y statistics
 * - Session management (30min timeout)
 */

import React, { useState, useRef, useEffect } from 'react';
import './AdminDashboard.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000/api';
const ADMIN_API = `${API_BASE}/admin`;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos

interface AdminState {
  isAuthenticated: boolean;
  token: string | null;
  username: string | null;
  sessionExpiry: Date | null;
  currentPage: 'login' | 'dashboard' | 'asset_draft' | 'preview' | 'publish' | 'stats';
}

interface AssetDraftUploadForm {
  collection: 'skins' | 'collectibles' | 'wallpapers' | 'fonts';
  name: string;
  rarity: 'gratis' | 'comun' | 'lujo' | 'legendario' | 'coleccionable';
  price_cs: number;
  files: {
    wallpaper_vertical?: File;
    wallpaper_horizontal?: File;
    icons?: File[];
    font?: File;
    preview?: File;
  };
}

interface MarketAsset {
  status: 'draft' | 'published' | 'retired';
}

interface MarketStat {
  _id: string;
  total_assets: number;
  published: number;
  draft: number;
}

interface BillingStatusResponse {
  success: boolean;
  finance?: {
    cloudCosts?: {
      source?: string;
      total_usd?: number;
    };
  };
}

export const AdminDashboard: React.FC = () => {
  const [state, setState] = useState<AdminState>({
    isAuthenticated: false,
    token: null,
    username: null,
    sessionExpiry: null,
    currentPage: 'login',
  });

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [assetDraftForm, setAssetDraftForm] = useState<AssetDraftUploadForm>({
    collection: 'skins',
    name: '',
    rarity: 'comun',
    price_cs: 0,
    files: {},
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [stats, setStats] = useState<MarketStat[] | null>(null);
  const [monthlySpendUsd, setMonthlySpendUsd] = useState(0);
  const [billingSource, setBillingSource] = useState<'api' | 'env' | 'mock' | 'unknown'>('unknown');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ═════════════════════════════════════════════════
  // Session Management
  // ═════════════════════════════════════════════════

  useEffect(() => {
    // Restaurar sesión desde localStorage
    const savedToken = localStorage.getItem('admin_token');
    const savedExpiry = localStorage.getItem('admin_session_expiry');

    if (savedToken && savedExpiry) {
      const expiry = new Date(savedExpiry);
      if (expiry > new Date()) {
        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          token: savedToken,
          username: localStorage.getItem('admin_username'),
          sessionExpiry: expiry,
          currentPage: 'dashboard',
        }));
        startSessionTimer(expiry);
      } else {
        // Sesión expirada
        logout();
      }
    }
  }, []);

  const startSessionTimer = (expiry: Date) => {
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);

    const timeUntilExpiry = expiry.getTime() - Date.now();
    if (timeUntilExpiry > 0) {
      sessionTimerRef.current = setTimeout(() => {
        logout();
        setMessage({ type: 'error', text: 'Sesión expirada. Por favor, vuelva a iniciar sesión.' });
      }, timeUntilExpiry);
    }
  };

  const logout = () => {
    setState({
      isAuthenticated: false,
      token: null,
      username: null,
      sessionExpiry: null,
      currentPage: 'login',
    });
    localStorage.clear();
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
  };

  // ═════════════════════════════════════════════════
  // Login Handler
  // ═════════════════════════════════════════════════

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${ADMIN_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      const expiry = new Date(Date.now() + SESSION_TIMEOUT);

      setState({
        isAuthenticated: true,
        token: data.token,
        username: loginForm.username,
        sessionExpiry: expiry,
        currentPage: 'dashboard',
      });

      // Guardar en localStorage (12 horas max por seguridad)
      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_username', loginForm.username);
      localStorage.setItem('admin_session_expiry', expiry.toISOString());

      startSessionTimer(expiry);
      setMessage({ type: 'success', text: `✅ Bienvenido, ${loginForm.username}` });
      setLoginForm({ username: '', password: '' });
      loadBillingStatus(data.token);
    } catch (error) {
      setMessage({ type: 'error', text: `❌ ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  // ═════════════════════════════════════════════════
  // CARD-STUDIO Handler
  // ═════════════════════════════════════════════════

  const handleAssetDraftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('collection', assetDraftForm.collection);
      formData.append('name', assetDraftForm.name);
      formData.append('rarity', assetDraftForm.rarity);
      formData.append('price_cs', assetDraftForm.price_cs.toString());

      // Agregar archivos
      if (assetDraftForm.files.wallpaper_vertical) {
        formData.append('wallpaper_vertical', assetDraftForm.files.wallpaper_vertical);
      }
      if (assetDraftForm.files.icons) {
        assetDraftForm.files.icons.forEach((icon, idx) => {
          formData.append(`icons`, icon);
        });
      }

      const response = await fetch(`${ADMIN_API}/market_asset_draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Draft request failed');
      }

      const data = await response.json();
      setMessage({ type: 'success', text: `✅ Asset creado: ${data.unique_id}` });
      setState(prev => ({ ...prev, currentPage: 'preview' }));

      // Reset form
      setAssetDraftForm({
        collection: 'skins',
        name: '',
        rarity: 'comun',
        price_cs: 0,
        files: {},
      });
    } catch (error) {
      setMessage({ type: 'error', text: `❌ ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  // ═════════════════════════════════════════════════
  // Fetch Assets & Stats
  // ═════════════════════════════════════════════════

  const loadAssets = async () => {
    try {
      const response = await fetch(`${ADMIN_API}/assets`, {
        headers: { Authorization: `Bearer ${state.token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setAssets(data.assets);
      }
    } catch (error) {
      console.error('Failed to load assets:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch(`${ADMIN_API}/stats`, {
        headers: { Authorization: `Bearer ${state.token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadBillingStatus = async (tokenOverride?: string) => {
    try {
      const token = tokenOverride || state.token;
      if (!token) return;

      const response = await fetch(`${ADMIN_API}/billing-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Billing endpoint unavailable');
      }

      const data = (await response.json()) as BillingStatusResponse;
      const totalUsd = Number(data?.finance?.cloudCosts?.total_usd || 0);
      const source = String(data?.finance?.cloudCosts?.source || 'unknown').toLowerCase();
      setMonthlySpendUsd(totalUsd);

      if (source === 'api' || source === 'env' || source === 'mock') {
        setBillingSource(source);
      } else {
        setBillingSource('unknown');
      }
    } catch (error) {
      console.error('Failed to load billing status:', error);
      setMonthlySpendUsd(0);
      setBillingSource('unknown');
    }
  };

  useEffect(() => {
    if (state.isAuthenticated && state.token) {
      loadBillingStatus();
    }
  }, [state.isAuthenticated, state.token]);

  // ═════════════════════════════════════════════════
  // UI: Login Page
  // ═════════════════════════════════════════════════

  if (!state.isAuthenticated) {
    return (
      <div className="admin-container login-page">
        <div className="login-card">
          <div className="logo">
            <h1>🎨 Card-Social Admin</h1>
            <p>Market Asset Control Panel</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Usuario</label>
              <input
                type="text"
                value={loginForm.username}
                onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                placeholder="admin_pochobs"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Contraseña</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="••••••••••"
                disabled={loading}
              />
            </div>

            {message && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Autenticando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="footer-text">
            <p>🔒 Sesión segura con JWT (30 minutos)</p>
            <p>© 2026 Card-Social</p>
          </div>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════
  // UI: Dashboard Navigation
  // ═════════════════════════════════════════════════

  return (
    <div className="admin-container dashboard">
      <nav className="admin-navbar">
        <div className="navbar-brand">
          <h2>🎨 Card-Social Admin</h2>
        </div>

        <div className="navbar-actions">
          <button
            className={`nav-btn ${state.currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => {
              setState(prev => ({ ...prev, currentPage: 'dashboard' }));
              loadBillingStatus();
            }}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-btn ${state.currentPage === 'asset_draft' ? 'active' : ''}`}
            onClick={() => setState(prev => ({ ...prev, currentPage: 'asset_draft' }))}
          >
            🎨 CARD-STUDIO
          </button>
          <button
            className={`nav-btn ${state.currentPage === 'stats' ? 'active' : ''}`}
            onClick={() => {
              loadStats();
              setState(prev => ({ ...prev, currentPage: 'stats' }));
            }}
          >
            📈 Estadísticas
          </button>

          <div className="infra-spend-chip">
            <span>Gasto Mensual</span>
            <strong>${monthlySpendUsd.toFixed(2)} USD</strong>
            <small>{billingSource.toUpperCase()}</small>
          </div>

          <div className="session-info">
            <span>👤 {state.username}</span>
            <span className="session-timer">
              ⏱️ {state.sessionExpiry ? new Date(state.sessionExpiry).toLocaleTimeString() : ''}
            </span>
          </div>

          <button className="btn-logout" onClick={logout}>
            🚪 Salir
          </button>
        </div>
      </nav>

      <main className="admin-content">
        {message && (
          <div className={`message-banner ${message.type}`}>
            {message.text}
            <button onClick={() => setMessage(null)}>✕</button>
          </div>
        )}

        {/* Dashboard Page */}
        {state.currentPage === 'dashboard' && (
          <section className="page-section">
            <h3>📊 Panel de Control</h3>
            <div className="dashboard-grid">
              <div className="stat-card">
                <h4>Total Assets</h4>
                <p className="stat-value">{assets.length}</p>
              </div>
              <div className="stat-card">
                <h4>Published</h4>
                <p className="stat-value">{assets.filter((a: MarketAsset) => a.status === 'published').length}</p>
              </div>
              <div className="stat-card">
                <h4>Draft</h4>
                <p className="stat-value">{assets.filter((a: MarketAsset) => a.status === 'draft').length}</p>
              </div>
            </div>

            <button className="btn-primary" onClick={loadAssets}>
              🔄 Recargar Assets
            </button>
          </section>
        )}

        {/* CARD-STUDIO Page */}
        {state.currentPage === 'asset_draft' && (
          <section className="page-section">
            <h3>🎨 CARD-STUDIO · Crear Nuevo Asset</h3>
            <form onSubmit={handleAssetDraftSubmit} className="asset-draft-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Colección</label>
                  <select
                    value={assetDraftForm.collection}
                    onChange={e =>
                      setAssetDraftForm({ ...assetDraftForm, collection: e.target.value as any })
                    }
                  >
                    <option value="skins">Skins</option>
                    <option value="collectibles">Collectibles</option>
                    <option value="wallpapers">Wallpapers</option>
                    <option value="fonts">Fonts</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Nombre</label>
                  <input
                    type="text"
                    value={assetDraftForm.name}
                    onChange={e => setAssetDraftForm({ ...assetDraftForm, name: e.target.value })}
                    placeholder="ej. Marvel Spider-Man"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Rareza</label>
                  <select
                    value={assetDraftForm.rarity}
                    onChange={e =>
                      setAssetDraftForm({ ...assetDraftForm, rarity: e.target.value as any })
                    }
                  >
                    <option value="gratis">Gratis</option>
                    <option value="comun">Común</option>
                    <option value="lujo">Lujo</option>
                    <option value="legendario">Legendario</option>
                    <option value="coleccionable">Coleccionable</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Precio (CS)</label>
                  <input
                    type="number"
                    value={assetDraftForm.price_cs}
                    onChange={e =>
                      setAssetDraftForm({
                        ...assetDraftForm,
                        price_cs: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Wallpaper Vertical</label>
                <div className="file-drop-zone">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      if (e.target.files?.[0]) {
                        setAssetDraftForm({
                          ...assetDraftForm,
                          files: { ...assetDraftForm.files, wallpaper_vertical: e.target.files[0] },
                        });
                      }
                    }}
                    ref={fileInputRef}
                  />
                  <p>Arrastra una imagen o haz click para seleccionar</p>
                </div>
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Creando...' : '✅ Crear Asset'}
              </button>
            </form>
          </section>
        )}

        {/* Stats Page */}
        {state.currentPage === 'stats' && (
          <section className="page-section">
            <h3>📈 Estadísticas del Market</h3>
            {stats && (
              <div className="stats-grid">
                {stats.map((stat: MarketStat, idx: number) => (
                  <div key={idx} className="stat-detail">
                    <h4>{stat._id.toUpperCase()}</h4>
                    <p>Total: {stat.total_assets}</p>
                    <p>Publicados: {stat.published}</p>
                    <p>Borradores: {stat.draft}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
