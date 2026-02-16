/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  productionBrowserSourceMaps: false,
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.52.1:3000',
  ],
};

export default nextConfig;
