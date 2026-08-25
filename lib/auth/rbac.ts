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

  // Tickets
  TICKET_CREATE: ['CLIENT'],
  TICKET_MANAGE: ['CEO_ADMIN', 'MANAGER', 'ASSISTANT'],
  TICKET_VIEW_OWN: ['CLIENT'],
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
