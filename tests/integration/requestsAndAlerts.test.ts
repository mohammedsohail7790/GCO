import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { createRequest, addMessage, setStatus, thread, RequestError } from '@/lib/requests/service'
import { dispatchAlerts, listFor, markRead } from '@/lib/notify/service'

describe('client requests, notifications and alert routing (real database)', () => {
  const base = `rq-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const mkTenant = async (tag: string) => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}` } }); tenantIds.push(t.id); return t.id }
  const mkUser = async (tenantId: string | null, tag: string, role: 'CLIENT' | 'MANAGER' | 'SUPERVISOR' | 'CEO_ADMIN') => { const u = await db.user.create({ data: { email: `${base}-${tag}@test.gco`, passwordHash: 'x', role, tenantId, displayName: tag } }); userIds.push(u.id); return u.id }
  afterAll(async () => {
    await db.notification.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { userId: { in: userIds } }] } })
    await db.clientMessage.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.clientRequest.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('a request notifies the client\'s managers (and not another client\'s); replies and status changes notify the client', async () => {
    const a = await mkTenant('a'); const b = await mkTenant('b')
    const client = await mkUser(a, 'client', 'CLIENT'); const mgrA = await mkUser(a, 'mgrA', 'MANAGER'); const mgrB = await mkUser(b, 'mgrB', 'MANAGER'); const clientB = await mkUser(b, 'clientB', 'CLIENT')
    await expect(createRequest({ tenantId: a, userId: client, kind: 'MESSAGE', subject: 'x', body: 'hello there' })).rejects.toBeInstanceOf(RequestError)
    const r = await createRequest({ tenantId: a, userId: client, kind: 'INSTRUCTION_CHANGE', subject: 'Refund wording', body: 'Please say "within 14 days"' })
    expect((await listFor(mgrA)).notifications.map((n) => n.type)).toContain('client_request')
    expect((await listFor(mgrB)).unread).toBe(0)
    await addMessage({ requestId: r.id, tenantId: a, userId: mgrA, fromClient: false, body: 'Done, please check' })
    expect((await listFor(client)).notifications.map((n) => n.type)).toContain('gco_reply')
    await expect(setStatus({ requestId: r.id, tenantId: a, userId: mgrA, status: 'DECLINED' })).rejects.toThrow(/why/i)
    await setStatus({ requestId: r.id, tenantId: a, userId: mgrA, status: 'DONE', note: 'Updated in the knowledge base' })
    expect((await thread(r.id, a)).messages).toHaveLength(3)
    expect((await db.clientRequest.findUniqueOrThrow({ where: { id: r.id } })).resolvedAt).not.toBeNull()
    await addMessage({ requestId: r.id, tenantId: a, userId: client, fromClient: true, body: 'One more change please' }) // client writes again: reopens
    expect((await db.clientRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('OPEN')
    // isolation: another client's tenant cannot read or write the thread
    await expect(thread(r.id, b)).rejects.toMatchObject({ status: 404 })
    await expect(addMessage({ requestId: r.id, tenantId: b, userId: clientB, fromClient: true, body: 'sneaky' })).rejects.toMatchObject({ status: 404 })
    expect(await markRead(client)).toBeGreaterThan(0)
    expect((await listFor(client)).unread).toBe(0)
  })

  it('alerts reach only the configured roles of the right client, once per hour', async () => {
    const t = await mkTenant('al'); const other = await mkTenant('al2')
    const ceo = await mkUser(null, 'ceo', 'CEO_ADMIN'); const mgr = await mkUser(t, 'mgr', 'MANAGER'); const sup = await mkUser(t, 'sup', 'SUPERVISOR'); const mgrOther = await mkUser(other, 'mgro', 'MANAGER'); const client = await mkUser(t, 'cl', 'CLIENT')
    const alerts = [{ id: 'sla-overdue', severity: 'critical' as const, title: 'Response time exceeded', detail: '2 conversations' }, { id: 'queue-age', severity: 'warning' as const, title: 'Waiting too long', detail: '3 in queue' }]
    await dispatchAlerts(t, alerts)
    const types = async (u: string) => (await listFor(u)).notifications.filter((n) => n.type.startsWith('alert:')).map((n) => n.type).sort()
    expect(await types(mgr)).toEqual(['alert:queue-age', 'alert:sla-overdue']) // managers: warning and up
    expect(await types(sup)).toEqual(['alert:queue-age', 'alert:sla-overdue'])
    expect((await types(ceo)).filter((x) => x === 'alert:sla-overdue').length).toBeGreaterThanOrEqual(1) // CEO: critical only by default
    expect(await types(ceo)).not.toContain('alert:queue-age')
    expect(await types(mgrOther)).toEqual([]) // another client's manager hears nothing
    expect(await types(client)).toEqual([]) // clients never get operational alerts
    expect(await dispatchAlerts(t, alerts)).toBe(0) // standing alerts are not repeated within the hour
    expect(await types(mgr)).toHaveLength(2)
    // a route change takes effect: stop warnings for managers
    await db.alertRoute.upsert({ where: { role: 'MANAGER' }, create: { role: 'MANAGER', minSeverity: 'critical', enabled: true }, update: { minSeverity: 'critical', enabled: true } })
    await db.notification.deleteMany({ where: { userId: mgr } })
    await dispatchAlerts(t, alerts)
    expect(await types(mgr)).toEqual(['alert:sla-overdue'])
    await db.alertRoute.delete({ where: { role: 'MANAGER' } })
  })
})
