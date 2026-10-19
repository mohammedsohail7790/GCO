import type { Role } from '@prisma/client'
import { db } from '@/lib/db/client'

/** In-app notifications (the only channel today). `payload` carries ids and short labels, never conversation content. */
export async function notifyUsers(userIds: string[], type: string, payload: Record<string, unknown>, tenantId?: string | null) {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return 0
  const r = await db.notification.createMany({ data: ids.map((userId) => ({ userId, tenantId: tenantId ?? null, type, payload: payload as never })) })
  return r.count
}

/** GCO staff who handle a client's requests: CEO and assistants (global) plus the client's managers. */
export async function gcoContactsFor(tenantId: string): Promise<string[]> {
  const rows = await db.user.findMany({ where: { isActive: true, OR: [{ role: { in: ['CEO_ADMIN', 'ASSISTANT'] } }, { role: 'MANAGER', tenantId }] }, select: { id: true } })
  return rows.map((r) => r.id)
}

export async function clientContactsFor(tenantId: string): Promise<string[]> {
  return (await db.user.findMany({ where: { isActive: true, role: 'CLIENT', tenantId }, select: { id: true } })).map((r) => r.id)
}

export async function listFor(userId: string) {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, type: true, payload: true, readAt: true, createdAt: true } }),
    db.notification.count({ where: { userId, readAt: null } }),
  ])
  return { unread, notifications: rows }
}

export async function markRead(userId: string, ids?: string[]) {
  const r = await db.notification.updateMany({ where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } })
  return r.count
}

// ---- alert routing -----------------------------------------------------------------------------------------------------

export type Severity = 'critical' | 'warning' | 'info'
const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/** Defaults when nothing is configured: leadership hears about critical alerts, supervisors and managers also about warnings. */
export const DEFAULT_ROUTES: { role: Role; minSeverity: Severity; enabled: boolean }[] = [
  { role: 'CEO_ADMIN', minSeverity: 'critical', enabled: true },
  { role: 'ASSISTANT', minSeverity: 'warning', enabled: true },
  { role: 'MANAGER', minSeverity: 'warning', enabled: true },
  { role: 'SUPERVISOR', minSeverity: 'warning', enabled: true },
  { role: 'CTO', minSeverity: 'critical', enabled: true },
]

/** Pure: does a route deliver an alert of this severity? */
export const routeDelivers = (route: { minSeverity: string; enabled: boolean }, severity: Severity) => route.enabled && RANK[severity] <= (RANK[route.minSeverity as Severity] ?? 0)

export async function effectiveRoutes() {
  const stored = await db.alertRoute.findMany()
  const byRole = new Map(stored.map((r) => [r.role, r]))
  return DEFAULT_ROUTES.map((d) => byRole.get(d.role) ?? d)
}

/**
 * Tells the right people about a client's current alerts. One notification per person per alert per hour (so a standing alert is not
 * repeated every run). Managers and supervisors only hear about their own client; CEO/assistant/CTO hear about all.
 */
export async function dispatchAlerts(tenantId: string, alerts: { id: string; severity: Severity; title: string; detail: string }[], now = new Date()) {
  if (alerts.length === 0) return 0
  const routes = await effectiveRoutes()
  const users = await db.user.findMany({ where: { isActive: true, OR: [{ role: { in: ['CEO_ADMIN', 'ASSISTANT', 'CTO'] } }, { role: { in: ['MANAGER', 'SUPERVISOR'] }, tenantId }] }, select: { id: true, role: true } })
  const since = new Date(now.getTime() - 3_600_000)
  let sent = 0
  for (const a of alerts) {
    const to = users.filter((u) => { const r = routes.find((x) => x.role === u.role); return r ? routeDelivers(r, a.severity) : false })
    if (to.length === 0) continue
    const recent = await db.notification.findMany({ where: { tenantId, type: `alert:${a.id}`, userId: { in: to.map((u) => u.id) }, createdAt: { gte: since } }, select: { userId: true } })
    const already = new Set(recent.map((n) => n.userId))
    sent += await notifyUsers(to.map((u) => u.id).filter((id) => !already.has(id)), `alert:${a.id}`, { severity: a.severity, title: a.title, detail: a.detail }, tenantId)
  }
  return sent
}
