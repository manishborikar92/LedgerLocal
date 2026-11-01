// Static export: no API routes, server actions or middleware (see docs/DECISIONS.md D-02).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {},
};
export default nextConfig;
