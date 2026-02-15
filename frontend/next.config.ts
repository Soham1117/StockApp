import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Turbopack config (Next.js 16 uses Turbopack by default)
  turbopack: {},
  // Disable source maps in production for smaller builds
  productionBrowserSourceMaps: false,
  allowedDevOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.52.1:3000'],
};

export default nextConfig;
