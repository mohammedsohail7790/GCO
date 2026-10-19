import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { submitTest } from '@/lib/training/service'
import { trainingRouteError } from '@/lib/training/http'

const Body = z.object({ answers: z.array(z.number().int().min(0).max(10)).max(40) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  try {
    const session = await requirePermission(req, 'TRAINING_VIEW_OWN')
    const { moduleId } = await params
    const { answers } = Body.parse(await req.json())
    const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true } })
    if (!op) return fail('Operator profile not found', 404)
    return ok(await submitTest(op.id, moduleId, answers))
  } catch (err) {
    return trainingRouteError(err)
  }
}
