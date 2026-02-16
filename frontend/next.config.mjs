/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: '.',
  },
  productionBrowserSourceMaps: false,
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.52.1:3000',
  ],
  // Include data files in serverless function bundles (needed for Netlify)
  outputFileTracingIncludes: {
    '/api/**': ['../data/ticker-universe.json', '../data/sector-stocks.json', '../data/sector-stocks-top30.json'],
  },
};

export default nextConfig;
