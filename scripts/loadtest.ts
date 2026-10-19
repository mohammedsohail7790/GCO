import 'dotenv/config'
import crypto from 'crypto'
import { db } from '../lib/db/client'

// Lightweight, repeatable load test for the webhook->processed pipeline.
// Not a placeholder: fires real HTTP requests at a running instance, waits
// for real DB state, and reports measured percentiles - see docs/load-testing.md
// for how to run this and what was actually observed.
//
// Usage: npx tsx scripts/loadtest.ts <messagesPerMinute> <durationSeconds> [burstSize]

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const DEV_WEBHOOK_SECRET = process.env.DEV_WEBHOOK_SECRET ?? ''

function sign(body: string) {
  return crypto.createHmac('sha256', DEV_WEBHOOK_SECRET).update(body).digest('hex')
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]!
}

async function main() {
  const messagesPerMinute = parseInt(process.argv[2] ?? '100', 10)
  const durationSeconds = parseInt(process.argv[3] ?? '60', 10)
  const intervalMs = 60_000 / messagesPerMinute
  const totalMessages = Math.round((durationSeconds / 60) * messagesPerMinute)

  console.log(`Load test: ${messagesPerMinute} msgs/min for ${durationSeconds}s (~${totalMessages} messages, ${intervalMs.toFixed(0)}ms apart)`)

  const tenant = await db.tenant.upsert({
    where: { slug: 'loadtest-tenant' },
    update: {},
    create: { name: '[LOADTEST] Tenant', slug: 'loadtest-tenant' },
  })
  let integration = await db.integration.findFirst({ where: { tenantId: tenant.id, adapterKey: 'dev-mock' } })
  if (!integration) {
    integration = await db.integration.create({
      data: { tenantId: tenant.id, adapterKey: 'dev-mock', name: '[LOADTEST] Integration', config: {}, webhookSecret: DEV_WEBHOOK_SECRET },
    })
  } else if (integration.webhookSecret !== DEV_WEBHOOK_SECRET || integration.status !== 'ACTIVE') {
    // Every integration verifies with its OWN secret (a missing one fails closed with 401), so a stale test integration must be refreshed.
    integration = await db.integration.update({ where: { id: integration.id }, data: { webhookSecret: DEV_WEBHOOK_SECRET, status: 'ACTIVE' } })
  }
  if (!DEV_WEBHOOK_SECRET) throw new Error('DEV_WEBHOOK_SECRET must be set (the load test signs requests with it)')

  const webhookLatencies: number[] = []
  const statuses = new Map<number, number>()
  const runId = Date.now()
  const messageIds: string[] = []

  // BURST > 1 sends that many requests at the same instant (a thundering herd), then waits so the average rate stays as requested.
  const burst = Math.max(1, parseInt(process.argv[4] ?? '1', 10))
  const sendOne = async (i: number) => {
    const messageId = `loadtest-${runId}-${i}`
    messageIds.push(messageId)
    const body = JSON.stringify({
      events: [{ event_id: messageId, message_id: messageId, user_id: `loadtest-user-${runId}-${i}`, text: `load test message ${i}` }],
    })
    const start = Date.now()
    const res = await fetch(`${BASE_URL}/api/v1/webhooks/${integration!.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': sign(body) },
      body,
    })
    const elapsed = Date.now() - start
    webhookLatencies.push(elapsed)
    statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1)
    if (!res.ok && (statuses.get(res.status) ?? 0) <= 3) console.error(`  webhook ${i} failed: ${res.status}`)
    if (i % 200 === 0) console.log(`  sent ${i}/${totalMessages}, last webhook latency ${elapsed}ms`)
  }
  for (let i = 0; i < totalMessages; i += burst) {
    await Promise.all(Array.from({ length: Math.min(burst, totalMessages - i) }, (_, k) => sendOne(i + k)))
    await new Promise((r) => setTimeout(r, intervalMs * burst))
  }

  console.log('All webhooks sent. Waiting for full pipeline processing (up to 30s)...')
  const processingStart = Date.now()
  let processedCount = 0
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    processedCount = await db.message.count({
      where: { tenantId: tenant.id, externalMessageId: { in: messageIds } },
    })
    if (processedCount >= totalMessages) break
    await new Promise((r) => setTimeout(r, 500))
  }
  const processingElapsed = Date.now() - processingStart

  webhookLatencies.sort((a, b) => a - b)

  console.log('\n=== Results ===')
  console.log(`Messages sent: ${totalMessages}`)
  console.log(`HTTP statuses: ${[...statuses.entries()].map(([k, v]) => `${k}x${v}`).join(' ')}`)
  console.log(`Messages persisted (Message rows found): ${processedCount}/${totalMessages}`)
  console.log(`Time to drain queue after last send: ${processingElapsed}ms`)
  console.log(`Webhook HTTP response latency (ack, not full processing):`)
  console.log(`  p50: ${percentile(webhookLatencies, 50)}ms`)
  console.log(`  p95: ${percentile(webhookLatencies, 95)}ms`)
  console.log(`  p99: ${percentile(webhookLatencies, 99)}ms`)
  console.log(`  max: ${webhookLatencies[webhookLatencies.length - 1]}ms`)

  const assignedCount = await db.conversation.count({
    where: { tenantId: tenant.id, currentAssignmentId: { not: null } },
  })
  console.log(`Conversations auto-assigned: ${assignedCount}`)

  const failedJobs = await db.systemEvent.count({ where: { category: 'queue', severity: 'error' } })
  console.log(`Queue jobs that hit dead-letter during this run: ${failedJobs} (cumulative counter, check timestamps)`)

  // Cleanup
  await db.messageEvent.deleteMany({ where: { message: { tenantId: tenant.id } } })
  await db.usageRecord.deleteMany({ where: { tenantId: tenant.id } })
  await db.aiGeneration.deleteMany({ where: { tenantId: tenant.id } })
  await db.aiMemory.deleteMany({ where: { tenantId: tenant.id } })
  await db.conversation.updateMany({ where: { tenantId: tenant.id }, data: { currentAssignmentId: null } })
  await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId: tenant.id } } })
  await db.assignment.deleteMany({ where: { tenantId: tenant.id } })
  await db.message.deleteMany({ where: { tenantId: tenant.id } })
  await db.conversation.deleteMany({ where: { tenantId: tenant.id } })
  await db.webhookEvent.deleteMany({ where: { tenantId: tenant.id } })
  console.log('\nCleaned up load test data.')

  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
