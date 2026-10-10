import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { normalizeLanguage, normalizeLanguageList } from '@/lib/languages'
import { tryAssignConversation } from '@/lib/assignment/engine'

const Schema = z.object({ languages: z.array(z.string().max(10)).max(12) }).strict()

/** Set the languages an operator handles. An empty list means unrestricted. Queued conversations are re-tried afterwards. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'LANGUAGE_MANAGE')
    const { id } = await params
    const body = Schema.parse(await req.json())
    if (body.languages.some((l) => !normalizeLanguage(l))) return fail('Use two-letter language codes such as "en" or "es"', 400)
    const languages = normalizeLanguageList(body.languages)
    const operator = await db.operator.findUnique({ where: { id } })
    // Tenant scope: a MANAGER can only touch operators of their own tenant (resolveTenantScope refuses others with 403).
    const scope = resolveTenantScope(session, operator?.tenantId ?? null)
    if (!operator || operator.tenantId !== scope) return fail('Operator not found', 404)
    await db.operator.update({ where: { id }, data: { languages } })
    await writeAuditLog({ tenantId: operator.tenantId, actorUserId: session.sub, action: 'operator.languages_set', resource: 'operator', resourceId: id, metadata: { languages } })
    const queued = await db.conversation.findMany({ where: { tenantId: operator.tenantId, state: { in: ['QUEUED', 'REASSIGNING'] } }, select: { id: true }, take: 50 })
    for (const c of queued) await tryAssignConversation(c.id).catch(() => null)
    return ok({ id, languages })
  } catch (err) {
    return handleRouteError(err)
  }
}
