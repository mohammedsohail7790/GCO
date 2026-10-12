import type { Role } from '@prisma/client'

// Central permission matrix. Backend is the sole enforcement point - the
// frontend may also read this to hide UI, but that is a UX convenience only.
export const PERMISSIONS = {
  // Tenant / org administration
  TENANT_MANAGE: ['CEO_ADMIN'],
  USER_MANAGE: ['CEO_ADMIN'],
  OPERATOR_MANAGE: ['CEO_ADMIN', 'MANAGER'],
  PERMISSION_MANAGE: ['CEO_ADMIN'],
  AI_CONFIG_MANAGE: ['CEO_ADMIN'],
  FEATURE_FLAG_MANAGE: ['CEO_ADMIN'],
  INTEGRATION_MANAGE: ['CEO_ADMIN'],

  // Visibility
  VIEW_ALL_TENANTS: ['CEO_ADMIN'],
  VIEW_SYSTEM_METRICS: ['CEO_ADMIN', 'MANAGER', 'ASSISTANT'],
  VIEW_AUDIT_LOGS: ['CEO_ADMIN'],
  VIEW_REVENUE: ['CEO_ADMIN'],
  VIEW_TENANT_ANALYTICS: ['CEO_ADMIN', 'MANAGER', 'CLIENT'],
  VIEW_OPERATOR_DETAIL: ['CEO_ADMIN', 'MANAGER'],
  VIEW_CONVERSATION_CONTENT: ['CEO_ADMIN', 'MANAGER', 'OPERATOR'],

  // Operations
  CONVERSATION_HANDLE: ['OPERATOR'],
  CONVERSATION_REASSIGN: ['CEO_ADMIN', 'MANAGER', 'ASSISTANT'],
  QUEUE_INSPECT: ['CEO_ADMIN', 'MANAGER', 'ASSISTANT'],
  QUEUE_RECOVER: ['CEO_ADMIN', 'ASSISTANT'],
  EMERGENCY_ACTIONS: ['CEO_ADMIN', 'ASSISTANT'],

  // Operational escalation (Operator -> Supervisor/Team Lead -> GCO Management / Client contact)
  ESCALATION_CREATE: ['OPERATOR'],
  // Supervisor / team-lead level: view queue, claim, internal notes, resolve, escalate to client decision.
  ESCALATION_HANDLE: ['MANAGER', 'ASSISTANT', 'CEO_ADMIN'],
  // GCO management / client-contact level: handle CLIENT_DECISION escalations.
  ESCALATION_MANAGE_CLIENT_DECISION: ['CEO_ADMIN', 'ASSISTANT'],
  // Clients see only client-facing information on escalations awaiting their decision.
  ESCALATION_VIEW_CLIENT: ['CLIENT'],

  // Tickets
  TICKET_CREATE: ['CLIENT'],
  TICKET_MANAGE: ['CEO_ADMIN', 'MANAGER', 'ASSISTANT'],
  TICKET_VIEW_OWN: ['CLIENT'],

  // Sales CRM - leads
  LEAD_CREATE: ['HUNTER', 'MANAGER', 'CEO_ADMIN'],
  LEAD_VIEW_OWN: ['HUNTER'],
  LEAD_VIEW_TEAM: ['MANAGER', 'CEO_ADMIN'],
  LEAD_CLAIM: ['HUNTER'],
  // Moving a lead through the pipeline. A Hunter only on their own lead (enforced in the route); Manager/CEO anywhere.
  // Closed Won is never reachable here - only the approval path can set it.
  LEAD_STAGE_CHANGE: ['HUNTER', 'MANAGER', 'CEO_ADMIN'],
  LEAD_RELEASE: ['HUNTER', 'MANAGER', 'CEO_ADMIN'],

  // Sales CRM - approvals
  APPROVAL_SUBMIT: ['HUNTER'],
  APPROVAL_DECIDE: ['MANAGER', 'CEO_ADMIN'],

  // Sales CRM - commissions & revenue
  COMMISSION_VIEW_OWN: ['HUNTER'],
  COMMISSION_VIEW_TEAM: ['MANAGER', 'CEO_ADMIN'],
  COMMISSION_CONFIGURE: ['CEO_ADMIN'],
  PAYOUT_MANAGE: ['CEO_ADMIN'],
  REVENUE_RECORD: ['MANAGER', 'CEO_ADMIN'],

  // Sales CRM - BPO handoff recovery
  BPO_HANDOFF_MANAGE: ['CEO_ADMIN', 'ASSISTANT'],
  // Client onboarding console (provisioning status, invitation links, confirmations). Manager is deliberately
  // NOT included: onboarding exposes client contact data and issues login links.
  ONBOARDING_VIEW: ['CEO_ADMIN', 'ASSISTANT'],
  ONBOARDING_MANAGE: ['CEO_ADMIN', 'ASSISTANT'],
  // Invite a client's operators/managers by one-time setup link (they choose their own password).
  STAFF_INVITE: ['CEO_ADMIN', 'ASSISTANT'],
  STAGING_TOOLS: ['CEO_ADMIN'], // staging environment only (see lib/config/environment.ts)
  // Go-live activates the client's integrations - CEO only.
  ONBOARDING_GO_LIVE: ['CEO_ADMIN'],
  // A client's own (client-safe) onboarding progress.
  ONBOARDING_VIEW_OWN: ['CLIENT'],

  // Language coverage (which languages each operator handles) and quality review of sent replies. Tenant-scoped via
  // resolveTenantScope: MANAGER is pinned to its own tenant; CEO_ADMIN/ASSISTANT may target a tenant.
  LANGUAGE_MANAGE: ['CEO_ADMIN', 'MANAGER', 'ASSISTANT'],
  QA_REVIEW: ['CEO_ADMIN', 'MANAGER', 'ASSISTANT'],

  // Conversation lifecycle, history and operations visibility
  CONVERSATION_RESOLVE: ['OPERATOR', 'MANAGER', 'CEO_ADMIN', 'ASSISTANT'],
  CONVERSATION_REOPEN: ['MANAGER', 'CEO_ADMIN', 'ASSISTANT'],
  CONVERSATION_NOTE_ADD: ['OPERATOR', 'MANAGER', 'CEO_ADMIN', 'ASSISTANT'],
  CONVERSATION_SEARCH: ['MANAGER', 'CEO_ADMIN', 'ASSISTANT'],
  OPS_ALERTS_VIEW: ['MANAGER', 'CEO_ADMIN', 'ASSISTANT'],
  // Per-client SLA / capacity / operating hours. Managers and clients can read; only CEO/assistant change them.
  TENANT_SETTINGS_VIEW: ['CEO_ADMIN', 'ASSISTANT', 'MANAGER', 'CLIENT'],
  TENANT_SETTINGS_MANAGE: ['CEO_ADMIN', 'ASSISTANT'],

  // Public website - careers applications
  // Applicant personal data: CEO only (previously the list API also allowed MANAGER, which had no UI).
  CAREER_VIEW: ['CEO_ADMIN'],
  CAREER_MANAGE: ['CEO_ADMIN'],
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export function can(role: Role, permission: PermissionKey): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role)
}

export function assertCan(role: Role, permission: PermissionKey) {
  if (!can(role, permission)) {
    const err = new Error(`Forbidden: role ${role} lacks permission ${permission}`)
    ;(err as any).status = 403
    throw err
  }
}
