import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { completeMaterial } from '@/lib/training/service'
import { trainingRouteError } from '@/lib/training/http'

export async function POST(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  try {
    const session = await requirePermission(req, 'TRAINING_VIEW_OWN')
    const { moduleId } = await params
    const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true } })
    if (!op) return fail('Operator profile not found', 404)
    await completeMaterial(op.id, moduleId)
    return ok({ completed: true })
  } catch (err) {
    return trainingRouteError(err)
  }
}
