import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, created, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'
import { defaults } from '@/lib/config/flags'

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  pricePerMessageEurCents: z.number().int().positive().optional(),
  operatorCostPerMessageEurCents: z.number().int().positive().optional(),
  defaultOperatorCapacity: z.number().int().positive().optional(),
  defaultResponseSlaSeconds: z.number().int().positive().optional(),
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

    const tenant = await db.tenant.create({
      data: {
        name: body.name,
        slug: body.slug,
        pricePerMessageEurCents: body.pricePerMessageEurCents ?? defaults.pricePerMessageEurCents,
        operatorCostPerMessageEurCents: body.operatorCostPerMessageEurCents ?? defaults.operatorCostPerMessageEurCents,
        defaultOperatorCapacity: body.defaultOperatorCapacity ?? defaults.operatorCapacity,
        defaultResponseSlaSeconds: body.defaultResponseSlaSeconds ?? defaults.responseSlaSeconds,
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
