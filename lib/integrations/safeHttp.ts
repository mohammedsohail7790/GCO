import dns from 'dns'
import http from 'http'
import https from 'https'
import net from 'net'

// Outbound HTTP for client integrations. The destination URL is client-supplied configuration, so this is an SSRF
// boundary: HTTPS only, no embedded credentials, no redirects, no private/loopback/link-local/metadata addresses -
// and the address check happens in the connection's own DNS lookup, so a hostname cannot resolve to something safe
// when validated and something internal when connected (DNS rebinding). Responses are size-capped.
// ALLOW_DEV_ADAPTERS=true (local/CI only, never production) relaxes it to allow http and loopback for test clients.

export class SafeHttpError extends Error {
  category: 'bad_url' | 'dns_blocked' | 'timeout' | 'network' | 'redirect' | 'too_large'
  constructor(category: SafeHttpError['category'], message: string) {
    super(message)
    this.category = category
  }
}

const devRelaxed = () => process.env.ALLOW_DEV_ADAPTERS === 'true'
const MAX_RESPONSE_BYTES = 64 * 1024

function ipv4Private(a: number, b: number): boolean {
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

/** True if the address is not safely public (loopback, private, link-local, CGNAT, metadata, multicast, reserved). */
export function isBlockedAddress(addr: string): boolean {
  const v = net.isIP(addr)
  if (v === 4) {
    const [a, b] = addr.split('.').map(Number) as [number, number]
    return ipv4Private(a, b)
  }
  if (v === 6) {
    const l = addr.toLowerCase()
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isBlockedAddress(mapped[1]!)
    return l === '::' || l === '::1' || l.startsWith('fc') || l.startsWith('fd') || /^fe[89ab]/.test(l) || l.startsWith('ff') || l.startsWith('2001:db8')
  }
  return true // not an IP at all
}

/** Static URL checks (no DNS). Returns an error message or null. */
export function validateCallbackUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) return 'callbackUrl is required (max 500 characters)'
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return 'callbackUrl is not a valid URL'
  }
  const dev = devRelaxed()
  if (u.protocol !== 'https:' && !(dev && u.protocol === 'http:')) return 'callbackUrl must use https'
  if (u.username || u.password) return 'callbackUrl must not contain credentials'
  if (u.hash) return 'callbackUrl must not contain a fragment'
  if (!dev) {
    if (u.port && u.port !== '443') return 'callbackUrl must use the default https port'
    const host = u.hostname.toLowerCase()
    if (net.isIP(host.replace(/^\[|\]$/g, ''))) return 'callbackUrl must use a hostname, not an IP address'
    if (host === 'localhost' || !host.includes('.') || /\.(local|localhost|internal|lan|home|corp)$/.test(host)) return 'callbackUrl must be a public hostname'
  }
  return null
}

function safeLookup(hostname: string, options: any, cb: any) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return cb(err)
    const list = Array.isArray(addresses) ? addresses : [addresses as any]
    if (!devRelaxed() && list.some((a: any) => isBlockedAddress(a.address))) {
      return cb(new SafeHttpError('dns_blocked', 'callback host resolves to a non-public address'))
    }
    const first = list[0] as { address: string; family: number }
    if (options?.all) return cb(null, list)
    cb(null, first.address, first.family)
  })
}

export interface PostResult {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
  latencyMs: number
}

export function postJson(url: string, headers: Record<string, string>, body: string, opts: { timeoutMs: number }): Promise<PostResult> {
  const urlError = validateCallbackUrl(url)
  if (urlError) return Promise.reject(new SafeHttpError('bad_url', urlError))
  const u = new URL(url)
  const mod = u.protocol === 'https:' ? https : http
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const req = mod.request(
      u,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
        lookup: safeLookup as any,
        timeout: opts.timeoutMs,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400) {
          res.resume()
          return reject(new SafeHttpError('redirect', 'callback responded with a redirect (not followed)'))
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (c: Buffer) => {
          size += c.length
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy()
            return reject(new SafeHttpError('too_large', 'callback response too large'))
          }
          chunks.push(c)
        })
        res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), latencyMs: Date.now() - started }))
        res.on('error', () => reject(new SafeHttpError('network', 'callback response error')))
      },
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new SafeHttpError('timeout', 'callback timed out'))
    })
    req.on('error', (err: any) => {
      if (err instanceof SafeHttpError) return reject(err)
      if (err?.cause instanceof SafeHttpError) return reject(err.cause)
      reject(new SafeHttpError('network', 'callback connection failed')) // message deliberately generic: no URL/host echoed
    })
    req.write(body)
    req.end()
  })
}
