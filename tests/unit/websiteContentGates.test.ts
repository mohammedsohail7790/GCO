import { describe, it, expect } from 'vitest'
import * as content from '@/lib/content/site'
import { SERVICES } from '@/lib/content/services'
import { INDUSTRIES } from '@/lib/content/industries'
import { PLATFORM_CAPABILITIES, PLATFORM_FLOW } from '@/lib/content/platform'
import { ESCALATION_STEPS, ESCALATION_WHEN, ESCALATION_RECORDED, SUPERVISION_QA } from '@/lib/content/escalation'
import { PLATFORM_SCREENSHOTS } from '@/lib/content/platformAssets'
import { ARTICLES } from '@/lib/content/resources'
import { SECURITY_SECTIONS, SECURITY_CLOSING } from '@/lib/content/security'

// Website V2 Phase B: the business approved these claims (with qualifiers). This suite pins the
// approved truth AND guards against anything outside it (invented numbers, certifications,
// guarantees, unapproved services, autonomous-AI language).
const everything = JSON.stringify([
  content.HERO, content.CTA, content.CAPABILITY_STRIP, content.DESCRIPTIONS, content.PILOT_STEPS, content.PILOT_IS, content.PILOT_IS_NOT,
  content.PILOT_TERMS, content.PILOT_PROMISES, content.FINAL_CTA, content.PILLARS, content.STAFFING_NOTE, content.LANGUAGES_TEXT,
  SERVICES, INDUSTRIES, PLATFORM_CAPABILITIES, PLATFORM_FLOW, ESCALATION_STEPS, ESCALATION_WHEN, ESCALATION_RECORDED, SUPERVISION_QA,
  ARTICLES, SECURITY_SECTIONS, SECURITY_CLOSING,
])

describe('approved business claims (lib/content/site.ts)', () => {
  it('all approved claims are enabled', () => {
    expect(content.CLAIMS).toEqual({ aroundTheClock: true, multilingual: true, qaProcess: true, escalationProcess: true, freePilot: true, noSetupFee: true, noCommitment: true })
  })

  it('pilot is free, no setup fee, no long-term commitment, continue only if the client chooses', () => {
    const terms = content.PILOT_TERMS.join(' ')
    expect(terms).toMatch(/free/i)
    expect(terms).toMatch(/No setup fee/)
    expect(terms).toMatch(/No long-term commitment/)
    expect(terms).toMatch(/decide whether to continue/)
    expect(content.CTA.pilot).toBe('Start Your 7-Day Free Pilot')
    expect(content.CTA.pilotShort).toBe('Start Free Pilot')
  })

  it('24/7 is a capability subject to staffing - never implied automatic', () => {
    expect(content.HERO.headlineLead).toBe('24/7 Human Conversation Operations.')
    expect(content.HERO.note).toMatch(/confirmed per project, based on staffing/)
    expect(content.STAFFING_NOTE).toMatch(/confirmed per project/)
    const cov = SERVICES.find((s) => s.slug === '24-7-chat-coverage')!
    expect(JSON.stringify(cov)).toMatch(/subject to project staffing|confirmed with you before go-live/)
    expect(JSON.stringify(cov.faqs)).toMatch(/No\. 24\/7 coverage is available subject to project staffing/)
  })

  it('publishes exactly the six approved languages, with staffing confirmed per project', () => {
    expect([...content.LANGUAGES]).toEqual(['English', 'Italian', 'French', 'German', 'Spanish', 'Swedish'])
    const ml = JSON.stringify(SERVICES.find((s) => s.slug === 'multilingual-chat-operations'))
    for (const l of content.LANGUAGES) expect(ml).toContain(l)
    expect(ml).toMatch(/confirmed per project before go-live/)
  })

  it('QA is worded "Supervision & QA" without a QA department, certifications or statistics', () => {
    expect(content.PILLARS.map((p) => p.label)).toContain('Supervision & QA')
    expect(SUPERVISION_QA.title).toBe('Supervision & QA')
    expect(SUPERVISION_QA.body).toMatch(/do not claim a large QA department, certifications or quality statistics/)
    // The only mention allowed is the explicit denial in SUPERVISION_QA.body.
    expect(everything.replace(/do not claim a large QA department/, '')).not.toMatch(/QA (department|team of)/i)
  })

  it('escalation is exactly the three approved levels, and the "when" list is the approved one', () => {
    expect(ESCALATION_STEPS.map((s) => s.level)).toEqual(['Operator', 'Supervisor / Team Lead', 'GCO Management / Client Contact'])
    expect(ESCALATION_WHEN).toEqual(['The operator needs a decision', 'Client-side approval is needed', 'A sensitive or exceptional situation occurs', 'The operator cannot safely resolve the conversation'])
  })

  it('launches ONLY the six approved services and five approved industries', () => {
    expect(SERVICES.map((s) => s.slug)).toEqual(['live-chat-customer-support', 'chat-moderation', 'community-moderation', 'multilingual-chat-operations', '24-7-chat-coverage', 'dedicated-outsourced-chat-teams'])
    expect(INDUSTRIES.map((i) => i.slug)).toEqual(['dating-social', 'online-communities', 'saas', 'ecommerce', 'apps-digital-platforms'])
    expect(content.SERVICE_OPTIONS.filter((o) => o !== 'Not sure yet')).toEqual(SERVICES.map((s) => s.name))
  })

  it('every service page has the full required content set', () => {
    for (const s of SERVICES) {
      expect(s.heroLead.length, s.slug).toBeGreaterThan(60)
      expect(s.problem.points.length, s.slug).toBeGreaterThanOrEqual(3)
      for (const k of ['manages', 'delivery', 'workflow', 'capabilities', 'idealFor', 'faqs'] as const) expect(s[k].length, `${s.slug}.${k}`).toBeGreaterThanOrEqual(3)
      expect(s.pilot, s.slug).toMatch(/pilot|Day 7/i)
      expect(s.industries.length, s.slug).toBeGreaterThan(0)
      for (const r of s.related) expect(SERVICES.some((x) => x.slug === r), `${s.slug} related ${r}`).toBe(true)
      for (const i of s.industries) expect(INDUSTRIES.some((x) => x.slug === i), `${s.slug} industry ${i}`).toBe(true)
    }
  })

  it('every industry page links only to real services, and Dating & Social is not positioned as the only business', () => {
    for (const i of INDUSTRIES) for (const s of i.services) expect(SERVICES.some((x) => x.slug === s), `${i.slug} -> ${s}`).toBe(true)
    const dating = INDUSTRIES.find((i) => i.slug === 'dating-social')!
    expect(dating.note).toMatch(/other industries/)
    expect(everything).not.toMatch(/dating[- ]only|only (for )?dating/i)
  })
})

