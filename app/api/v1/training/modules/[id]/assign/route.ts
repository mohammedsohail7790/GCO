import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { assertOperatorInTeam } from '@/lib/auth/teamScope'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { assignModule } from '@/lib/training/service'
import { trainingRouteError } from '@/lib/training/http'

const Body = z.object({ operatorIds: z.array(z.string().max(100)).min(1).max(200) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'TRAINING_MANAGE')
    const { id } = await params
    const { operatorIds } = Body.parse(await req.json())
    const mod = await db.trainingModule.findUnique({ where: { id }, select: { tenantId: true } })
    if (!mod) return fail('Module not found', 404)
    // The operators decide the scope: each must belong to the caller's client (and, for a supervisor, to their team).
    const ops = await db.operator.findMany({ where: { id: { in: operatorIds } }, select: { id: true, tenantId: true } })
    if (ops.length !== new Set(operatorIds).size) return fail('Operator not found', 404)
    for (const o of ops) {
      const scope = resolveTenantScope(session, o.tenantId)
      if (scope !== o.tenantId || (mod.tenantId && mod.tenantId !== o.tenantId)) return fail('Operator not found', 404)
      await assertOperatorInTeam(session, o.id)
    }
    return ok(await assignModule({ moduleId: id, operatorIds, actorUserId: session.sub }))
  } catch (err) {
    return trainingRouteError(err)
  }
}
