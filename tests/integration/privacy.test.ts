import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { runRetention, updatePolicy, createDataRequest, executeDataRequest, rejectDataRequest, anonymiseUser, purgeCareerApplications, exportSubject, PrivacyError } from '@/lib/privacy/service'
import { syncEarnings, createRateCard } from '@/lib/earnings/ledger'
import { getEarningsSummary } from '@/lib/earnings/summary'

describe('privacy: retention, data-subject requests and anonymisation (real database)', () => {
  const base = `pv-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const D = 86_400_000
  const mkTenant = async (tag: string, extra: object = {}) => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}`, ...extra } }); tenantIds.push(t.id); return t.id }
  const mkUser = async (tenantId: string, tag: string, role: 'OPERATOR' | 'CLIENT' = 'OPERATOR') => { const u = await db.user.create({ data: { email: `${base}-${tag}@test.gco`, passwordHash: 'x', role, tenantId, displayName: `Real Name ${tag}` } }); userIds.push(u.id); return u }
  const mkConv = async (tenantId: string, externalUserId: string, age: number, operatorId?: string) => {
    const at = new Date(Date.now() - age * D)
    const c = await db.conversation.create({ data: { tenantId, externalUserId, state: 'CLOSED', closedAt: at, createdAt: at } })
    const m = await db.message.create({ data: { tenantId, conversationId: c.id, direction: 'OUTBOUND', status: 'DELIVERED', content: `private text ${externalUserId}`, externalMessageId: `${base}-${Math.random()}`, operatorId: operatorId ?? null, createdAt: at } })
    await db.note.create({ data: { tenantId, conversationId: c.id, authorUserId: 'x', body: 'private note' } })
    await db.aiMemory.create({ data: { tenantId, conversationId: c.id, externalUserId, type: 'FACT' as never, value: 'likes cats', confidence: 0.9, sourceMessageId: m.id } }).catch(() => null)
    return { conv: c.id, msg: m.id }
  }

  afterAll(async () => {
    const ops = (await db.operator.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } })).map((o) => o.id)
    await db.operatorEarningLine.deleteMany({ where: { operatorId: { in: ops } } })
    await db.operatorRateCard.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.dataRequest.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.webhookEvent.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.integration.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.usageRecord.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.escalationEvent.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.escalation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.aiMemory.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.note.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.session.deleteMany({ where: { userId: { in: userIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
    await db.careerApplication.deleteMany({ where: { OR: [{ email: { startsWith: base } }, { fullName: '[removed]', createdAt: { lt: new Date(Date.now() - 400 * D) } }] } })
  })

  it('retention removes personal content past the window, keeps the skeleton, and never touches clients without a window', async () => {
    const t = await mkTenant('ret', { messageRetentionDays: 30 }); const free = await mkTenant('free')
    const old = await mkConv(t, 'cust-old', 90); const fresh = await mkConv(t, 'cust-new', 5); const untouched = await mkConv(free, 'cust-free', 400)
    const dry = await runRetention({ tenantId: t, dryRun: true })
    expect(dry[0]!.counts).toEqual({ wouldRedactConversations: 1 })
    expect((await db.message.findUniqueOrThrow({ where: { id: old.msg } })).content).toContain('private text') // dry run changed nothing
    const run = await runRetention({ tenantId: t })
    expect(run[0]!.counts).toMatchObject({ conversations: 1, messages: 1, notes: 1 })
    const m = await db.message.findUniqueOrThrow({ where: { id: old.msg } })
    expect(m).toMatchObject({ content: '[removed]', status: 'DELIVERED', direction: 'OUTBOUND' }) // skeleton stays
    expect((await db.note.findFirstOrThrow({ where: { conversationId: old.conv } })).body).toBe('[removed]')
    expect((await db.conversation.findUniqueOrThrow({ where: { id: old.conv } })).redactedAt).not.toBeNull()
    expect((await db.message.findUniqueOrThrow({ where: { id: fresh.msg } })).content).toContain('private text')
    expect((await db.message.findUniqueOrThrow({ where: { id: untouched.msg } })).content).toContain('private text')
    expect((await runRetention({ tenantId: t }))[0]!.counts).toMatchObject({ conversations: 0, messages: 0 }) // idempotent
    expect(await db.auditLog.count({ where: { tenantId: t, action: 'privacy.retention_run' } })).toBeGreaterThan(0)
  })

  it('redaction keeps financial records intact: earnings and billing do not change', async () => {
    const t = await mkTenant('fin', { messageRetentionDays: 7 })
    const u = await mkUser(t, 'op'); const op = await db.operator.create({ data: { userId: u.id, tenantId: t, status: 'AVAILABLE' } })
    await createRateCard({ tenantId: t, amountEurCents: 10, basis: 'DELIVERED', effectiveFrom: new Date(Date.now() - 200 * D), actorUserId: 'x' })
    await mkConv(t, 'c1', 60, op.id); await mkConv(t, 'c2', 61, op.id)
    await syncEarnings(op.id)
    const before = (await getEarningsSummary(op.id)).earnings.totalAccumulatedEurCents
    expect(before).toBe(20)
    await runRetention({ tenantId: t })
    await syncEarnings(op.id)
    expect((await getEarningsSummary(op.id)).earnings.totalAccumulatedEurCents).toBe(20)
    expect(await db.message.count({ where: { tenantId: t, content: '[removed]' } })).toBe(2)
  })

  it('webhook payloads past the window are blanked; ids and hashes stay', async () => {
    const t = await mkTenant('wh', { messageRetentionDays: 10 })
    const integ = await db.integration.create({ data: { tenantId: t, adapterKey: 'dev-mock', name: 'x', config: {} } })
    const mk = (age: number, id: string) => db.webhookEvent.create({ data: { tenantId: t, integrationId: integ.id, externalEventId: id, payloadHash: `h-${id}`, rawPayload: { text: 'hello there', user: 'u1' }, createdAt: new Date(Date.now() - age * D) } })
    const oldEv = await mk(40, 'e-old'); const newEv = await mk(1, 'e-new')
    await db.conversation.create({ data: { tenantId: t, externalUserId: 'x', state: 'CLOSED', closedAt: new Date(Date.now() - 50 * D) } })
    await runRetention({ tenantId: t })
    expect((await db.webhookEvent.findUniqueOrThrow({ where: { id: oldEv.id } }))).toMatchObject({ rawPayload: {}, payloadHash: 'h-e-old' })
    expect((await db.webhookEvent.findUniqueOrThrow({ where: { id: newEv.id } })).rawPayload).toMatchObject({ text: 'hello there' })
  })

  it('data-subject requests: logged with a due date, executed only with the matching id, export returned once, erasure unlinks the person', async () => {
    const t = await mkTenant('dsr', { regulations: ['GDPR', 'LGPD'] }); const other = await mkTenant('dsr2')
    const a = await mkConv(t, 'alice-777', 3); const b = await mkConv(t, 'bob-888', 3); const o = await mkConv(other, 'alice-777', 3) // same platform id at ANOTHER client
    const integ = await db.integration.create({ data: { tenantId: t, adapterKey: 'dev-mock', name: 'x', config: {} } })
    await db.webhookEvent.create({ data: { tenantId: t, integrationId: integ.id, externalEventId: 'e1', payloadHash: 'h1', rawPayload: { user_id: 'alice-777', text: 'secret hello' } } })
    await db.webhookEvent.create({ data: { tenantId: t, integrationId: integ.id, externalEventId: 'e2', payloadHash: 'h2', rawPayload: { user_id: 'bob-888', text: 'bob hello' } } })

    const exp = await createDataRequest({ tenantId: t, kind: 'EXPORT', subjectRef: 'alice-777', requestedByUserId: 'client' })
    expect(Math.round((exp.dueAt.getTime() - Date.now()) / D)).toBe(15) // strictest of the client's regimes
    expect(JSON.stringify(exp)).not.toContain('alice-777') // only a hash and the last 4 characters
    await expect(executeDataRequest({ requestId: exp.id, subjectRef: 'someone-else', actorUserId: 'ceo' })).rejects.toBeInstanceOf(PrivacyError)
    const done = await executeDataRequest({ requestId: exp.id, subjectRef: 'alice-777', actorUserId: 'ceo' })
    expect(done.export!.conversations).toHaveLength(1)
    expect(JSON.stringify(done.export)).toContain('private text alice-777')
    expect(JSON.stringify(done.export)).not.toContain('bob-888')
    await expect(executeDataRequest({ requestId: exp.id, subjectRef: 'alice-777', actorUserId: 'ceo' })).rejects.toMatchObject({ status: 409 })
    expect(JSON.stringify(await db.auditLog.findMany({ where: { tenantId: t } }))).not.toContain('alice-777')

    const er = await createDataRequest({ tenantId: t, kind: 'ERASURE', subjectRef: 'alice-777', requestedByUserId: 'client' })
    const res = await executeDataRequest({ requestId: er.id, subjectRef: 'alice-777', actorUserId: 'ceo' })
    expect(res.counts).toMatchObject({ conversationsFound: 1, messages: 1, webhookPayloads: 1 })
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: a.conv } })
    expect(conv.externalUserId).toMatch(/^erased-/); expect(conv.redactedAt).not.toBeNull()
    expect((await db.message.findUniqueOrThrow({ where: { id: a.msg } })).content).toBe('[removed]')
    expect((await exportSubject(t, 'alice-777')).conversations).toHaveLength(0) // nothing left under that id
    // other people and other clients are untouched
    expect((await db.message.findUniqueOrThrow({ where: { id: b.msg } })).content).toContain('private text bob-888')
    expect((await db.message.findUniqueOrThrow({ where: { id: o.msg } })).content).toContain('private text alice-777')
    expect((await db.webhookEvent.findFirstOrThrow({ where: { externalEventId: 'e2' } })).rawPayload).toMatchObject({ text: 'bob hello' })

    const rej = await createDataRequest({ tenantId: t, kind: 'EXPORT', subjectRef: 'x', requestedByUserId: 'client' })
    await expect(rejectDataRequest({ requestId: rej.id, actorUserId: 'ceo', reason: 'no' })).rejects.toBeInstanceOf(PrivacyError)
    await rejectDataRequest({ requestId: rej.id, actorUserId: 'ceo', reason: 'Could not verify the requester' })
    await expect(rejectDataRequest({ requestId: rej.id, actorUserId: 'ceo', reason: 'Could not verify twice' })).rejects.toMatchObject({ status: 409 })
  })

  it('policy: bounds and known regimes; users and applicants can be anonymised without breaking history', async () => {
    const t = await mkTenant('pol')
    await expect(updatePolicy(t, { messageRetentionDays: 2 }, 'x')).rejects.toBeInstanceOf(PrivacyError)
    await expect(updatePolicy(t, { regulations: ['SKYNET'] }, 'x')).rejects.toBeInstanceOf(PrivacyError)
    expect(await updatePolicy(t, { messageRetentionDays: 180, regulations: ['GDPR', 'UK_GDPR'], dataRegion: 'EU (Frankfurt)' }, 'x')).toMatchObject({ messageRetentionDays: 180, dataRegion: 'EU (Frankfurt)' })

    const u = await mkUser(t, 'leaver'); await db.session.create({ data: { userId: u.id, refreshTokenHash: `h-${base}`, expiresAt: new Date(Date.now() + D) } as never }).catch(() => null)
    await expect(anonymiseUser({ userId: u.id, reason: 'x', actorUserId: 'ceo' })).rejects.toBeInstanceOf(PrivacyError)
    await anonymiseUser({ userId: u.id, reason: 'Operator left, erasure requested', actorUserId: 'ceo' })
    expect(await db.user.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ displayName: 'Former user', email: `${u.id}@anonymised.invalid`, isActive: false })
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0)
    const ceo = await db.user.create({ data: { email: `${base}-ceo@test.gco`, passwordHash: 'x', role: 'CEO_ADMIN', displayName: 'CEO' } }); userIds.push(ceo.id)
    await expect(anonymiseUser({ userId: ceo.id, reason: 'should never work', actorUserId: 'x' })).rejects.toMatchObject({ status: 403 })

    await db.careerApplication.create({ data: { fullName: 'Old Applicant', email: `${base}-old@test.gco`, message: 'my cv', createdAt: new Date(Date.now() - 500 * D) } })
    await db.careerApplication.create({ data: { fullName: 'New Applicant', email: `${base}-new@test.gco`, message: 'my cv' } })
    expect((await purgeCareerApplications(365)).applications).toBeGreaterThanOrEqual(1)
    expect((await db.careerApplication.findFirstOrThrow({ where: { email: { contains: 'anonymised' }, id: { not: '' } }, orderBy: { createdAt: 'asc' } })).fullName).toBe('[removed]')
    expect((await db.careerApplication.findFirstOrThrow({ where: { email: `${base}-new@test.gco` } })).fullName).toBe('New Applicant')
  })
})
