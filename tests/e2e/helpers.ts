import { request, type APIRequestContext } from '@playwright/test'
import crypto from 'crypto'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const DEV_WEBHOOK_SECRET = process.env.DEV_WEBHOOK_SECRET ?? ''

if (!DEV_WEBHOOK_SECRET) {
  throw new Error(
    'DEV_WEBHOOK_SECRET is not set in the environment running these tests - ' +
      'source .env before running `npm run test:e2e` (see docs/testing.md).',
  )
}

export function signWebhookBody(body: string): string {
  return crypto.createHmac('sha256', DEV_WEBHOOK_SECRET).update(body).digest('hex')
}

/** A fresh, independent cookie-jar session, logged in as the given user. */
export async function loginAs(email: string, password = 'DemoPassword123!'): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE_URL })
  const res = await ctx.post('/api/v1/auth/login', { data: { email, password } })
  if (!res.ok()) {
    throw new Error(`login failed for ${email}: ${res.status()} ${await res.text()}`)
  }
  return ctx
}

/** An unauthenticated context - for testing rejected/anonymous requests. */
export async function anonymousContext(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE_URL })
}

// The whole suite seeds many isolated tenants, each of which used to call
// loginAs('admin@demo.gco') fresh - that repeatedly tripped the app's own
// (correct, intentional) login rate limiter (10 attempts/15min per
// IP+email - see app/api/v1/auth/login/route.ts) once the suite grew past a
// handful of files. Share one admin session across the whole run instead.
let sharedAdminPromise: Promise<APIRequestContext> | null = null
export function sharedAdminContext(): Promise<APIRequestContext> {
  if (!sharedAdminPromise) sharedAdminPromise = loginAs('admin@demo.gco')
  return sharedAdminPromise
}

interface SeededTenant {
  tenantId: string
  slug: string
  integrationId: string
  operatorEmail: string
  operatorCtx: APIRequestContext
  managerEmail: string
  managerCtx: APIRequestContext
  clientEmail: string
  clientCtx: APIRequestContext
}

/**
 * Creates a fully isolated tenant (its own operator/manager/client users and
 * a dev-mock integration) for one test file to use, so tests never collide
 * with the seeded demo tenant or with each other. Cleaned up via cleanupTenant.
 */
export async function seedIsolatedTenant(namePrefix: string): Promise<SeededTenant> {
  const admin = await sharedAdminContext()
  const unique = `${namePrefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  const slug = unique.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  const tenantRes = await admin.post('/api/v1/admin/tenants', {
    data: { name: `[E2E] ${unique}`, slug, defaultResponseSlaSeconds: 120 },
  })
  if (!tenantRes.ok()) throw new Error(`tenant create failed: ${await tenantRes.text()}`)
  const tenant = (await tenantRes.json()).data
  const tenantId: string = tenant.id

  const password = 'DemoPassword123!'
  const operatorEmail = `operator-${unique}@e2e.gco`
  const managerEmail = `manager-${unique}@e2e.gco`
  const clientEmail = `client-${unique}@e2e.gco`

  const createUser = async (email: string, role: string) => {
    const res = await admin.post('/api/v1/admin/users', {
      data: { email, password, displayName: `[E2E] ${role} ${unique}`, role, tenantId },
    })
    if (!res.ok()) throw new Error(`user create failed (${role}): ${await res.text()}`)
  }
  await createUser(operatorEmail, 'OPERATOR')
  await createUser(managerEmail, 'MANAGER')
  await createUser(clientEmail, 'CLIENT')

  // Integration row isn't exposed via a dedicated admin endpoint yet (see
  // docs/mvp.md gaps) - create it directly against the DB via a thin internal
  // helper route is out of scope for V1, so tests seed it through Prisma.
  const { db } = await import('@/lib/db/client')
  const integration = await db.integration.create({
    data: { tenantId, adapterKey: 'dev-mock', name: `[E2E] Integration ${unique}`, config: {} },
  })

  const operatorCtx = await loginAs(operatorEmail, password)
  const managerCtx = await loginAs(managerEmail, password)
  const clientCtx = await loginAs(clientEmail, password)

  await operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })

  return {
    tenantId,
    slug,
    integrationId: integration.id,
    operatorEmail,
    operatorCtx,
    managerEmail,
    managerCtx,
    clientEmail,
    clientCtx,
  }
}

export async function sendWebhook(
  integrationId: string,
  events: Array<{ event_id: string; message_id: string; user_id: string; text: string }>,
  opts?: { badSignature?: boolean },
) {
  const ctx = await anonymousContext()
  const body = JSON.stringify({ events })
  const signature = opts?.badSignature ? 'deadbeef'.repeat(8) : signWebhookBody(body)
  const res = await ctx.post(`/api/v1/webhooks/${integrationId}`, {
    data: body,
    headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signature },
  })
  // Do NOT dispose ctx here - disposing an APIRequestContext also disposes
  // responses obtained from it, so callers that still need to read
  // res.json()/res.text() after this returns would get "Response has been
  // disposed". These are short-lived, one-shot contexts; leaving them
  // ungarbage-collected for the lifetime of a single test process is fine.
  return res
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs = 8000, intervalMs = 200) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

export async function cleanupTenant(tenantId: string) {
  const { db } = await import('@/lib/db/client')
  // Background queue jobs (analytics, delivery confirmation) can still be
  // in-flight for a few hundred ms after a test's assertions pass, and may
  // insert a MessageEvent between our delete calls - give them a moment,
  // then delete messageEvent twice (before AND immediately before the
  // Message delete) to close that race rather than flaking intermittently.
  await new Promise((r) => setTimeout(r, 500))
  await db.messageEvent.deleteMany({ where: { message: { tenantId } } })
  await db.usageRecord.deleteMany({ where: { tenantId } })
  await db.aiGeneration.deleteMany({ where: { tenantId } })
  await db.aiMemory.deleteMany({ where: { tenantId } })
  await db.note.deleteMany({ where: { tenantId } })
  await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId } } })
  await db.conversation.updateMany({ where: { tenantId }, data: { currentAssignmentId: null } })
  await db.assignment.deleteMany({ where: { tenantId } })
  await db.messageEvent.deleteMany({ where: { message: { tenantId } } })
  await db.message.deleteMany({ where: { tenantId } })
  await db.conversation.deleteMany({ where: { tenantId } })
  await db.webhookEvent.deleteMany({ where: { tenantId } })
  await db.integration.deleteMany({ where: { tenantId } })
  await db.ticketHistoryEntry.deleteMany({ where: { ticket: { tenantId } } })
  await db.ticket.deleteMany({ where: { tenantId } })
  await db.operatorService.deleteMany({ where: { tenantId } })
  await db.operator.deleteMany({ where: { tenantId } })
  await db.session.deleteMany({ where: { user: { tenantId } } })
  await db.user.deleteMany({ where: { tenantId } })
  await db.auditLog.deleteMany({ where: { tenantId } })
  await db.tenant.delete({ where: { id: tenantId } })
}
