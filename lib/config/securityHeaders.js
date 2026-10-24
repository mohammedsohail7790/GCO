// Security headers (ASVS V14, finding F1 in docs/readiness/19). Nonce-based CSP is deliberately not used: it forces every
// page, including the static marketing pages, to render dynamically (node_modules/next/dist/docs/.../content-security-policy.md).
// So this policy keeps 'unsafe-inline' for scripts and styles and is sent REPORT-ONLY first (violations show in the browser
// console on staging); enforcing it is a separate, approved step. HSTS is opt-in per environment so a wrong value never ships by default.
function realtimeOrigin() {
  const raw = process.env.NEXT_PUBLIC_REALTIME_URL
  if (!raw) return ''
  try { return new URL(raw).origin } catch { return '' }
}

function securityHeaders() {
  const connect = ["'self'", realtimeOrigin()].filter(Boolean).join(' ')
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self'",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  const headers = [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy-Report-Only', value: csp },
  ]
  // Set HSTS_MAX_AGE_SECONDS per environment (staging: 300 first, then raise after a clean observation). No includeSubDomains or preload.
  const hsts = parseInt(process.env.HSTS_MAX_AGE_SECONDS || '', 10)
  if (Number.isInteger(hsts) && hsts > 0) headers.push({ key: 'Strict-Transport-Security', value: `max-age=${hsts}` })
  return headers
}

module.exports = { securityHeaders }
