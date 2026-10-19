import { db } from '@/lib/db/client'
import { isWithinOperatingHours, type OperatingHours } from '@/lib/tenant/settings'

/**
 * Live, client-safe operations snapshot for one client: queue and active counts, oldest wait, who is on the team (first name,
 * languages, availability - nothing else), today's response-time compliance. No conversation content, no internal notes.
 */
export async function clientLive(tenantId: string, now = new Date()) {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const [tenant, byState, oldest, operators, today, shiftsNow] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, status: true, timezone: true, operatingHours: true, defaultResponseSlaSeconds: true } }),
    db.conversation.groupBy({ by: ['state'], where: { tenantId, state: { notIn: ['CLOSED', 'FAILED'] } }, _count: { _all: true } }),
    db.conversation.findFirst({ where: { tenantId, state: { in: ['QUEUED', 'REASSIGNING'] } }, orderBy: { updatedAt: 'asc' }, select: { updatedAt: true } }),
    db.operator.findMany({ where: { tenantId, user: { isActive: true } }, orderBy: { operatorNumber: 'asc' }, select: { status: true, languages: true, capacity: true, user: { select: { displayName: true } } } }),
    db.assignment.findMany({ where: { tenantId, assignedAt: { gte: dayStart } }, select: { status: true, assignedAt: true, respondedAt: true, slaSeconds: true } }),
    db.shift.count({ where: { tenantId, status: 'SCHEDULED', startsAt: { lte: now }, endsAt: { gt: now } } }),
  ])
  const n = (s: string) => byState.find((x) => x.state === s)?._count._all ?? 0
  const answered = today.filter((a) => a.respondedAt)
  const onTime = answered.filter((a) => (a.respondedAt!.getTime() - a.assignedAt.getTime()) / 1000 <= a.slaSeconds).length
  const missed = today.filter((a) => a.status === 'EXPIRED').length
  const denom = answered.length + missed
  const online = operators.filter((o) => o.status === 'AVAILABLE' || o.status === 'BUSY')
  return {
    asOf: now.toISOString(),
    service: { status: tenant.status === 'ACTIVE' ? (online.length > 0 ? 'covered' : isWithinOperatingHours(tenant.timezone, tenant.operatingHours as OperatingHours | null, now) ? 'no-operator-online' : 'outside-hours') : 'paused', responseTargetSeconds: tenant.defaultResponseSlaSeconds },
    queue: { waiting: n('QUEUED') + n('REASSIGNING'), inProgress: n('ASSIGNED') + n('ACTIVE') + n('WAITING_FOR_OPERATOR'), waitingForCustomer: n('WAITING_FOR_CLIENT'), oldestWaitSeconds: oldest ? Math.max(0, Math.round((now.getTime() - oldest.updatedAt.getTime()) / 1000)) : null },
    team: { online: online.length, total: operators.length, onShiftNow: shiftsNow, members: operators.map((o) => ({ firstName: o.user.displayName.trim().split(/\s+/)[0] ?? '', status: o.status === 'AVAILABLE' || o.status === 'BUSY' ? 'online' : o.status === 'PAUSED' ? 'paused' : 'offline', languages: o.languages, capacity: o.capacity })) },
    today: { conversationsAssigned: today.length, answered: answered.length, onTimePercent: denom ? Math.round((onTime / denom) * 100) : null },
  }
}
