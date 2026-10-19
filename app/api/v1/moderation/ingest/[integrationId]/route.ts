import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { getAdapter } from '@/lib/integrations/registry'
import { ok, fail } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { isTenantActive } from '@/lib/tenant/activity'
import { ingestItems } from '@/lib/moderation/service'
import { moderationRouteError } from '@/lib/moderation/http'

export const dynamic = 'force-dynamic'
const MAX_BODY = 1_000_000

// Content items for moderation, sent by a client platform. Authenticated exactly like the message webhook: the integration's own
// secret and its adapter's signature check over the raw body (no new scheme). The payload shape below is GCO's PROPOSED contract -
// it must be confirmed with each real client before go-live (docs/moderation.md).
const Item = z.object({
  kind: z.enum(['MESSAGE', 'IMAGE', 'PROFILE', 'POST', 'COMMENT', 'REPORT']),
  externalItemId: z.string().min(1).max(200),
  subjectExternalId: z.string().min(1).max(200),
  reporterExternalId: z.string().max(200).nullable().optional(),
  content: z.string().max(10_000).nullable().optional(),
  mediaUrl: z.string().max(2000).nullable().optional(),
  flagReason: z.string().max(300).nullable().optional(),
  language: z.string().max(10).nullable().optional(),
  priority: z.number().int().min(0).max(5).optional(),
})
const Body = z.object({ items: z.array(Item).min(1).max(100) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  try {
    const { integrationId } = await params
    if (await isRateLimited(`mod-ingest:${integrationId}`, RATE_LIMITS.WEBHOOK.max, RATE_LIMITS.WEBHOOK.windowSeconds)) return fail('Rate limit exceeded', 429)
    const integration = await db.integration.findUnique({ where: { id: integrationId } })
    if (!integration || integration.status !== 'ACTIVE') return fail('Unknown or inactive integration', 404)
    if (!(await isTenantActive(integration.tenantId))) return fail('Tenant is not active', 409)
    if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return fail('Payload too large', 413)
    const raw = await req.text()
    if (Buffer.byteLength(raw) > MAX_BODY) return fail('Payload too large', 413)
    if (!integration.webhookSecret || !getAdapter(integration.adapterKey).verifyWebhookSignature(raw, req.headers, integration.webhookSecret)) return fail('Invalid signature', 401)
    let json: unknown
    try { json = JSON.parse(raw) } catch { return fail('Invalid JSON payload', 400) }
    const parsed = Body.safeParse(json)
    if (!parsed.success) return fail('Invalid payload', 400)
    return ok(await ingestItems(integration.tenantId, parsed.data.items), 200)
  } catch (err) {
    return moderationRouteError(err)
  }
}
