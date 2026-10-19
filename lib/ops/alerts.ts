import { db } from '@/lib/db/client'
import { languageLabel, operatorCoversLanguage } from '@/lib/languages'
import { isWithinOperatingHours, type OperatingHours } from '@/lib/tenant/settings'
import { coverageSlots } from '@/lib/shifts/coverage'

export type AlertSeverity = 'critical' | 'warning' | 'info'
export interface OpsAlert { id: string; severity: AlertSeverity; title: string; detail: string; count: number }

export const THRESHOLDS = { queueMinutes: 5, escalationUnclaimedMinutes: 15, slaWarnSeconds: 60, qaBacklog: 10 }

/**
 * Operational alerts for one tenant, computed on read from live data (no stored state, no email). Everything here
 * is derived from rows that already exist; nothing is guessed. Outside configured operating hours "nobody is
 * available" is downgraded to info, since nobody is expected to be.
 */
export async function computeAlerts(tenantId: string, now: Date = new Date()): Promise<OpsAlert[]> {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true, operatingHours: true } })
  const open = isWithinOperatingHours(tenant.timezone, tenant.operatingHours as OperatingHours | null, now)
  const alerts: OpsAlert[] = []

  const [queued, operators, active, openEscalations, expired, qaPending] = await Promise.all([
    db.conversation.findMany({ where: { tenantId, state: { in: ['QUEUED', 'REASSIGNING'] } }, select: { id: true, language: true, updatedAt: true } }),
    db.operator.findMany({ where: { tenantId, status: 'AVAILABLE' }, select: { languages: true } }),
    db.assignment.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { respondsBy: true } }),
    db.escalation.findMany({ where: { tenantId, status: 'OPEN' }, select: { createdAt: true } }),
    db.conversation.count({ where: { tenantId, state: 'EXPIRED' } }),
    db.message.count({ where: { tenantId, direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED'] }, createdAt: { gte: new Date(now.getTime() - 14 * 86400_000) } } }).then(async (sent) => {
      const reviewed = await db.qaReview.count({ where: { tenantId, createdAt: { gte: new Date(now.getTime() - 14 * 86400_000) } } })
      return Math.max(sent - reviewed, 0)
    }),
  ])

  // Waiting conversations nobody can take
  const uncovered = new Map<string, number>()
  for (const c of queued) if (!operators.some((o) => operatorCoversLanguage(o.languages, c.language))) uncovered.set(c.language ?? '', (uncovered.get(c.language ?? '') ?? 0) + 1)
  if (queued.length > 0 && operators.length === 0) {
    alerts.push({ id: 'no-operators', severity: open ? 'critical' : 'info', title: open ? 'No operator is available' : 'No operator available (outside operating hours)', detail: `${queued.length} conversation${queued.length === 1 ? ' is' : 's are'} waiting.`, count: queued.length })
  } else {
    for (const [lang, n] of uncovered) {
      alerts.push({ id: `language-${lang || 'none'}`, severity: open ? 'critical' : 'info', title: `No available operator for ${languageLabel(lang || null)}`, detail: `${n} conversation${n === 1 ? '' : 's'} waiting for ${languageLabel(lang || null)}. Bring a ${languageLabel(lang || null)}-speaking operator online or add the language to an available operator.`, count: n })
    }
  }

  const stale = queued.filter((c) => now.getTime() - c.updatedAt.getTime() > THRESHOLDS.queueMinutes * 60_000).length
  if (stale > 0) alerts.push({ id: 'queue-age', severity: 'warning', title: `Conversations waiting more than ${THRESHOLDS.queueMinutes} minutes`, detail: `${stale} in the queue.`, count: stale })

  const overdue = active.filter((a) => a.respondsBy.getTime() < now.getTime()).length
  if (overdue > 0) alerts.push({ id: 'sla-overdue', severity: 'critical', title: 'Response time exceeded', detail: `${overdue} active conversation${overdue === 1 ? ' has' : 's have'} passed the response deadline.`, count: overdue })
  const nearing = active.filter((a) => { const left = a.respondsBy.getTime() - now.getTime(); return left >= 0 && left <= THRESHOLDS.slaWarnSeconds * 1000 }).length
  if (nearing > 0) alerts.push({ id: 'sla-nearing', severity: 'warning', title: `Response deadline within ${THRESHOLDS.slaWarnSeconds} seconds`, detail: `${nearing} active conversation${nearing === 1 ? '' : 's'}.`, count: nearing })

  const unclaimed = openEscalations.filter((e) => now.getTime() - e.createdAt.getTime() > THRESHOLDS.escalationUnclaimedMinutes * 60_000).length
  if (unclaimed > 0) alerts.push({ id: 'escalation-unclaimed', severity: 'warning', title: 'Escalations waiting for a supervisor', detail: `${unclaimed} unclaimed for more than ${THRESHOLDS.escalationUnclaimedMinutes} minutes.`, count: unclaimed })
  if (expired > 0) alerts.push({ id: 'sla-capped', severity: 'critical', title: 'Conversations stopped after repeated missed deadlines', detail: `${expired} need a manager to resume them.`, count: expired })
  if (qaPending > THRESHOLDS.qaBacklog) alerts.push({ id: 'qa-backlog', severity: 'info', title: 'Quality review backlog', detail: `${qaPending} sent replies have not been reviewed.`, count: qaPending })

  // Shift planning: only when the client actually uses shifts, so unplanned clients get no noise.
  const horizon = new Date(now.getTime() + 8 * 3_600_000)
  const [shifts, absences, nowShifts] = await Promise.all([
    db.shift.findMany({ where: { tenantId, status: 'SCHEDULED', startsAt: { lt: horizon }, endsAt: { gt: now } }, select: { operatorId: true, startsAt: true, endsAt: true } }),
    db.absence.findMany({ where: { tenantId, startsAt: { lt: horizon }, endsAt: { gt: now } }, select: { operatorId: true, startsAt: true, endsAt: true } }),
    db.shift.findMany({ where: { tenantId, status: 'SCHEDULED', startsAt: { lte: new Date(now.getTime() - 10 * 60_000) }, endsAt: { gt: now } }, select: { operatorId: true } }),
  ])
  if (shifts.length > 0) {
    const gaps = coverageSlots({ from: new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000), to: horizon, timezone: tenant.timezone, hours: tenant.operatingHours as OperatingHours | null, shifts, absences }).filter((s) => s.gap).length
    if (gaps > 0) alerts.push({ id: 'coverage-gap', severity: 'warning', title: 'Missing shift coverage in the next 8 hours', detail: `${gaps} hour${gaps === 1 ? '' : 's'} inside operating hours have nobody scheduled.`, count: gaps })
  }
  if (nowShifts.length > 0) {
    const absentNow = new Set(absences.filter((a) => a.startsAt <= now && a.endsAt > now).map((a) => a.operatorId))
    const expected = [...new Set(nowShifts.map((s) => s.operatorId))].filter((id) => !absentNow.has(id))
    const online = await db.operator.findMany({ where: { id: { in: expected }, status: { in: ['AVAILABLE', 'BUSY'] } }, select: { id: true } })
    const missing = expected.length - online.length
    if (missing > 0) alerts.push({ id: 'shift-not-online', severity: 'warning', title: 'Operators on shift are not online', detail: `${missing} operator${missing === 1 ? ' is' : 's are'} scheduled now (for more than 10 minutes) but not available.`, count: missing })
  }

  const rank = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity])
}
