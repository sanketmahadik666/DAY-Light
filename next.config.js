/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'commons.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'images-assets.nasa.gov',
      },
      {
        protocol: 'https',
        hostname: 'apod.nasa.gov',
      },
      {
        protocol: 'https',
        hostname: 'static.photos',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  // Service Worker will be registered in layout.tsx
}

module.exports = nextConfig

