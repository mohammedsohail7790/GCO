// Approved, sanitized screenshots of the REAL GCO platform.
//
// Provenance: captured from the real GCO UI against an isolated local database containing only generic
// demo data (no production data, customers, operators or tenants). Cristian approved publication of these
// three. NOT approved for publication (do not add without explicit approval): the CRM/hunter pipeline and
// the client panel screenshots.
//
// Files live in /public/platform (optimised WebP, no metadata). Alt text must stay descriptive and factual.

export interface PlatformScreenshot {
  id: string
  src: string
  alt: string
  title: string
  caption: string
  body: string
  category: 'operator' | 'supervisor' | 'escalation'
  width: number
  height: number
}

export const PLATFORM_SCREENSHOTS: readonly PlatformScreenshot[] = [
  {
    id: 'operator-workspace',
    src: '/platform/operator-workspace.webp',
    alt: 'Operator workspace showing live conversation queue, response timers and escalation status',
    title: 'Operator workspace',
    caption: 'Operator workspace: assigned conversations with response timers and escalation status.',
    body: 'Operators work from a live conversation workspace with queue visibility, response timers, assignment and escalation status. AI can assist with drafting, while the human operator remains responsible for every reply.',
    category: 'operator',
    width: 2000,
    height: 1250,
  },
  {
    id: 'supervisor-operations',
    src: '/platform/supervisor-operations.webp',
    alt: 'Supervisor dashboard showing active conversations, operator workload and queue status',
    title: 'Supervisor operations',
    caption: 'Supervisor operations: queue, active conversations and operator workload at a glance.',
    body: 'Supervisors can monitor active conversations, operator workload and queue status from a centralized operational view. These indicators support day-to-day supervision; they are operational monitoring, not a guaranteed service level.',
    category: 'supervisor',
    width: 2000,
    height: 647,
  },
  {
    id: 'escalation-workflow',
    src: '/platform/escalation-workflow.webp',
    alt: 'Escalation workflow showing supervisor and client-decision stages',
    title: 'Escalation from operator to management',
    caption: 'Escalation queue: items at the supervisor stage and at the client-decision stage.',
    body: 'Defined escalation paths move conversations from operators to supervisors and, when required, to GCO management or the client for a decision.',
    category: 'escalation',
    width: 2000,
    height: 1590,
  },
]

export const PLATFORM_SCREENSHOT_NOTE = 'Screens show the real GCO platform with sanitized demo data.'
