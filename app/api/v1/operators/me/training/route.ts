import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { trainingForOperator, trainingGate } from '@/lib/training/service'
import { trainingRouteError } from '@/lib/training/http'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TRAINING_VIEW_OWN')
    const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true } })
    if (!op) return fail('Operator profile not found', 404)
    const [modules, gate, quals] = await Promise.all([
      trainingForOperator(op.id),
      trainingGate(op.id),
      db.qualification.findMany({ where: { operatorId: op.id, revokedAt: null }, select: { id: true, kind: true, serviceType: true, language: true, grantedAt: true } }),
    ])
    return ok({ modules, gate, qualifications: quals })
  } catch (err) {
    return trainingRouteError(err)
  }
}
