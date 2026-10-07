import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { GCO_BOOKING_URL } from '@/lib/config/scheduling'

// Guards the booking wiring at the source level: the official URL lives in ONE place, nothing else hardcodes a Calendly
// destination, and no stale/placeholder GCO booking link can sneak back in.
const ROOT = path.resolve(__dirname, '../..')
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}
const publicSources = ['app', 'components', 'lib'].flatMap((d) => walk(path.join(ROOT, d)))
const rel = (f: string) => path.relative(ROOT, f)

describe('booking URL wiring', () => {
  it('the canonical constant is the only place the official booking URL appears in public source', () => {
    const hits = publicSources.filter((f) => fs.readFileSync(f, 'utf8').includes('calendly.com/cristianidiaghe9')).map(rel)
    expect(hits).toEqual(['lib/config/scheduling.ts'])
    expect(GCO_BOOKING_URL).toBe('https://calendly.com/cristianidiaghe9/30min')
  })

  it('no other Calendly destination is hardcoded anywhere in app/components/lib (stale or placeholder URLs)', () => {
    const allowedHost = /calendly\.com\/cristianidiaghe9\/30min/
    for (const f of publicSources) {
      const text = fs.readFileSync(f, 'utf8')
      for (const m of text.matchAll(/https?:\/\/[^\s'"`)]*calendly\.com[^\s'"`)]*/gi)) {
        expect(allowedHost.test(m[0]) || /calendly\.com\/\s*$/.test(m[0]), `${rel(f)}: ${m[0]}`).toBe(true)
      }
    }
  })

  it('booking CTAs are built from the shared helpers, not hand-written links to /contact or mailto', () => {
    const marketing = publicSources.filter((f) => /components\/marketing|app\/(page|pilot|contact|services|industries|platform|resources|security|about|how-it-works)/.test(rel(f)))
    for (const f of marketing) {
      const text = fs.readFileSync(f, 'utf8')
      // any element that declares itself a booking CTA must get its href from getBookCallTarget()/the shared components
      for (const m of text.matchAll(/data-cta="book-call"/g)) {
        expect(text, `${rel(f)} declares a booking CTA`).toMatch(/getBookCallTarget|bookCall\.href|CtaLinks/)
        void m
      }
    }
  })
})
