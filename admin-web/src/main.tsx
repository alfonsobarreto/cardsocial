import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { AdminLocaleProvider } from './i18n/AdminLocaleProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AdminLocaleProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AdminLocaleProvider>
    </BrowserRouter>
  </StrictMode>,
)
