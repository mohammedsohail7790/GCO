// Single source for business-sensitive public-website wording.
//
// Every claim that has NOT been confirmed by the business is gated by a flag in
// CLAIMS below and defaults to false. Flipping a flag changes the wording
// everywhere it is used - no other file needs editing. Do not hardcode these
// phrases in components or pages.

export const PUBLIC_EMAIL = 'founder@globalconversationoperations.com'

export type ClaimKey =
  | 'aroundTheClock' // "24/7" coverage
  | 'multilingual' // multilingual operator teams
  | 'qaProcess' // a formal conversation QA/review process
  | 'escalationProcess' // a defined escalation process
  | 'freePilot' // the pilot is free of charge
  | 'noSetupFee' // no setup fee for the pilot
  | 'noCommitment' // the pilot carries no long-term commitment

/**
 * Business confirmation gates. Set to true ONLY when the business has confirmed the claim.
 * Status: all six approved by Cristian (Website V2 Phase B), each with the qualifier below.
 * Approved wording rules (see docs/website-v2-claims.md):
 *  - 24/7 is a capability subject to project staffing - never implied to be automatic for every client.
 *  - Languages are listed, and staffing is confirmed per project before go-live.
 *  - QA is "Supervision & QA" - no QA department, statistics or certifications are claimed.
 *  - Escalation is exactly Operator -> Supervisor / Team Lead -> GCO Management / Client Contact.
 */
export const CLAIMS: Record<ClaimKey, boolean> = {
  aroundTheClock: true,
  multilingual: true,
  qaProcess: true,
  escalationProcess: true,
  freePilot: true,
  noSetupFee: true,
  noCommitment: true,
}

/** Approved initial languages (staffing is confirmed per project before go-live). */
export const LANGUAGES = ['English', 'Italian', 'French', 'German', 'Spanish', 'Swedish'] as const
export const LANGUAGES_TEXT = 'English, Italian, French, German, Spanish and Swedish'
export const STAFFING_NOTE = 'Coverage hours and languages are confirmed per project, based on staffing, before go-live.'

// ---- CTA labels -----------------------------------------------------------

export const CTA = {
  pilot: CLAIMS.freePilot ? 'Start Your 7-Day Free Pilot' : 'Start Your 7-Day Pilot',
  pilotShort: CLAIMS.freePilot ? 'Start Free Pilot' : 'Start 7-Day Pilot',
  pilotFinal: CLAIMS.freePilot ? 'Start Your Free Pilot' : 'Start Your 7-Day Pilot',
  bookCall: 'Book a Call',
} as const

export const PILOT_PATH = '/pilot'
export const CONTACT_PATH = '/contact'

// ---- Hero -----------------------------------------------------------------

export const HERO = {
  eyebrow: 'Global Conversation Operations',
  headlineLead: CLAIMS.aroundTheClock ? '24/7 Human Conversation Operations.' : 'Human Conversation Operations.',
  headlineTail: 'Built to Scale.',
  body: 'GCO runs chat operations for modern platforms: trained human operators, supervised by team leads, supported by an operations platform and AI-assisted workflows.',
  note: 'Hours and languages are confirmed per project, based on staffing, before go-live.',
} as const

export const PILLARS = [
  {
    label: 'Human operators',
    body: 'Trained people hold the conversations and own every reply that is sent.',
  },
  {
    label: 'Operational infrastructure',
    body: 'Queues, assignment, response timers, reassignment and integrations that keep work organised at volume.',
  },
  {
    label: 'AI-assisted workflows',
    body: 'AI drafts suggested replies for the operator to review and edit. A human always sends.',
  },
  {
    label: 'Supervision & QA',
    body: 'Team leads supervise live work and review conversations, with a defined escalation path when a human decision is needed.',
  },
] as const

// ---- Pilot ----------------------------------------------------------------

export interface PilotStep {
  marker: string
  title: string
  body: string
}

// Matches docs/7-day-pilot.md (discovery/feasibility happens BEFORE Day 1).
export const PILOT_STEPS: readonly PilotStep[] = [
  {
    marker: 'Step 0',
    title: 'Discovery & feasibility',
    body: 'We understand your workflow, volume, requirements, languages, coverage and operational fit, and confirm any integration the pilot needs is feasible.',
  },
  {
    marker: 'Day 1',
    title: 'Setup & onboarding',
    body: 'We configure the workflow, access, queues and operating rules, and onboard operators to your tone and process.',
  },
  {
    marker: 'Days 2–6',
    title: 'Live pilot',
    body: 'We run your real workflow with the agreed operating model, within the agreed scope.',
  },
  {
    marker: 'Day 7',
    title: 'Performance review',
    body: 'We review operational results, issues, observations and next steps together.',
  },
  {
    marker: 'After Day 7',
    title: 'Scale',
    body: 'If the pilot is successful, we expand the operation based on your actual requirements.',
  },
]

