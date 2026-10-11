/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production'

// Next.js injects inline bootstrap scripts, so 'unsafe-inline' is needed for script-src without nonces.
// Dev mode additionally needs 'unsafe-eval' for fast refresh.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // Sign-out posts to a server action that redirects to WorkOS to end the session
  "form-action 'self' https://api.workos.com",
  "object-src 'none'"
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }])
]

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image
  output: 'standalone',
  // pdfkit reads its font metrics from disk at runtime, so it must not be bundled
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: { '/api/export/**': ['./node_modules/pdfkit/js/data/**'] },
  headers: async () => [{ source: '/:path*', headers: securityHeaders }]
}

export default nextConfig
