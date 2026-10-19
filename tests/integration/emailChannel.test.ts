import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SMTPServer } from 'smtp-server'
import type { AddressInfo } from 'net'
import { db } from '@/lib/db/client'
import { sendEmail, emailConfigured } from '@/lib/notify/email'
import { notifyUsers, dispatchAlerts } from '@/lib/notify/service'

// Real SMTP conversation against an in-process server: proves delivery, that content stays out of emails, and that failures never throw.
describe('email notification channel', () => {
  const received: { to: string; body: string }[] = []
  let server: SMTPServer
  let port = 0
  const base = `em-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const mkTenant = async () => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}`, slug: base } }); tenantIds.push(t.id); return t.id }
  const mkUser = async (tenantId: string | null, tag: string, role: 'CLIENT' | 'MANAGER', email?: string) => { const u = await db.user.create({ data: { email: email ?? `${base}-${tag}@test.gco`, passwordHash: 'x', role, tenantId, displayName: tag } }); userIds.push(u.id); return u }
  const wait = async (n: number) => { for (let i = 0; i < 50 && received.length < n; i++) await new Promise((r) => setTimeout(r, 100)) }

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
      onData(stream, session, cb) { let b = ''; stream.on('data', (c) => (b += c)); stream.on('end', () => { received.push({ to: session.envelope.rcptTo.map((r) => r.address).join(','), body: b }); cb() }) },
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    port = (server.server.address() as AddressInfo).port
    process.env.SMTP_URL = `smtp://127.0.0.1:${port}/?ignoreTLS=true`
  })
  afterAll(async () => {
    delete process.env.SMTP_URL
    await new Promise<void>((r) => server.close(() => r()))
    await db.notification.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { userId: { in: userIds } }] } })
    await db.alertRoute.deleteMany({ where: { role: 'SUPERVISOR' } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('is off without SMTP_URL, delivers when configured, and never throws on failure', async () => {
    const saved = process.env.SMTP_URL
    delete process.env.SMTP_URL
    expect(emailConfigured()).toBe(false)
    expect(await sendEmail('a@test.gco', 's', 'b')).toBe(false)
    process.env.SMTP_URL = saved
    expect(await sendEmail('someone@test.gco', 'Hello subject', 'Short body')).toBe(true)
    expect(received.at(-1)!.to).toBe('someone@test.gco'); expect(received.at(-1)!.body).toContain('Hello subject')
    process.env.SMTP_URL = 'smtp://127.0.0.1:1/?ignoreTLS=true' // nothing listens there
    expect(await sendEmail('someone@test.gco', 's', 'b')).toBe(false) // resolves false, no exception
    process.env.SMTP_URL = saved
  })

  it('emails only when asked, only active real users, with a title and link but never the detail', async () => {
    const t = await mkTenant()
    const mgr = await mkUser(t, 'mgr', 'MANAGER'); const gone = await mkUser(t, 'gone', 'MANAGER', `${base}-gone@anonymised.invalid`)
    received.length = 0
    await notifyUsers([mgr.id], 'client_request', { subject: 'Refund wording', detail: 'SECRET DETAIL' }, t) // no email requested
    await new Promise((r) => setTimeout(r, 500)); expect(received).toHaveLength(0)
    await notifyUsers([mgr.id, gone.id], 'client_request', { subject: 'Refund wording', detail: 'SECRET DETAIL' }, t, { email: true })
    await wait(1)
    expect(received).toHaveLength(1)
    expect(received[0]!.to).toBe(mgr.email)
    expect(received[0]!.body).toContain('Refund wording'); expect(received[0]!.body).not.toContain('SECRET DETAIL')
    expect(await db.notification.count({ where: { userId: gone.id } })).toBe(1) // the in-app notification exists even for the user who gets no email
  })

  it('alert routes with email on send mail for that role only', async () => {
    const t = await db.tenant.findFirstOrThrow({ where: { slug: base } })
    const sup = await mkUser(t.id, 'sup', 'MANAGER'); await db.user.update({ where: { id: sup.id }, data: { role: 'SUPERVISOR' } })
    await db.alertRoute.upsert({ where: { role: 'SUPERVISOR' }, create: { role: 'SUPERVISOR', minSeverity: 'critical', enabled: true, email: true }, update: { email: true, minSeverity: 'critical', enabled: true } })
    received.length = 0
    await dispatchAlerts(t.id, [{ id: 'sla-overdue', severity: 'critical', title: 'Response time exceeded', detail: '3 conversations, customer jane@x.com' }])
    await wait(1)
    expect(received.map((r) => r.to)).toEqual([sup.email]) // the manager (email off) got in-app only
    expect(received[0]!.body).not.toContain('jane@x.com')
  })
})
