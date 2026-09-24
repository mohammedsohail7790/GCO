import { NextRequest } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'

// Rotation is a deliberate, single-value overwrite - the old secret stops
// verifying immediately, no dual-secret grace period (confirmed business
// requirement: "old secret handling must be deliberate", not silent/implicit).
// A caller may supply their own secret (e.g. one issued by the client's
// platform) or omit it to have GCO generate a strong random one - either way
// the value is returned exactly once, here, and never again by any other
// endpoint or log line.
const Schema = z.object({
  secret: z.string().min(16).max(200).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'INTEGRATION_MANAGE')
    const { id } = await params
    const body = Schema.parse(await req.json())

    const existing = await db.integration.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!existing) return fail('Integration not found', 404)

    const newSecret = body.secret ?? crypto.randomBytes(32).toString('hex')

    await db.integration.update({ where: { id }, data: { webhookSecret: newSecret } })

    await writeAuditLog({
      tenantId: existing.tenantId,
      actorUserId: session.sub,
      action: 'integration.webhook_secret_rotated',
      resource: 'integration',
      resourceId: id,
      // Never the secret value itself - only that a rotation happened and who did it.
    })

    // Returned exactly once, on this response only - never persisted in a
    // log line, never returned by any GET/list endpoint afterward.
    return ok({ rotated: true, secret: newSecret })
  } catch (err) {
    return handleRouteError(err)
  }
}
