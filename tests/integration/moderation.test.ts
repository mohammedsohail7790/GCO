import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { setTenantServices } from '@/lib/tenant/services'
import { ingestItems, claimBatch, decide, releaseItem, resolveEscalation, requestAction, decideAction, createAppeal, decideAppeal, releaseStale, overview, subjectHistory, safeMediaUrl, ModerationError, MAX_CLAIMED } from '@/lib/moderation/service'
import { eraseSubject, runRetention } from '@/lib/privacy/service'

describe('moderation (real database)', () => {
  const base = `mo-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const mkTenant = async (tag: string, services = true, extra: object = {}) => {
    const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}`, ...extra } }); tenantIds.push(t.id)
    if (services) await setTenantServices({ tenantId: t.id, industry: 'GAMING', services: ['CHAT_MODERATION'], actorUserId: null })
    return t.id
  }
  const mkOp = async (tenantId: string, tag: string) => { const u = await db.user.create({ data: { email: `${base}-${tenantId.slice(-6)}-${tag}@test.gco`, passwordHash: 'x', role: 'OPERATOR', tenantId, displayName: tag } }); userIds.push(u.id); return { userId: u.id, id: (await db.operator.create({ data: { userId: u.id, tenantId, status: 'AVAILABLE' } })).id } }
  const items = (n: number, prefix = 'i') => Array.from({ length: n }, (_, i) => ({ kind: 'MESSAGE' as const, externalItemId: `${prefix}-${i}`, subjectExternalId: `user-${i % 3}`, content: `content ${prefix}-${i}` }))

  afterAll(async () => {
    await db.moderationAppeal.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.moderationAction.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.moderationDecision.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.moderationItem.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.tenantService.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('ingest: needs the service switched on, validates items, and is idempotent', async () => {
    const off = await mkTenant('off', false)
    await expect(ingestItems(off, items(1))).rejects.toMatchObject({ status: 409, code: 'MODULE_OFF' })
    const t = await mkTenant('in')
    expect(await ingestItems(t, items(3))).toEqual({ received: 3, created: 3, duplicates: 0 })
    expect(await ingestItems(t, items(3))).toEqual({ received: 3, created: 0, duplicates: 3 }) // re-sent: not queued twice
    await expect(ingestItems(t, [{ kind: 'IMAGE', externalItemId: 'x', subjectExternalId: 'u' }])).rejects.toBeInstanceOf(ModerationError) // no content or media
    await expect(ingestItems(t, [{ kind: 'IMAGE', externalItemId: 'x', subjectExternalId: 'u', mediaUrl: 'http://insecure.example/x.png' }])).rejects.toBeInstanceOf(ModerationError)
    await expect(ingestItems(t, [{ kind: 'IMAGE', externalItemId: 'x', subjectExternalId: 'u', mediaUrl: 'javascript:alert(1)' }])).rejects.toBeInstanceOf(ModerationError)
    await expect(ingestItems(t, [])).rejects.toBeInstanceOf(ModerationError)
    expect(safeMediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(safeMediaUrl('https://user:pw@cdn.example.com/a.png')).toBeNull()
  })

  it('claims are disjoint under concurrency, capped, stale claims return, and other clients are untouched', async () => {
    const t = await mkTenant('cl'); const other = await mkTenant('cl2')
    const a = await mkOp(t, 'a'); const b = await mkOp(t, 'b'); const foreign = await mkOp(other, 'f')
    await ingestItems(t, items(12, 'c')); await ingestItems(other, items(2, 'x'))
    const [ra, rb] = await Promise.all([claimBatch(a.id), claimBatch(b.id)])
    expect(ra).toHaveLength(MAX_CLAIMED); expect(rb).toHaveLength(MAX_CLAIMED)
    expect(new Set([...ra, ...rb].map((x) => x.id)).size).toBe(MAX_CLAIMED * 2) // no item handed to both
    expect((await claimBatch(a.id)).length).toBe(MAX_CLAIMED) // already holding the maximum: nothing more
    expect((await claimBatch(foreign.id)).map((x) => x.subjectExternalId).length).toBe(2) // only its own client's items
    await db.moderationItem.updateMany({ where: { assignedOperatorId: a.id }, data: { claimedAt: new Date(Date.now() - 30 * 60_000) } })
    expect(await releaseStale(t)).toBe(MAX_CLAIMED)
    expect(await db.moderationItem.count({ where: { tenantId: t, status: 'PENDING' } })).toBe(12 - MAX_CLAIMED)
  })

  it('decisions: only the claimant, a category is needed to reject, escalation needs a reason and is closed by a manager', async () => {
    const t = await mkTenant('dec'); const a = await mkOp(t, 'a'); const b = await mkOp(t, 'b')
    await ingestItems(t, items(4, 'd'))
    const mine = await claimBatch(a.id)
    const [i1, i2, i3, i4] = mine
    await expect(decide({ operatorId: b.id, userId: b.userId, itemId: i1!.id, verdict: 'APPROVE' })).rejects.toMatchObject({ status: 404 }) // not b's item
    await expect(decide({ operatorId: a.id, userId: a.userId, itemId: i1!.id, verdict: 'REJECT' })).rejects.toThrow(/category/i)
    await expect(decide({ operatorId: a.id, userId: a.userId, itemId: i1!.id, verdict: 'REJECT', category: 'made-up' })).rejects.toThrow(/category/i)
    await expect(decide({ operatorId: a.id, userId: a.userId, itemId: i1!.id, verdict: 'ESCALATE' })).rejects.toThrow(/escalating/i)
    expect(await decide({ operatorId: a.id, userId: a.userId, itemId: i1!.id, verdict: 'APPROVE' })).toMatchObject({ status: 'DECIDED' })
    await expect(decide({ operatorId: a.id, userId: a.userId, itemId: i1!.id, verdict: 'APPROVE' })).rejects.toMatchObject({ status: 404 }) // cannot decide twice
    await decide({ operatorId: a.id, userId: a.userId, itemId: i2!.id, verdict: 'REJECT', category: 'spam', note: 'obvious' })
    expect(await decide({ operatorId: a.id, userId: a.userId, itemId: i3!.id, verdict: 'ESCALATE', note: 'could be sarcasm' })).toMatchObject({ status: 'ESCALATED' })
    await releaseItem(a.id, i4!.id)
    expect((await db.moderationItem.findUniqueOrThrow({ where: { id: i4!.id } })).status).toBe('PENDING')
    const mgr = await db.user.create({ data: { email: `${base}-${t.slice(-6)}-mgr@test.gco`, passwordHash: 'x', role: 'MANAGER', tenantId: t, displayName: 'm' } }); userIds.push(mgr.id)
    await expect(resolveEscalation({ userId: mgr.id, tenantId: t, itemId: i1!.id, verdict: 'APPROVE' })).rejects.toMatchObject({ status: 404 }) // not escalated
    await resolveEscalation({ userId: mgr.id, tenantId: t, itemId: i3!.id, verdict: 'REJECT', category: 'harassment', note: 'in context it is abuse' })
    const decisions = await db.moderationDecision.findMany({ where: { itemId: i3!.id }, orderBy: { createdAt: 'asc' } })
    expect(decisions.map((d) => d.verdict)).toEqual(['ESCALATE', 'REJECT']) // append-only history
    const ov = await overview(t)
    expect(ov.queue).toMatchObject({ escalated: 0, decided: 3 })
    expect(ov.perOperator[0]).toMatchObject({ decisions: 3, approved: 1, rejected: 1, escalated: 1 })
    expect(JSON.stringify(await db.auditLog.findMany({ where: { tenantId: t, action: 'moderation.decided' } }))).not.toContain('content d-') // audit never carries content
  })

  it('warnings/restrictions need confirmation by someone else; appeals need a different reviewer and can overturn', async () => {
    const t = await mkTenant('act'); const a = await mkOp(t, 'a'); const c = await mkOp(t, 'c')
    const mgr = await db.user.create({ data: { email: `${base}-${t.slice(-6)}-m2@test.gco`, passwordHash: 'x', role: 'MANAGER', tenantId: t, displayName: 'm' } }); userIds.push(mgr.id)
    await ingestItems(t, [{ kind: 'POST', externalItemId: 'p1', subjectExternalId: 'troll-9', content: 'rude post' }])
    const [it] = await claimBatch(a.id)
    await decide({ operatorId: a.id, userId: a.userId, itemId: it!.id, verdict: 'REJECT', category: 'harassment' })
    await expect(requestAction({ tenantId: t, userId: a.userId, subjectExternalId: 'troll-9', kind: 'WARNING', reason: 'no' })).rejects.toBeInstanceOf(ModerationError)
    await expect(requestAction({ tenantId: t, userId: a.userId, subjectExternalId: 'someone-else', kind: 'WARNING', itemId: it!.id, reason: 'wrong person' })).rejects.toMatchObject({ status: 404 })
    const act = await requestAction({ tenantId: t, userId: a.userId, subjectExternalId: 'troll-9', kind: 'RESTRICTION', itemId: it!.id, reason: 'third offence this week' })
    await expect(decideAction({ tenantId: t, userId: a.userId, actionId: act.id, applied: true })).rejects.toMatchObject({ status: 403 }) // not your own request
    await decideAction({ tenantId: t, userId: mgr.id, actionId: act.id, applied: true })
    await expect(decideAction({ tenantId: t, userId: mgr.id, actionId: act.id, applied: true })).rejects.toMatchObject({ status: 404 }) // already decided

    await expect(createAppeal({ tenantId: t, externalItemId: 'nope', kind: 'POST', reason: 'it was a joke' })).rejects.toMatchObject({ status: 409 })
    const ap = await createAppeal({ tenantId: t, externalItemId: 'p1', kind: 'POST', reason: 'it was a joke between friends' })
    await expect(createAppeal({ tenantId: t, externalItemId: 'p1', kind: 'POST', reason: 'again please' })).rejects.toMatchObject({ status: 409 }) // one open at a time
    await expect(decideAppeal({ tenantId: t, userId: a.userId, appealId: ap.id, outcome: 'UPHELD' })).rejects.toMatchObject({ status: 403 }) // the original decider cannot review it
    await decideAppeal({ tenantId: t, userId: c.userId, appealId: ap.id, outcome: 'OVERTURNED', note: 'context shows banter' })
    const verdicts = (await db.moderationDecision.findMany({ where: { itemId: it!.id }, orderBy: { createdAt: 'asc' } })).map((d) => d.verdict)
    expect(verdicts).toEqual(['REJECT', 'APPROVE'])
    const h = await subjectHistory(t, 'troll-9')
    expect(h.items[0]!.decisions).toHaveLength(2); expect(h.actions[0]).toMatchObject({ kind: 'RESTRICTION', status: 'APPLIED' }); expect(h.appeals[0]).toMatchObject({ status: 'OVERTURNED' })
  })

  it('privacy: erasing a person blanks their moderation content; retention blanks old decided items; decisions stay', async () => {
    const t = await mkTenant('prv', true, { messageRetentionDays: 30 }); const a = await mkOp(t, 'a')
    await ingestItems(t, [{ kind: 'COMMENT', externalItemId: 'c1', subjectExternalId: 'gone-1', content: 'personal words', mediaUrl: 'https://cdn.example.com/a.png' }, { kind: 'COMMENT', externalItemId: 'c2', subjectExternalId: 'stays-2', content: 'other words' }, { kind: 'COMMENT', externalItemId: 'c3', subjectExternalId: 'old-3', content: 'old words' }])
    const got = await claimBatch(a.id)
    for (const g of got) await decide({ operatorId: a.id, userId: a.userId, itemId: g.id, verdict: 'APPROVE' })
    await db.moderationItem.updateMany({ where: { tenantId: t, externalItemId: 'c3' }, data: { createdAt: new Date(Date.now() - 90 * 86_400_000) } })
    await runRetention({ tenantId: t })
    expect((await db.moderationItem.findFirstOrThrow({ where: { tenantId: t, externalItemId: 'c3' } }))).toMatchObject({ content: null })
    expect((await db.moderationItem.findFirstOrThrow({ where: { tenantId: t, externalItemId: 'c2' } })).content).toBe('other words')
    const res = await eraseSubject(t, 'gone-1')
    expect(res.moderationItems).toBe(1)
    const c1 = await db.moderationItem.findFirstOrThrow({ where: { tenantId: t, externalItemId: 'c1' } })
    expect(c1).toMatchObject({ content: null, mediaUrl: null }); expect(c1.subjectExternalId).toMatch(/^erased-/)
    expect(await db.moderationDecision.count({ where: { itemId: c1.id } })).toBe(1) // the decision record stays
  })
})
