import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'
import { languageLabel, operatorCoversLanguage } from '@/lib/languages'

/** Per language: conversations being handled (active) and waiting for an operator (queued), and whether any AVAILABLE operator can take them. Answered/closed conversations are not counted. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'VIEW_OPERATOR_DETAIL')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    const [operators, convs] = await Promise.all([
      db.operator.findMany({ where: { tenantId }, include: { user: { select: { displayName: true } } }, orderBy: { operatorNumber: 'asc' } }),
      db.conversation.findMany({ where: { tenantId, state: { in: ['QUEUED', 'REASSIGNING', 'ACTIVE', 'WAITING_FOR_OPERATOR'] } }, select: { language: true, state: true } }),
    ])
    const groups = new Map<string, { active: number; queued: number }>()
    for (const c of convs) {
      const key = c.language ?? ''
      const g = groups.get(key) ?? { active: 0, queued: 0 }
      if (c.state === 'QUEUED' || c.state === 'REASSIGNING') g.queued++
      else g.active++
      groups.set(key, g)
    }
    const available = operators.filter((o) => o.status === 'AVAILABLE')
    return ok({
      languages: [...groups.entries()]
        .map(([code, g]) => ({
          code: code || null,
          label: languageLabel(code || null),
          queued: g.queued,
          active: g.active,
          covered: available.some((o) => operatorCoversLanguage(o.languages, code || null)),
        }))
        .sort((a, b) => b.queued + b.active - (a.queued + a.active)),
      operators: operators.map((o) => ({ id: o.id, name: o.user.displayName, status: o.status, languages: o.languages })),
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
