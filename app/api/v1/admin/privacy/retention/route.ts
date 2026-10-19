import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok } from '@/lib/api/response'
import { purgeCareerApplications, runRetention } from '@/lib/privacy/service'
import { privacyRouteError } from '@/lib/privacy/http'

const Body = z.object({ tenantId: z.string().max(100).optional(), dryRun: z.boolean().default(true), careerApplicationsOlderThanDays: z.number().int().min(30).max(3650).optional() }).strict()

// Dry run by default: shows what would be removed. A real run removes personal content only from conversations past the client's window.
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'PRIVACY_MANAGE')
    const body = Body.parse(await req.json().catch(() => ({})))
    const clients = await runRetention({ tenantId: body.tenantId, dryRun: body.dryRun, actorUserId: session.sub })
    const applications = body.careerApplicationsOlderThanDays && !body.dryRun ? await purgeCareerApplications(body.careerApplicationsOlderThanDays) : null
    return ok({ dryRun: body.dryRun, clients, applications })
  } catch (err) {
    return privacyRouteError(err)
  }
}
