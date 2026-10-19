import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { PERMISSIONS } from '@/lib/auth/rbac'

// Money endpoints: every handler must check a permission, and rates/adjustments/payouts stay CEO-only.
const ROOTS = ['app/api/v1/admin/earnings', 'app/api/v1/operators/me/earnings'].map((r) => path.resolve(__dirname, '../..', r))
const walk = (d: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name === 'route.ts') out.push(p)
  }
  return out
}

describe('earnings routes', () => {
  for (const file of ROOTS.flatMap((r) => walk(r))) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b[\s\S]*?\n}\n/g)) {
      it(`${path.relative(process.cwd(), file)} ${m[1]} enforces a permission`, () => {
        expect(m[0]).toMatch(/requirePermission\(/)
      })
    }
  }
  it('only the CEO can set rates, adjust or pay; operators see only their own; clients and hunters see none', () => {
    expect(PERMISSIONS.PAYOUT_MANAGE).toEqual(['CEO_ADMIN'])
    expect(PERMISSIONS.EARNINGS_VIEW_OWN).toEqual(['OPERATOR'])
    expect(PERMISSIONS.EARNINGS_VIEW_OPERATOR).not.toContain('CLIENT')
    expect(PERMISSIONS.EARNINGS_VIEW_OPERATOR).not.toContain('OPERATOR')
    expect(PERMISSIONS.EARNINGS_VIEW_OPERATOR).not.toContain('HUNTER')
  })
})
