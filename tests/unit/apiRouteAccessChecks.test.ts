import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

// Structural guard over EVERY API route: each exported handler must check who is calling (session / permission / staging guard), unless it
// is on the short list of deliberately public or independently authenticated endpoints below. A new route that forgets its check fails here.
const ROOT = path.resolve(__dirname, '../../app/api/v1')
const walk = (d: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name === 'route.ts') out.push(p)
  }
  return out
}

/** Public or authenticated by something other than a user session - each with the reason. */
const EXEMPT: Record<string, string> = {
  'auth/login': 'password sign-in (rate limited)',
  'auth/logout': 'clears the caller\'s own cookie/session',
  'auth/refresh': 'refresh-token exchange',
  'auth/accept-invitation': 'one-time invitation token',
  'health': 'liveness probe, no data',
  'public/contact': 'public website form (rate limited, validated)',
  'public/careers/apply': 'public website form (rate limited, validated)',
  'webhooks/[integrationId]': 'client webhook: per-integration HMAC signature',
  'moderation/ingest/[integrationId]': 'client moderation feed: per-integration HMAC signature',
  'staging/clients': 'staging-only; stagingSession() answers 404 outside staging and for non-owners',
  'staging/outbox': 'staging-only; stagingSession()',
  'staging/simulate': 'staging-only; stagingSession()',
}
const CHECK = /requirePermission\(|getSession\(|assertCan\(|requireModerationOperator\(|stagingSession\(|scoped\(/

describe('every API handler checks the caller', () => {
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, path.dirname(file))
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b[\s\S]*?\n}\n/g)) {
      it(`${rel} ${m[1]}`, () => {
        if (rel in EXEMPT) return
        expect(m[0], `${rel} ${m[1]} has no access check - add requirePermission/getSession or list it (with a reason) in EXEMPT`).toMatch(CHECK)
      })
    }
  }
  it('the exempt list only names routes that exist', () => {
    const existing = new Set(walk(ROOT).map((f) => path.relative(ROOT, path.dirname(f))))
    for (const k of Object.keys(EXEMPT)) expect(existing.has(k), `stale exemption: ${k}`).toBe(true)
  })
})
