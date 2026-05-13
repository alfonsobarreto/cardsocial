/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
