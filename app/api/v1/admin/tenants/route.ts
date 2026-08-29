import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, created, fail, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'
import { defaults } from '@/lib/config/flags'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  pricePerMessageEurCents: z.number().int().positive().optional(),
  operatorCostPerMessageEurCents: z.number().int().positive().optional(),
  defaultOperatorCapacity: z.number().int().positive().optional(),
  defaultResponseSlaSeconds: z.number().int().positive().optional(),
  messageCap: z.number().int().nonnegative().nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'VIEW_ALL_TENANTS')
    const tenants = await db.tenant.findMany({ orderBy: { createdAt: 'desc' } })
    return ok(tenants)
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TENANT_MANAGE')
    const body = CreateSchema.parse(await req.json())

    if (
      await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)
    ) {
      return fail('Rate limit exceeded', 429)
    }

    const tenant = await db.tenant.create({
      data: {
        name: body.name,
        slug: body.slug,
        pricePerMessageEurCents: body.pricePerMessageEurCents ?? defaults.pricePerMessageEurCents,
        operatorCostPerMessageEurCents: body.operatorCostPerMessageEurCents ?? defaults.operatorCostPerMessageEurCents,
        defaultOperatorCapacity: body.defaultOperatorCapacity ?? defaults.operatorCapacity,
        defaultResponseSlaSeconds: body.defaultResponseSlaSeconds ?? defaults.responseSlaSeconds,
        messageCap: body.messageCap ?? null,
      },
    })

    await writeAuditLog({
      actorUserId: session.sub,
      action: 'tenant.create',
      resource: 'tenant',
      resourceId: tenant.id,
      metadata: { name: tenant.name, slug: tenant.slug },
    })

    return created(tenant)
  } catch (err) {
    return handleRouteError(err)
  }
}
