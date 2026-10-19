import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { createModule } from '@/lib/training/service'
import { trainingRouteError } from '@/lib/training/http'

// Managers see the full module (including answers) of their own client plus company-wide modules.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TRAINING_MANAGE')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    return ok(await db.trainingModule.findMany({ where: { archivedAt: null, OR: [{ tenantId }, { tenantId: null }] }, orderBy: { createdAt: 'desc' }, take: 200 }))
  } catch (err) {
    return trainingRouteError(err)
  }
}

const Body = z
  .object({
    tenantId: z.string().max(100).optional(),
    companyWide: z.boolean().optional(),
    title: z.string().min(3).max(200),
    kind: z.enum(['MATERIAL', 'TEST']),
    body: z.string().max(20_000).default(''),
    questions: z.array(z.object({ q: z.string(), options: z.array(z.string()), correct: z.number().int() })).max(40).optional(),
    passMarkPercent: z.number().int().min(1).max(100).optional(),
    required: z.boolean().optional(),
    language: z.string().max(10).nullable().optional(),
  })
  .strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TRAINING_MANAGE')
    const body = Body.parse(await req.json())
    // Company-wide modules touch every client: CEO only. Everyone else is pinned to their own client.
    if (body.companyWide && session.role !== 'CEO_ADMIN') return fail('Only the CEO can create company-wide modules', 403)
    const tenantId = body.companyWide ? null : resolveTenantScope(session, body.tenantId ?? null)
    return ok(await createModule({ tenantId, title: body.title, kind: body.kind, body: body.body, questions: body.questions, passMarkPercent: body.passMarkPercent, required: body.required, language: body.language, actorUserId: session.sub }))
  } catch (err) {
    return trainingRouteError(err)
  }
}
