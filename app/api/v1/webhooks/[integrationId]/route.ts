import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db/client'
import { getAdapter } from '@/lib/integrations/registry'
import { enqueueMessageIngest } from '@/lib/queue/jobs'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { isTenantActive, isMessageCapReached } from '@/lib/tenant/activity'
import { logger } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'
/**
 * Inbound webhook entry point for a client integration. Per spec section 18:
 * verify -> validate -> persist raw event -> dedup -> enqueue -> return fast.
 * No AI/assignment/business logic runs synchronously here.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  try {
    const { integrationId } = await params

    // Rate limit before any DB/signature-verification work, so a flood
    // against one integration can't burn CPU/DB capacity that other tenants'
    // legitimate webhooks need. Keyed per-integration, not globally.
    if (await isRateLimited(`webhook:${integrationId}`, RATE_LIMITS.WEBHOOK.max, RATE_LIMITS.WEBHOOK.windowSeconds)) {
      return fail('Rate limit exceeded for this integration', 429)
    }

    const integration = await db.integration.findUnique({ where: { id: integrationId } })
    if (!integration || integration.status !== 'ACTIVE') {
      return fail('Unknown or inactive integration', 404)
    }

    // Enforce Tenant.status: a SUSPENDED/ARCHIVED tenant accepts no new inbound
    // traffic. This is the primary "stop the tap" control for a pilot or client
    // whose operation must be paused. Checked before any persistence.
    if (!(await isTenantActive(integration.tenantId))) {
      return fail('Tenant is not active', 409)
    }

    // Optional per-tenant message-volume cap (Tenant.messageCap, null =
    // uncapped). Rejects once the cap is reached so a controlled pilot has a
    // hard, enforceable ceiling on billable inbound messages.
    if (await isMessageCapReached(integration.tenantId)) {
      return fail('Tenant message volume cap reached', 429)
    }

    const rawBody = await req.text()
    const adapter = getAdapter(integration.adapterKey)

    // Business rule (confirmed): every integration has its own webhook
    // secret - no shared/global secret across unrelated clients. Previously
    // this read one global DEV_WEBHOOK_SECRET env var for every integration,
    // meaning anyone who learned it could forge webhooks against ANY
    // tenant's integration ID, not just their own. An integration with no
    // secret configured cannot possibly verify - fail closed, and log
    // (without ever logging the secret value itself) for operator visibility.
    if (!integration.webhookSecret) {
      logger.warn({ integrationId: integration.id }, 'webhook rejected: integration has no webhookSecret configured')
      return fail('Invalid webhook signature', 401)
    }
    if (!adapter.verifyWebhookSignature(rawBody, req.headers, integration.webhookSecret)) {
      return fail('Invalid webhook signature', 401)
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return fail('Invalid JSON payload', 400)
    }

    // externalEventId dedup key: prefer an explicit event id in the payload,
    // else hash the body (best-effort dedup for adapters without one).
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')
    const externalEventId =
      (payload as any)?.event_id ?? (payload as any)?.id ?? payloadHash

    const existing = await db.webhookEvent.findUnique({
      where: { integrationId_externalEventId: { integrationId: integration.id, externalEventId: String(externalEventId) } },
    })
    if (existing) {
      if (existing.processed) {
        // Genuine duplicate delivery (client retried after success) - ack without reprocessing.
        return ok({ received: true, deduplicated: true }, 200)
      }
      // Row was persisted on a prior attempt but never got enqueued/processed
      // (e.g. the process crashed or the queue call failed right after this
      // insert) - re-enqueue rather than silently swallowing it. enqueueMessageIngest
      // uses a deterministic jobId, so this is a safe no-op if a job already exists.
      await enqueueMessageIngest(existing.id)
      return ok({ received: true, eventId: existing.id, requeued: true }, 202)
    }

    const event = await db.webhookEvent.create({
      data: {
        tenantId: integration.tenantId,
        integrationId: integration.id,
        externalEventId: String(externalEventId),
        payloadHash,
        rawPayload: payload as any,
      },
    })

    await enqueueMessageIngest(event.id)

    return ok({ received: true, eventId: event.id }, 202)
  } catch (err) {
    return handleRouteError(err)
  }
}