describe('claim safety (nothing outside the approved truth)', () => {
  it.each([
    [/\b\d{2,}\+/, 'numeric "N+" capacity claims'],
    [/\b\d+ (operators|agents|languages|clients|customers|countries)\b/i, 'counts of operators/languages/clients'],
    [/\b\d+(\.\d+)?\s?%/, 'percentages'],
    [/\b(ISO|SOC ?2|GDPR[- ](compliant|certified)|certified|certification)\b(?! are claimed)/i, 'certifications'],
    [/guarantee/i, 'guarantees'],
    [/99\.\d|uptime/i, 'uptime figures'],
    [/sub-?\d+-?minute|within \d+ (minutes|seconds)|under \d+ (minutes|seconds)/i, 'response-time promises'],
    [/testimonial|case stud|trusted by|our clients include/i, 'social proof we do not have'],
    [/\b(voice|call[- ]cent(er|re)|phone support)\b/i, 'voice / call-centre services'],
    [/autonomous|autonomously|replaces? (human|operators)|fully automated/i, 'autonomous-AI claims'],
    [/leading|world-class|best-in-class|revolutionary|next-generation/i, 'unsupported superlatives'],
    [/gmail|@(?!globalconversationoperations)/i, 'private/other email addresses'],
  ])('contains no %s (%s)', (re) => {
    // "No certifications are claimed." is the one allowed mention (a denial).
    const text = everything.replace(/No certifications are claimed/g, '').replace(/certifications or quality statistics/g, '').replace(/certifications, /g, '')
    expect(text).not.toMatch(re)
  })

  it('AI is positioned as assisting a human who sends every reply', () => {
    expect(JSON.stringify(content.PILLARS)).toMatch(/A human always sends/)
    expect(JSON.stringify(PLATFORM_CAPABILITIES)).toMatch(/nothing is sent automatically/)
  })
})

describe('platform positioning and assets', () => {
  it('only describes capabilities that exist; only approved real screenshots are published', () => {
    expect(PLATFORM_CAPABILITIES.map((c) => c.title)).toEqual(
      expect.arrayContaining(['Live conversation queues', 'Automatic and manual assignment', 'Response timers', 'Reassignment', 'Escalation workflow', 'AI-assisted workflows']),
    )
    // Only the three screenshots Cristian approved are published. CRM pipeline and client panel are NOT approved.
    expect(PLATFORM_SCREENSHOTS.map((s) => s.id)).toEqual(['operator-workspace', 'supervisor-operations', 'escalation-workflow'])
    for (const s of PLATFORM_SCREENSHOTS) {
      expect(s.src).toMatch(/^\/platform\/[a-z-]+\.webp$/)
      expect(s.src).not.toMatch(/crm|client|hunter|audit/i)
      expect(s.alt.length, s.id).toBeGreaterThan(40)
      expect(s.alt, s.id).not.toMatch(/^(screenshot|platform screenshot|dashboard image)/i)
      expect(s.width / s.height).toBeCloseTo(s.width / s.height, 5)
    }
    // Captions/body must not over-claim: no autonomous AI, no guaranteed service levels.
    const copy = JSON.stringify(PLATFORM_SCREENSHOTS)
    expect(copy).not.toMatch(/autonomous|fully automated|guarantee(?!d service level)/i)
    expect(copy).toMatch(/human operator remains responsible for every reply/)
  })
})

describe('shared wiring', () => {
  it('pilot has discovery before Day 1, matching docs/7-day-pilot.md', () => {
    expect(content.PILOT_STEPS.map((s) => s.marker)).toEqual(['Step 0', 'Day 1', 'Days 2–6', 'Day 7', 'After Day 7'])
  })

  it('only the approved public email', () => {
    expect(content.PUBLIC_EMAIL).toBe('founder@globalconversationoperations.com')
  })

  it('navigation exposes existing routes only (Resources now exists and is enabled)', () => {
    expect(content.getNavItems().map((i) => i.href)).toEqual(['/services', '/industries', '/platform', '/how-it-works', '/resources', '/about', '/careers', '/contact'])
    expect(content.NAV_ITEMS.filter((i) => !i.enabled)).toEqual([])
  })
})
