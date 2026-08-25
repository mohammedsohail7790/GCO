/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for the Dockerfile's multi-stage build, which copies
  // .next/standalone - without this the Docker build silently has nothing
  // to copy at that step. Found while writing CI (.github/workflows/ci.yml),
  // never previously verified since Docker wasn't available - see
  // docs/production-readiness-audit.md.
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bullmq', 'ioredis'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