export const PILOT_IS = [
  'Scoped in advance: channel(s), volume and hours are agreed before Day 1.',
  'Technical feasibility confirmed beforehand, with any client access arranged before the pilot starts.',
  'A monitored operation with real operators and supervision, for the agreed scope only.',
  'Reviewed at the end, with a clear conversation about continuing.',
] as const

export const PILOT_IS_NOT = [
  'Not unlimited custom development: new integrations outside the agreed scope are scoped as follow-on work.',
  'Not a substitute for the discovery step: a pilot starts once scope and access are settled.',
] as const

/** Commercial terms lines - only present once the business has confirmed them. */
export const PILOT_TERMS: readonly string[] = [
  ...(CLAIMS.freePilot ? ['The 7-day pilot is free.'] : []),
  ...(CLAIMS.noSetupFee ? ['No setup fee.'] : []),
  ...(CLAIMS.noCommitment ? ['No long-term commitment.'] : []),
  ...(CLAIMS.freePilot || CLAIMS.noCommitment ? ['After the pilot, you decide whether to continue, under agreed commercial terms.'] : []),
]

/** Short bullet form used in pilot callouts. */
export const PILOT_PROMISES: readonly string[] = [
  ...(CLAIMS.freePilot ? ['Free 7-day pilot'] : ['7-day pilot']),
  ...(CLAIMS.noSetupFee ? ['No setup fee'] : []),
  ...(CLAIMS.noCommitment ? ['No long-term commitment'] : []),
  'Continue after the pilot only if you choose',
]

export const FINAL_CTA = {
  title: 'Ready to test GCO with your real workflow?',
  body: 'Start a 7-day pilot and evaluate the operation with your real workflow.',
} as const

// ---- Capability wording --------------------------------------------------

export const CAPABILITY_STRIP: readonly string[] = [
  'Trained human operators',
  CLAIMS.aroundTheClock ? '24/7 coverage, per project staffing' : 'Coverage hours agreed per operation',
  CLAIMS.multilingual ? 'Multilingual operations' : 'Languages agreed per operation',
  CLAIMS.qaProcess ? 'Supervision & QA' : 'Supervision & oversight',
  CLAIMS.escalationProcess ? 'Defined escalation path' : 'AI-assisted workflows',
  'AI-assisted workflows',
]

export const DESCRIPTIONS = {
  home: 'GCO provides trained human operator teams for chat operations - live chat support, moderation and multilingual coverage - with supervision, QA and AI-assisted workflows. Start with a free 7-day pilot.',
} as const

// ---- Navigation -----------------------------------------------------------

export interface NavItem {
  href: string
  label: string
  /** false = route does not exist yet; hidden from navigation until enabled. */
  enabled: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/services', label: 'Services', enabled: true },
  { href: '/industries', label: 'Industries', enabled: true },
  { href: '/platform', label: 'Platform', enabled: true },
  { href: '/how-it-works', label: 'How It Works', enabled: true },
  { href: '/resources', label: 'Resources', enabled: true },
  { href: '/about', label: 'About', enabled: true },
  { href: '/careers', label: 'Careers', enabled: true },
  { href: CONTACT_PATH, label: 'Contact', enabled: true },
]

export function getNavItems(): NavItem[] {
  return NAV_ITEMS.filter((i) => i.enabled)
}

// ---- Pilot form options (requirements the VISITOR describes; not GCO claims) ----

export const SERVICE_OPTIONS = [
  'Live Chat / Customer Support',
  'Chat Moderation',
  'Community Moderation',
  'Multilingual Chat Operations',
  '24/7 Chat Coverage',
  'Dedicated / Outsourced Chat Teams',
  'Not sure yet',
] as const

export const VOLUME_OPTIONS = [
  'Under 1,000',
  '1,000 – 10,000',
  '10,000 – 50,000',
  '50,000+',
  'Not sure yet',
] as const

export const COVERAGE_OPTIONS = [
  'Business hours',
  'Extended hours',
  'Around the clock',
  'Not sure yet',
] as const
