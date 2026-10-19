import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { fail, ok } from '@/lib/api/response'
import { REGIMES } from '@/lib/privacy/regimes'
import { updatePolicy } from '@/lib/privacy/service'
import { privacyRouteError } from '@/lib/privacy/http'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'PRIVACY_MANAGE')
    const tenantId = new URL(req.url).searchParams.get('tenantId')
    if (!tenantId) return ok({ regimes: Object.values(REGIMES) })
    const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { messageRetentionDays: true, regulations: true, dataRegion: true } })
    return t ? ok({ ...t, regimes: Object.values(REGIMES) }) : fail('Client not found', 404)
  } catch (err) {
    return privacyRouteError(err)
  }
}

const Body = z.object({ tenantId: z.string().max(100), messageRetentionDays: z.number().int().nullable().optional(), regulations: z.array(z.string().max(20)).max(8).optional(), dataRegion: z.string().max(100).nullable().optional() }).strict()

export async function PUT(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'PRIVACY_MANAGE')
    const { tenantId, ...patch } = Body.parse(await req.json())
    return ok(await updatePolicy(tenantId, patch, session.sub))
  } catch (err) {
    return privacyRouteError(err)
  }
}
