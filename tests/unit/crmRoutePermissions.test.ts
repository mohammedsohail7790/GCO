import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

// Structural guard: every handler under app/api/v1/crm must check a permission. The stage-change route once shipped
// without one (any signed-in role, even a CLIENT, could move a lead) - this prevents that class of mistake.
const ROOT = path.resolve(__dirname, '../../app/api/v1/crm')
const walk = (d: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name === 'route.ts') out.push(p)
  }
  return out
}

describe('CRM routes: every exported handler enforces a permission', () => {
  for (const file of walk(ROOT)) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b[\s\S]*?\n}\n/g)) {
      it(`${path.relative(ROOT, file)} ${m[1]}`, () => {
        expect(m[0], 'missing assertCan/requirePermission').toMatch(/assertCan\(|requirePermission\(/)
      })
    }
  }
})
