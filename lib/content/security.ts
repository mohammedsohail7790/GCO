// Security & operational controls. EVERY item below is verified in the repository / deployed infrastructure
// (see docs/security.md and docs/website-v2-phase-c.md for where each is verified). Careful, modest language.
//
// NOT claimed (no evidence, do not add without verification and approval): any certification or attestation
// (SOC 2, ISO 27001, PCI DSS, HIPAA, GDPR certification), encryption at rest, multi-factor authentication,
// penetration testing, uptime figures, data-residency commitments.

export interface SecuritySection {
  id: string
  title: string
  body: string
  points: string[]
}

export const SECURITY_SECTIONS: SecuritySection[] = [
  {
    id: 'access-control',
    title: 'Access control',
    body: 'GCO uses role-based access controls. What a person can see and do depends on their role, and permissions are enforced on the server, not only hidden in the interface.',
    points: ['Separate roles for operators, supervisors, management, clients and sales users', 'Passwords are stored hashed, never in plain text', 'Sessions use short-lived signed tokens in HTTP-only, same-site cookies, and can be revoked on sign-out'],
  },
  {
    id: 'tenant-isolation',
    title: 'Client and tenant isolation',
    body: 'Each client operation is kept separate from others. Client users are pinned to their own tenant on the server regardless of what a request asks for.',
    points: ['Tenant-scoped data access across conversations, messages and escalations', 'Client users see only client-facing information, never internal operator or supervisor notes', 'Cross-tenant access is covered by automated tests'],
  },
  {
    id: 'transport',
    title: 'Transport security',
    body: 'The public website and the platform are served over HTTPS, and plain HTTP requests are redirected to HTTPS.',
    points: ['Certificates issued and renewed automatically', 'Cookies for signed-in sessions are marked secure in production'],
  },
  {
    id: 'auditability',
    title: 'Auditability',
    body: 'Sensitive actions on the platform are recorded with who did them and when, so operations can be reviewed.',
    points: ['Sign-ins and failed sign-ins, assignments, escalations and administrative changes are logged', 'Audit entries are designed not to contain secrets or the text of internal notes', 'Escalations keep a full timeline: who raised it, who handled it, each status change and the resolution'],
  },
  {
    id: 'webhooks',
    title: 'Webhook security',
    body: 'Messages arriving from a client\'s system are verified before they are accepted.',
    points: ['Inbound webhooks are verified with HMAC-SHA256 signatures using a separate secret per integration', 'Invalid signatures are rejected and nothing is stored', 'Duplicate deliveries are detected so a message is not processed twice'],
  },
  {
    id: 'rate-limiting',
    title: 'Rate limiting',
    body: 'Rate limits protect the platform and public forms against abuse and brute-force attempts.',
    points: ['Sign-in attempts, public forms and authenticated write actions are rate limited', 'Public contact and application forms also use a hidden spam trap and request-size limits'],
  },
  {
    id: 'backups',
    title: 'Backups',
    body: 'The production database is backed up every day.',
    points: ['Each backup is integrity-checked after it is created', 'A copy is stored offsite with a separate provider, and the upload is verified', 'Failures are surfaced rather than silently ignored'],
  },
  {
    id: 'monitoring',
    title: 'Monitoring',
    body: 'The platform exposes health checks and keeps operational records so problems can be seen and investigated.',
    points: ['Health checks cover the application, database and queue layer', 'Structured application logs', 'Background jobs that repeatedly fail are retained for review rather than lost'],
  },
  {
    id: 'data-handling',
    title: 'Operational data handling',
    body: 'Operational data is handled on a need-to-know basis.',
    points: ['Server-side secrets are kept in server configuration and are not exposed to the browser', 'When AI-assisted drafting is used, conversation context is sent to a third-party AI service to produce a draft; the AI credential is held only by the background worker, and a human operator reviews every reply before it is sent'],
  },
]

export const SECURITY_CLOSING = 'Additional security and data-handling requirements can be reviewed during onboarding.'
