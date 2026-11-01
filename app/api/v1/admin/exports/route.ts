import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { writeAuditLog } from '@/lib/audit/log'
import { createExportLink } from '@/lib/exports/link'

// Step 1 of an export: the request is checked (permission, tenant, period), audited, and answered with a short-lived download link.
// Exports hold commercial figures (prices charged, operator pay), so they need BILLING_MANAGE like the screens they mirror.
const Schema = z.object({
  kind: z.enum(['usage', 'invoices', 'reconciliation', 'operator-earnings']),
  tenantId: z.string().min(1).max(64),
  from: z.string().date(),
  to: z.string().date(),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'BILLING_MANAGE')
    const body = Schema.parse(await req.json())
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const from = new Date(body.from)
    const to = new Date(body.to)
    if (to <= from || to.getTime() - from.getTime() > 93 * 86_400_000) return fail('Choose a period of up to 3 months (to is after from)', 400)
    if (!(await db.tenant.findUnique({ where: { id: body.tenantId }, select: { id: true } }))) return fail('Client not found', 404)

    const { token, expiresAt } = createExportLink(session.sub, body)
    await writeAuditLog({
      tenantId: body.tenantId,
      actorUserId: session.sub,
      action: 'export.requested',
      resource: 'export',
      resourceId: body.kind,
      metadata: { kind: body.kind, from: body.from, to: body.to },
    })
    return ok({ downloadUrl: `/api/v1/admin/exports/download?token=${encodeURIComponent(token)}`, expiresAt })
  } catch (err) {
    return handleRouteError(err)
  }
}
