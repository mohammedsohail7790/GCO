import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { INSIDE_SECTIONS, INSIDE_WORKFLOW, INSIDE_VIDEO, INSIDE_DEMO_NOTE } from '@/lib/content/insideGco'
import { sitemapEntries } from '@/app/sitemap'

const pub = (p: string) => path.join(process.cwd(), 'public', p)
// Only the human-readable values (the key `lead` is a field name, not a sales lead).
const text = JSON.stringify([INSIDE_SECTIONS, INSIDE_WORKFLOW, INSIDE_VIDEO, INSIDE_DEMO_NOTE]).replace(/"lead":/g, '"intro":')

describe('Inside GCO page content', () => {
  it('covers exactly the six requested areas, in order', () => {
    expect(INSIDE_SECTIONS.map((s) => s.id)).toEqual(['operator-dashboard', 'queue-management', 'supervisor-dashboard', 'quality-control', 'multilingual-operations'])
    expect(INSIDE_WORKFLOW).toHaveLength(6) // the sixth area: the complete workflow
  })
  it('every image, the video, poster and captions exist; image sizes match the declared size', () => {
    for (const s of INSIDE_SECTIONS) {
      const f = fs.readFileSync(pub(s.image.src))
      expect(f.subarray(8, 12).toString()).toBe('WEBP')
      expect(s.image.alt.length).toBeGreaterThan(30)
    }
    for (const p of [INSIDE_VIDEO.src, INSIDE_VIDEO.poster, INSIDE_VIDEO.captions]) expect(fs.statSync(pub(p)).size).toBeGreaterThan(1000)
    expect(fs.readFileSync(pub(INSIDE_VIDEO.captions), 'utf8').startsWith('WEBVTT')).toBe(true)
  })
  it('stays inside the approved claims', () => {
    expect(text).not.toMatch(/guarantee|certified|\bISO\b|SOC ?2|99\.\d|automatic(ally)? translat|translates? (messages|automatically)|AI (sends|replies|answers)/i)
    expect(text).toMatch(/does not translate or detect language/)
    expect(text).toMatch(/Nothing is sent automatically/)
    expect(text).toMatch(/no invented performance number/)
    expect(INSIDE_DEMO_NOTE).toMatch(/fictional/)
  })
  it('does not show the CRM pipeline or client panel, or any real/internal detail', () => {
    expect(text).not.toMatch(/pipeline|commission|hunter|\bleads?\b(?!")|client panel|password|\.demo\.gco|localhost|api\/v1|\btokens?\b/i)
  })
  it('is listed in the sitemap', () => {
    expect(sitemapEntries().map((e) => e.path)).toContain('/inside-gco')
  })
})
