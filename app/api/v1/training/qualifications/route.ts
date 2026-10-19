import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { assertOperatorInTeam } from '@/lib/auth/teamScope'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { grantQualification, revokeQualification } from '@/lib/training/service'
import { trainingRouteError } from '@/lib/training/http'
import { normalizeLanguage } from '@/lib/languages'

const Grant = z
  .object({ operatorId: z.string().max(100), kind: z.enum(['CLIENT_APPROVAL', 'SERVICE', 'LANGUAGE']), serviceType: z.enum(['LIVE_CHAT_SUPPORT', 'CHAT_MODERATION', 'COMMUNITY_MODERATION', 'MULTILINGUAL_CHAT', 'COVERAGE_24_7', 'DEDICATED_TEAM']).nullable().optional(), language: z.string().max(10).nullable().optional(), note: z.string().max(300).nullable().optional() })
  .strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TRAINING_MANAGE')
    const body = Grant.parse(await req.json())
    const op = await db.operator.findUnique({ where: { id: body.operatorId }, select: { tenantId: true } })
    if (!op) return fail('Operator not found', 404)
    if (resolveTenantScope(session, op.tenantId) !== op.tenantId) return fail('Operator not found', 404)
    await assertOperatorInTeam(session, body.operatorId)
    // Approving an operator for a client is a management decision: team leads may grant skills, not client approval.
    if (body.kind === 'CLIENT_APPROVAL' && session.role === 'SUPERVISOR') return fail('Client approval is granted by a manager', 403)
    const language = body.language ? normalizeLanguage(body.language) : null
    if (body.language && !language) return fail('Use a two-letter language code', 400)
    return ok(await grantQualification({ ...body, language, actorUserId: session.sub }))
  } catch (err) {
    return trainingRouteError(err)
  }
}

const Revoke = z.object({ id: z.string().max(100) }).strict()

export async function DELETE(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TRAINING_MANAGE')
    const { id } = Revoke.parse(await req.json())
    const q = await db.qualification.findUnique({ where: { id }, select: { tenantId: true, operatorId: true, kind: true } })
    if (!q) return fail('Qualification not found', 404)
    if (resolveTenantScope(session, q.tenantId) !== q.tenantId) return fail('Qualification not found', 404)
    await assertOperatorInTeam(session, q.operatorId)
    if (q.kind === 'CLIENT_APPROVAL' && session.role === 'SUPERVISOR') return fail('Client approval is revoked by a manager', 403)
    await revokeQualification({ id, tenantId: q.tenantId, actorUserId: session.sub })
    return ok({ id, revoked: true })
  } catch (err) {
    return trainingRouteError(err)
  }
}
