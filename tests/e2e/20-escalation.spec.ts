import { test, expect, type APIRequestContext } from '@playwright/test'
import { WebSocket } from 'ws'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant, sharedAdminContext } from './helpers'
import { db } from '@/lib/db/client'

const REALTIME_URL = process.env.REALTIME_URL ?? 'ws://localhost:3001'

// Approved operational escalation workflow:
//   Operator -> Supervisor/Team Lead (MANAGER) -> GCO Management (CEO_ADMIN) / Client decision
// exercised through the real HTTP API, RBAC, tenant isolation, audit and realtime.
test.describe('operational escalation workflow', () => {
  let A: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let B: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let conversationA: string
  let conversationB: string
  let escalationId: string
  let admin: APIRequestContext

  const INTERNAL_NOTE = 'INTERNAL-ONLY operator note about a sensitive customer'
  const SUPERVISOR_NOTE = 'INTERNAL-ONLY supervisor note, do not show client'
  const CLIENT_SUMMARY = 'Please confirm whether we may offer a refund above the agreed limit.'

  async function conversationFor(t: typeof A, label: string) {
    const res = await sendWebhook(t.integrationId, [{ event_id: `ev-esc-${label}`, message_id: `msg-esc-${label}`, user_id: `user-esc-${label}`, text: 'I need help with a refund' }])
    expect(res.status()).toBe(202)
    let id = ''
    const ok = await waitFor(async () => {
      const ws = (await (await t.operatorCtx.get('/api/v1/operators/me/workspace')).json()).data
      id = ws.conversations[0]?.conversation.id ?? ''
      return !!id
    }, 12000)
    expect(ok).toBe(true)
    return id
  }

  test.beforeAll(async () => {
    admin = await sharedAdminContext()
    A = await seedIsolatedTenant('esc-a')
    B = await seedIsolatedTenant('esc-b')
    conversationA = await conversationFor(A, 'a')
    conversationB = await conversationFor(B, 'b')
  })

  test.afterAll(async () => {
    await cleanupTenant(A.tenantId)
    await cleanupTenant(B.tenantId)
  })

  test('operator can escalate: reason + note required, conversation becomes visibly escalated', async () => {
    const bad = await A.operatorCtx.post('/api/v1/escalations', { data: { conversationId: conversationA, reason: 'DECISION_NEEDED', note: 'x' } })
    expect(bad.status()).toBe(400) // note too short
    const badReason = await A.operatorCtx.post('/api/v1/escalations', { data: { conversationId: conversationA, reason: 'NOT_A_REASON', note: INTERNAL_NOTE } })
    expect(badReason.status()).toBe(400)

    const res = await A.operatorCtx.post('/api/v1/escalations', { data: { conversationId: conversationA, reason: 'SENSITIVE_SITUATION', note: INTERNAL_NOTE } })
    expect(res.status()).toBe(201)
    const body = (await res.json()).data
    escalationId = body.id
    expect(body).toMatchObject({ level: 'SUPERVISOR', status: 'OPEN', reason: 'SENSITIVE_SITUATION', conversationId: conversationA })
    expect(body.summary).toBeUndefined() // operator view is status-only
    expect(body.claimed).toBe(false)

    // Visible on the operator's workspace, without internal fields.
    const ws = (await (await A.operatorCtx.get('/api/v1/operators/me/workspace')).json()).data
    const esc = ws.conversations[0].conversation.escalations[0]
    expect(esc).toMatchObject({ id: escalationId, level: 'SUPERVISOR', status: 'OPEN' })
    expect(esc.summary).toBeUndefined()
    expect(esc.claimedByUserId).toBeUndefined()

    // One open escalation per conversation.
    const dup = await A.operatorCtx.post('/api/v1/escalations', { data: { conversationId: conversationA, reason: 'DECISION_NEEDED', note: 'second one' } })
    expect(dup.status()).toBe(409)
  })

  test('roles that must not escalate cannot; an operator cannot escalate a conversation they do not hold', async () => {
    for (const ctx of [A.managerCtx, A.clientCtx, admin]) {
      const r = await ctx.post('/api/v1/escalations', { data: { conversationId: conversationA, reason: 'DECISION_NEEDED', note: 'should be refused' } })
      expect(r.status()).toBe(403)
    }
    const anon = await (await import('./helpers')).anonymousContext()
    expect((await anon.post('/api/v1/escalations', { data: { conversationId: conversationA, reason: 'DECISION_NEEDED', note: 'anon attempt' } })).status()).toBe(401)
    // Tenant B's operator targeting tenant A's conversation: indistinguishable from "not yours".
    const cross = await B.operatorCtx.post('/api/v1/escalations', { data: { conversationId: conversationA, reason: 'DECISION_NEEDED', note: 'cross-tenant attempt' } })
    expect(cross.status()).toBe(404)
  })

  test('tenant isolation: tenant B cannot list, read or act on tenant A escalations', async () => {
    const list = (await (await B.managerCtx.get('/api/v1/escalations?includeResolved=1')).json()).data
    expect(list.find((e: any) => e.id === escalationId)).toBeUndefined()
    expect((await B.managerCtx.get(`/api/v1/escalations/${escalationId}`)).status()).toBe(404)
    expect((await B.operatorCtx.get(`/api/v1/escalations/${escalationId}`)).status()).toBe(404)
    expect((await B.clientCtx.get(`/api/v1/escalations/${escalationId}`)).status()).toBe(404)
    const act = await B.managerCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'claim' } })
    expect(act.status()).toBe(404)
    // A client cannot widen scope with a tenantId parameter.
    const sneaky = (await (await B.clientCtx.get(`/api/v1/escalations?tenantId=${A.tenantId}`)).json()).data
    expect(sneaky).toHaveLength(0)
  })

  test('supervisor sees it (with internal summary and conversation context), can claim once, and can add internal notes', async () => {
    const list = (await (await A.managerCtx.get('/api/v1/escalations')).json()).data
    const row = list.find((e: any) => e.id === escalationId)
    expect(row.summary).toBe(INTERNAL_NOTE)
    expect(row.conversation.externalUserId).toBeTruthy()

    const detail = (await (await A.managerCtx.get(`/api/v1/escalations/${escalationId}`)).json()).data
    expect(detail.messages.length).toBeGreaterThan(0) // MANAGER may read conversation content

    const claim = await A.managerCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'claim' } })
    expect(claim.status()).toBe(200)
    expect((await claim.json()).data).toMatchObject({ status: 'CLAIMED' })
    expect((await A.managerCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'claim' } })).status()).toBe(409)

    const note = await A.managerCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'note', body: SUPERVISOR_NOTE } })
    expect(note.status()).toBe(200)
    // Supervisors cannot post client-visible notes.
    expect((await A.managerCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'note', body: 'x', visibility: 'CLIENT' } })).status()).toBe(403)
    // The operator and client roles cannot act on it.
    expect((await A.operatorCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'resolve', resolution: 'self-resolve' } })).status()).toBe(403)
    // A client cannot even see a supervisor-level escalation, so it is "not found" (existence is hidden), never actionable.
    expect((await A.clientCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'resolve', resolution: 'client-resolve' } })).status()).toBe(404)
  })

  test('client cannot see supervisor-level escalations or any internal notes', async () => {
    expect((await (await A.clientCtx.get('/api/v1/escalations')).json()).data).toHaveLength(0)
    expect((await A.clientCtx.get(`/api/v1/escalations/${escalationId}`)).status()).toBe(404)
    // The operator sees status only - never the supervisor's notes.
    const opRes = await A.operatorCtx.get(`/api/v1/escalations/${escalationId}`)
    expect(opRes.status(), await opRes.text()).toBe(200)
    const opView = JSON.stringify((await opRes.json()).data)
    expect(opView).not.toContain(SUPERVISOR_NOTE)
    expect(opView).toContain('CLAIMED')
  })

  test('supervisor can escalate further to a client decision; supervisor cannot resolve at that level', async () => {
    const tooShort = await A.managerCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'escalate', note: 'ok', clientSummary: 'hi' } })
    expect(tooShort.status()).toBe(400)
    const esc = await A.managerCtx.post(`/api/v1/escalations/${escalationId}/actions`, {
      data: { action: 'escalate', note: 'Needs a refund decision from the client', clientSummary: CLIENT_SUMMARY },
    })
    expect(esc.status()).toBe(200)
    expect((await esc.json()).data).toMatchObject({ level: 'CLIENT_DECISION', status: 'OPEN' })
    expect((await A.managerCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'escalate', note: 'again again', clientSummary: 'again again' } })).status()).toBe(409)
    // Management-level only from here.
    expect((await A.managerCtx.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'resolve', resolution: 'supervisor tries to close' } })).status()).toBe(403)
  })

  test('client sees ONLY the client-facing view of a client-decision escalation (never internal notes)', async () => {
    const list = (await (await A.clientCtx.get('/api/v1/escalations')).json()).data
    expect(list).toHaveLength(1)
    const row = list[0]
    const raw = JSON.stringify(list)
    expect(row.id).toBe(escalationId)
    expect(row.summary).toBeUndefined()
    expect(row.raisedByUserId).toBeUndefined()
    expect(raw).toContain(CLIENT_SUMMARY)
    for (const secret of [INTERNAL_NOTE, SUPERVISOR_NOTE, 'refund decision from the client']) expect(raw).not.toContain(secret)

    const detail = JSON.stringify((await (await A.clientCtx.get(`/api/v1/escalations/${escalationId}`)).json()).data)
    for (const secret of [INTERNAL_NOTE, SUPERVISOR_NOTE]) expect(detail).not.toContain(secret)
    // And tenant B's client sees nothing of it.
    expect((await (await B.clientCtx.get('/api/v1/escalations')).json()).data).toHaveLength(0)
  })

  test('GCO management claims, adds a client-visible note, and resolves with a client-visible decision', async () => {
    expect((await admin.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'claim' } })).status()).toBe(200)
    expect((await admin.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'note', body: 'Contacting the client lead now', visibility: 'CLIENT' } })).status()).toBe(200)
    const resolve = await admin.post(`/api/v1/escalations/${escalationId}/actions`, {
      data: { action: 'resolve', resolution: 'Client approved a one-off refund.', clientNote: 'Approved: one-off refund permitted.' },
    })
    expect(resolve.status()).toBe(200)
    expect((await resolve.json()).data).toMatchObject({ status: 'RESOLVED', level: 'CLIENT_DECISION' })
    // Resolved items cannot be changed any more.
    expect((await admin.post(`/api/v1/escalations/${escalationId}/actions`, { data: { action: 'note', body: 'late note' } })).status()).toBe(409)

    const clientDetail = (await (await A.clientCtx.get(`/api/v1/escalations/${escalationId}`)).json()).data
    expect(clientDetail.status).toBe('RESOLVED')
    expect(clientDetail.events.map((e: any) => e.body)).toEqual(expect.arrayContaining([CLIENT_SUMMARY, 'Contacting the client lead now', 'Approved: one-off refund permitted.']))
    expect(JSON.stringify(clientDetail)).not.toContain('Client approved a one-off refund.') // internal resolution stays internal
  })

  test('audit + history are recorded for every transition, without note content in the audit log', async () => {
    const audits = await db.auditLog.findMany({ where: { tenantId: A.tenantId, resource: 'escalation', resourceId: escalationId }, orderBy: { createdAt: 'asc' } })
    expect(audits.map((a) => a.action)).toEqual([
      'escalation.raised',
      'escalation.claimed',
      'escalation.note',
      'escalation.escalated_to_client',
      'escalation.claimed',
      'escalation.note',
      'escalation.resolved',
    ])
    expect(audits.every((a) => a.actorUserId)).toBe(true)
    expect(JSON.stringify(audits)).not.toContain(INTERNAL_NOTE)
    expect(JSON.stringify(audits)).not.toContain(SUPERVISOR_NOTE)

    const row = await db.escalation.findUniqueOrThrow({ where: { id: escalationId } })
    expect(row.raisedByUserId).toBeTruthy()
    expect(row.claimedAt).toBeTruthy()
    expect(row.escalatedToClientAt).toBeTruthy()
    expect(row.resolvedByUserId).toBeTruthy()
    expect(row.resolvedAt).toBeTruthy()
    const events = await db.escalationEvent.findMany({ where: { escalationId }, orderBy: { createdAt: 'asc' } })
    expect(events.every((e) => e.tenantId === A.tenantId)).toBe(true)
    expect(events.length).toBeGreaterThanOrEqual(9)
  })

  test('realtime: the update reaches the same tenant only, and carries no content', async () => {
    const convB2 = conversationB
    const ticketA = (await (await A.managerCtx.get('/api/v1/realtime/ticket')).json()).data.ticket
    const ticketB = (await (await B.managerCtx.get('/api/v1/realtime/ticket')).json()).data.ticket
    const wsA = new WebSocket(`${REALTIME_URL}?token=${encodeURIComponent(ticketA)}`)
    const wsB = new WebSocket(`${REALTIME_URL}?token=${encodeURIComponent(ticketB)}`)
    const msgsA: string[] = []
    const msgsB: string[] = []
    wsA.on('message', (m) => msgsA.push(m.toString()))
    wsB.on('message', (m) => msgsB.push(m.toString()))
    await Promise.all([new Promise((r) => wsA.on('open', r)), new Promise((r) => wsB.on('open', r))])

    const SECRET = 'REALTIME-LEAK-CHECK-note'
    const res = await B.operatorCtx.post('/api/v1/escalations', { data: { conversationId: convB2, reason: 'CANNOT_RESOLVE_SAFELY', note: SECRET } })
    expect(res.status()).toBe(201)
    const id = (await res.json()).data.id
    await new Promise((r) => setTimeout(r, 1200))
    wsA.close()
    wsB.close()

    expect(msgsA.filter((m) => m.includes('ops.refresh'))).toHaveLength(0) // tenant A must not see tenant B's update
    const got = msgsB.filter((m) => m.includes('ops.refresh'))
    expect(got.length).toBeGreaterThan(0)
    expect(JSON.parse(got[0]!).payload).toEqual({ ref: id })
    for (const m of msgsB) expect(m).not.toContain(SECRET)
  })
})
