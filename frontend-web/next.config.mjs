/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  /** Permite importar `services/mirrorVaultItemOpenPlan.ts` desde la raíz del monorepo. */
  experimental: {
    externalDir: true,
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
