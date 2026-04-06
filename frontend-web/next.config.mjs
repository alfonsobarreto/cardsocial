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
    ],
  },
};

export default nextConfig;
