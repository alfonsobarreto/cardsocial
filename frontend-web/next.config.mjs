import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  /**
   * Capa defensiva para Studio/Bóveda web y embed Market Radar (reduce superficie XSS).
   * `unsafe-inline` / `unsafe-eval` se mantienen por compatibilidad con el bundle de Next.js en este proyecto.
   * Mapbox GL requiere connect-src (API/tiles/events) y worker-src blob: para workers de renderizado.
   */
  async headers() {
    const mapboxCapableCsp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      [
        "connect-src 'self'",
        'https://*.googleapis.com',
        'https://*.firebaseio.com',
        'https://*.cloudfunctions.net',
        'https://www.googleapis.com',
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://firestore.googleapis.com',
        'wss://*.googleapis.com',
        'https://api.mapbox.com',
        'https://events.mapbox.com',
        'https://*.tiles.mapbox.com',
        'https://*.mapbox.com',
        'https://ipapi.co',
      ].join(' '),
    ].join('; ');
    return [
      {
        source: '/studio/:path*',
        headers: [{ key: 'Content-Security-Policy', value: mapboxCapableCsp }],
      },
      {
        source: '/embed/market-radar',
        headers: [{ key: 'Content-Security-Policy', value: mapboxCapableCsp }],
      },
      {
        source: '/embed/market-radar/:path*',
        headers: [{ key: 'Content-Security-Policy', value: mapboxCapableCsp }],
      },
    ];
  },
  /** Permite importar `services/mirrorVaultItemOpenPlan.ts` desde la raíz del monorepo. */
  experimental: {
    externalDir: true,
  },
  /**
   * En Windows, la caché filesystem de Webpack (`*.pack.gz`) a veces falla al renombrar (ENOENT)
   * y deja chunks de App Router incoherentes → hidratación rota / "Loading chunk … failed".
   * `memory` en dev evita esos packfiles; en build (`NODE_ENV=production`) no aplica este callback igual.
   */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = { type: 'memory' };
    }
    /**
     * Fuentes bajo `../services/` (externalDir) resuelven `node_modules` subiendo desde el directorio
     * del archivo. En CI solo se instala `frontend-web/node_modules`; el padre del monorepo no tiene
     * dependencias, por lo que fallaba `@noble/hashes/*`. Priorizamos siempre las deps del propio paquete web.
     */
    const localNodeModules = path.resolve(__dirname, 'node_modules');
    const prevModules = config.resolve.modules;
    config.resolve.modules = Array.isArray(prevModules)
      ? [localNodeModules, ...prevModules]
      : [localNodeModules, 'node_modules'];
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      /** Contenido mixto / dev: avatars con http:// en Mongo */
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
};

export default nextConfig;
