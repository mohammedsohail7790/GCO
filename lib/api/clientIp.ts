import { isIP } from 'node:net'

// Real-client identification for IP-keyed rate limits.
//
// Production topology: browser -> Cloudflare -> Caddy (host) -> app. Caddy has no
// trusted-proxy configuration, so it DISCARDS any client-supplied X-Forwarded-For
// and sets it to the address of its direct peer. For traffic that came through
// Cloudflare that peer is a Cloudflare EDGE address, which differs from request to
// request - keying on the raw header therefore gave every request its own bucket
// and the limit never tripped. The real visitor address is only in Cloudflare's
// `CF-Connecting-IP` header.
//
// Trust rules (never trust a header the caller can set):
//   1. The only hop we trust is the LAST X-Forwarded-For entry - the one our own
//      reverse proxy appended (never the first, which a client can forge).
//   2. `CF-Connecting-IP` is honoured ONLY when that trusted hop is a Cloudflare
//      address. Port 443 is reachable directly (bypassing Cloudflare), and such a
//      caller can send any CF-Connecting-IP it likes - but its own address is what
//      Caddy records as the peer, it is not in Cloudflare's ranges, so the header is
//      ignored and the attacker is limited by its real address.
//   3. No usable header -> 'unknown' (shared bucket; same as before).
//
// IPv6 clients are keyed by their /64 so rotating addresses within one subscriber
// prefix cannot be used to dodge a limit.
//
// Non-IP values in X-Forwarded-For (the e2e suite sends unique labels to get
// separate buckets) are kept verbatim when the peer is not Cloudflare, so existing
// behaviour and tests are unchanged.

// Cloudflare's published ranges: https://www.cloudflare.com/ips-v4 and /ips-v6
// (fetched 2026-10-05). They change rarely; re-check periodically. Stale ranges can
// only make the app ignore CF-Connecting-IP (falling back to per-edge keys, the
// pre-fix behaviour) - they can never cause a spoofed header to be trusted.
const CLOUDFLARE_V4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
]
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']

type Parsed = { version: 4 | 6; value: bigint }

function parseV6(addr: string): bigint | null {
  let a = addr.toLowerCase()
  const zone = a.indexOf('%')
  if (zone !== -1) a = a.slice(0, zone)
  // Embedded IPv4 tail (::ffff:1.2.3.4) -> two hextets.
  const tail = a.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (tail) {
    const v4 = parseV4(tail[2]!)
    if (v4 === null) return null
    a = `${tail[1]}${((v4 >> 16n) & 0xffffn).toString(16)}:${(v4 & 0xffffn).toString(16)}`
  }
  const halves = a.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...rest]
  let value = 0n
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    value = (value << 16n) | BigInt(parseInt(g, 16))
  }
  return value
}

function parseV4(addr: string): bigint | null {
  const parts = addr.split('.')
  if (parts.length !== 4) return null
  let value = 0n
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null
    value = (value << 8n) | BigInt(Number(p))
  }
  return value
}

function parseIp(addr: string): Parsed | null {
  const kind = isIP(addr.replace(/%.*$/, ''))
  if (kind === 4) {
    const v = parseV4(addr)
    return v === null ? null : { version: 4, value: v }
  }
  if (kind === 6) {
    const v = parseV6(addr)
    if (v === null) return null
    // IPv4-mapped (::ffff:a.b.c.d) is really an IPv4 peer.
    if (v >> 32n === 0xffffn) return { version: 4, value: v & 0xffffffffn }
    return { version: 6, value: v }
  }
  return null
}

function buildRanges(cidrs: string[], version: 4 | 6) {
  const bits = version === 4 ? 32 : 128
  return cidrs.map((c) => {
    const [base, len] = c.split('/') as [string, string]
    const parsed = parseIp(base)!
    const shift = BigInt(bits - Number(len))
    return { network: parsed.value >> shift, shift }
  })
}

const RANGES = { 4: buildRanges(CLOUDFLARE_V4, 4), 6: buildRanges(CLOUDFLARE_V6, 6) }

export function isCloudflareIp(addr: string): boolean {
  const p = parseIp(addr)
  if (!p) return false
  return RANGES[p.version].some((r) => p.value >> r.shift === r.network)
}

/** Canonical bucket label: IPv4 as-is, IPv6 reduced to its /64, anything else verbatim. */
function bucketLabel(addr: string): string {
  const p = parseIp(addr)
  if (!p) return addr
  // Always render from the numeric value: canonicalises zero-padded / IPv4-mapped forms
  // so the same address can't be written two ways to get two buckets.
  if (p.version === 4) return [24n, 16n, 8n, 0n].map((s) => Number((p.value >> s) & 0xffn)).join('.')
  const prefix = (p.value >> 64n).toString(16).padStart(16, '0')
  return `${prefix.match(/.{4}/g)!.join(':')}::/64`
}

export function getClientIp(headers: Pick<Headers, 'get'>): string {
  const hops = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  const peer = hops[hops.length - 1]
  if (!peer) return 'unknown'

  if (isCloudflareIp(peer)) {
    const cf = headers.get('cf-connecting-ip')?.trim()
    if (cf && parseIp(cf)) return bucketLabel(cf)
    // Cloudflare peer but no usable client header: nearest non-Cloudflare hop, else the edge itself.
    for (let i = hops.length - 2; i >= 0; i--) {
      if (!isCloudflareIp(hops[i]!)) return bucketLabel(hops[i]!)
    }
    return bucketLabel(peer)
  }
  return bucketLabel(peer)
}
