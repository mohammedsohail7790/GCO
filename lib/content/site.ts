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
  | 'noCommitment' // the pilot carries no long-term commitment

/**
 * Business confirmation gates. Set to true ONLY after Cristian/the business
 * confirms the claim is currently deliverable.
 * Status at time of writing: none confirmed (see docs/website-v2-claims.md).
 */
export const CLAIMS: Record<ClaimKey, boolean> = {
  aroundTheClock: false,
  multilingual: false,
  qaProcess: false,
  escalationProcess: false,
  freePilot: false,
  noCommitment: false,
}

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
  body: 'GCO runs the conversation operations behind your business: trained human operators, supported by AI-assisted workflows and an operations platform, under active supervision.',
  note: 'Pilot scope, volume and coverage hours are agreed with you before Day 1.',
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
    label: 'Supervision',
    body: 'Managers oversee queues, assignments and response timers through the operations dashboard.',
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
  ...(CLAIMS.freePilot ? ['The 7-day pilot is free of charge.'] : []),
  ...(CLAIMS.noCommitment ? ['No long-term commitment is required to run the pilot.'] : []),
]

export const FINAL_CTA = {
  title: 'Ready to test GCO with your real workflow?',
  body: 'Start a 7-day pilot and evaluate the operation with your real workflow.',
} as const

// ---- Capability wording that depends on unconfirmed claims ----------------

export const CAPABILITY_STRIP: readonly string[] = [
  'Trained human operators',
  CLAIMS.aroundTheClock ? '24/7 coverage' : 'Coverage hours agreed per operation',
  CLAIMS.multilingual ? 'Multilingual operators' : 'Languages agreed per operation',
  'Supervision & oversight',
  'AI-assisted workflows',
  'Built to scale',
]

export const COVERAGE_SERVICE = CLAIMS.aroundTheClock
  ? { title: '24/7 Coverage', body: 'Shift-based staffing so conversations get a response regardless of time zone.' }
  : {
      title: 'Coverage Planning',
      body: 'Operating hours and shift coverage are defined with you during discovery, matched to when your conversations actually happen.',
    }

export const LANGUAGE_SERVICE = CLAIMS.multilingual
  ? { title: 'Multilingual Operator Teams', body: 'Teams staffed for the languages your users actually speak, not just your headquarters.' }
  : {
      title: 'Language Coverage',
      body: 'The languages your operation needs are defined during discovery and confirmed before a pilot starts.',
    }

export const SUPERVISION_SERVICE = CLAIMS.qaProcess
  ? { title: 'Quality Assurance & Supervision', body: 'Ongoing review of conversations against your standards, with feedback built into the operation.' }
  : {
      title: 'Supervision & Oversight',
      body: 'Managers monitor queues, assignments and response timers through the operations dashboard, so the operation is visible as well as staffed.',
    }

export const DESCRIPTIONS = {
  home: 'GCO provides trained human operator teams for chat operations, conversation engagement and support, supported by AI-assisted workflows and an operations platform, with active supervision.',
  services: CLAIMS.aroundTheClock && CLAIMS.multilingual
    ? 'Chat operations, conversation engagement, moderation, customer support, and multilingual, 24/7 managed operator teams from GCO.'
    : 'Chat operations, conversation engagement, moderation and customer support, run by trained human operator teams from GCO.',
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
  { href: '/industries', label: 'Industries', enabled: false },
  { href: '/platform', label: 'Platform', enabled: false },
  { href: '/how-it-works', label: 'How It Works', enabled: true },
  { href: '/resources', label: 'Resources', enabled: false },
  { href: '/about', label: 'About', enabled: true },
  { href: '/careers', label: 'Careers', enabled: true },
  { href: CONTACT_PATH, label: 'Contact', enabled: true },
]

export function getNavItems(): NavItem[] {
  return NAV_ITEMS.filter((i) => i.enabled)
}

// ---- Pilot form options (requirements the VISITOR describes; not GCO claims) ----

export const SERVICE_OPTIONS = [
  'Chat operations',
  'Conversation engagement',
  'Content & chat moderation',
  'Customer support operations',
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
