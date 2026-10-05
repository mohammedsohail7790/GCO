import { describe, it, expect } from 'vitest'
import * as content from '@/lib/content/site'

// The public site must not assert business claims that have not been confirmed.
// While a CLAIMS flag is false, none of the wording derived from it may state it.
describe('business-claim gates (lib/content/site.ts)', () => {
  const unconfirmed = Object.entries(content.CLAIMS).filter(([, v]) => !v).map(([k]) => k)

  it('has no claim confirmed yet (update this test when Cristian confirms one)', () => {
    expect(unconfirmed.length).toBe(Object.keys(content.CLAIMS).length)
  })

  it('does not publish "24/7" or "free"/"no commitment" while unconfirmed', () => {
    const publicText = JSON.stringify([
      content.HERO,
      content.CTA,
      content.CAPABILITY_STRIP,
      content.COVERAGE_SERVICE,
      content.LANGUAGE_SERVICE,
      content.SUPERVISION_SERVICE,
      content.DESCRIPTIONS,
      content.PILOT_STEPS,
      content.PILOT_IS,
      content.PILOT_IS_NOT,
      content.PILOT_TERMS,
      content.FINAL_CTA,
      content.PILLARS,
    ])
    if (!content.CLAIMS.aroundTheClock) expect(publicText).not.toMatch(/24\s*\/\s*7/)
    if (!content.CLAIMS.freePilot) expect(publicText.toLowerCase()).not.toMatch(/\bfree\b/)
    if (!content.CLAIMS.noCommitment) expect(publicText.toLowerCase()).not.toMatch(/no long-term commitment|no commitment/)
    if (!content.CLAIMS.multilingual) expect(publicText.toLowerCase()).not.toMatch(/multilingual/)
    if (!content.CLAIMS.qaProcess) expect(publicText).not.toMatch(/quality assurance|\bQA\b/)
  })

  it('never claims AI replaces operators or sends messages', () => {
    const text = JSON.stringify([content.HERO, content.PILLARS]).toLowerCase()
    expect(text).not.toMatch(/replac/)
    expect(text).toContain('human always sends')
  })

  it('contains no fabricated numbers (operator counts, language counts, percentages)', () => {
    const text = JSON.stringify([content.HERO, content.PILLARS, content.PILOT_STEPS, content.CAPABILITY_STRIP])
    expect(text).not.toMatch(/\d+\s*\+|\d+\s*(operators|languages|clients)|\d+\s*%/i)
  })

  it('pilot has the discovery step before Day 1, matching docs/7-day-pilot.md', () => {
    expect(content.PILOT_STEPS.map((s) => s.marker)).toEqual(['Step 0', 'Day 1', 'Days 2–6', 'Day 7', 'After Day 7'])
  })

  it('CTA labels follow the freePilot gate', () => {
    expect(content.CTA.pilot).toBe(content.CLAIMS.freePilot ? 'Start Your 7-Day Free Pilot' : 'Start Your 7-Day Pilot')
  })

  it('only uses the approved public email', () => {
    expect(content.PUBLIC_EMAIL).toBe('founder@globalconversationoperations.com')
  })

  it('navigation only exposes routes that exist (future routes are disabled)', () => {
    const enabled = content.getNavItems().map((i) => i.href)
    expect(enabled).toEqual(['/services', '/how-it-works', '/about', '/careers', '/contact'])
    expect(content.NAV_ITEMS.filter((i) => !i.enabled).map((i) => i.href)).toEqual(['/industries', '/platform', '/resources'])
  })
})
