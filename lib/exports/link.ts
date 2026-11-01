import { createHmac, timingSafeEqual } from 'node:crypto'

// A download link is a signed, short-lived token bound to ONE user and ONE exact export request. It carries no data, only the filter
// that was authorised; the file itself is produced again at download time (nothing is stored), after the session and permission are
// checked again. A link opened by anyone else, after expiry, or with an altered filter is refused.
export const EXPORT_LINK_TTL_SECONDS = 10 * 60

export interface ExportRequest {
  kind: 'usage' | 'invoices' | 'reconciliation' | 'operator-earnings'
  tenantId: string
  from: string // ISO date
  to: string // ISO date, exclusive
}
interface Payload extends ExportRequest { u: string; exp: number }

function key(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET is not configured')
  return `gco-export-link:${s}` // separate key purpose from session tokens
}
const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url')

export function createExportLink(userId: string, req: ExportRequest, now = Date.now()): { token: string; expiresAt: Date } {
  const exp = Math.floor(now / 1000) + EXPORT_LINK_TTL_SECONDS
  const body = Buffer.from(JSON.stringify({ ...req, u: userId, exp } satisfies Payload)).toString('base64url')
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1000) }
}

export function verifyExportLink(token: string, userId: string, now = Date.now()): ExportRequest | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = Buffer.from(sign(body))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload
    if (p.u !== userId || p.exp * 1000 < now) return null
    return { kind: p.kind, tenantId: p.tenantId, from: p.from, to: p.to }
  } catch {
    return null
  }
}
