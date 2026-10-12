import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { hashPassword } from '../../lib/auth/password'
import { upsertStaffAccount } from '../../lib/auth/staffAccounts'
import { anonymousContext, cleanupTenant, loginAs, seedIsolatedTenant, sendWebhook, waitFor } from './helpers'

// Accounts created by the operator tool actually work end to end: sign in, get the right role and client, and operate.
test.describe('operator and manager accounts created by the account tool', () => {
  let t: Awaited<ReturnType<typeof seedIsolatedTenant>>
  const stamp = Date.now()
  const opEmail = `tool-op-${stamp}@e2e.gco`
  const mgrEmail = `tool-mgr-${stamp}@e2e.gco`
  const PASSWORD = 'Harbor-Quiet-Lantern-2026'
  test.beforeAll(async () => { t = await seedIsolatedTenant('toolacc') })
  test.afterAll(async () => { await cleanupTenant(t.tenantId) })

  test('a tool-created operator signs in OFFLINE with the client default capacity, goes Available, and receives a conversation in its language; a manager sees it', async () => {
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: t.tenantId } })).slug
    const hash = await hashPassword(PASSWORD)
    // Create through the same function the CLI uses. Language routing: this operator handles Spanish only.
    await db.operator.updateMany({ where: { tenantId: t.tenantId }, data: { status: 'OFFLINE' } }) // the fixture operator must not take the message
    await upsertStaffAccount(db, { email: opEmail, displayName: 'Tool Operator', role: 'OPERATOR', tenantSlug: slug, languages: ['es'], passwordHash: hash })
    await upsertStaffAccount(db, { email: mgrEmail, displayName: 'Tool Manager', role: 'MANAGER', tenantSlug: slug, passwordHash: hash })

    const op = await loginAs(opEmail, PASSWORD)
    const mgr = await loginAs(mgrEmail, PASSWORD)
    const me = await (await op.get('/api/v1/auth/me')).json()
    expect(me.data.user).toMatchObject({ role: 'OPERATOR', tenantId: t.tenantId, operator: { status: 'OFFLINE', languages: ['es'] } })
    expect((await op.get('/api/v1/operators')).status()).toBe(403) // operators cannot read the roster
    expect((await mgr.get('/api/v1/operators')).status()).toBe(200)
    expect((await mgr.get('/api/v1/auth/me').then((r) => r.json())).data.user.role).toBe('MANAGER')
    expect((await (await anonymousContext()).post('/api/v1/auth/login', { data: { email: opEmail, password: 'wrong-password-123' }, headers: { 'x-forwarded-for': `toolacc-${stamp}` } })).status()).toBe(401)

    expect((await op.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })).status()).toBe(200)
    // a Spanish and an English customer: only the Spanish one may be assigned to this Spanish-only operator
    await sendWebhook(t.integrationId, [{ event_id: 'ta-es', message_id: 'ta-es-m', user_id: 'ta-es-user', text: 'Hola', ...({ lang: 'es' } as object) } as never])
    await sendWebhook(t.integrationId, [{ event_id: 'ta-en', message_id: 'ta-en-m', user_id: 'ta-en-user', text: 'Hello', ...({ lang: 'en' } as object) } as never])
    await waitFor(async () => (await db.conversation.count({ where: { tenantId: t.tenantId, externalUserId: { in: ['ta-es-user', 'ta-en-user'] } } })) === 2)
    await waitFor(async () => !!(await db.conversation.findFirst({ where: { tenantId: t.tenantId, externalUserId: 'ta-es-user', currentAssignmentId: { not: null } } })))
    const ws = await (await op.get('/api/v1/operators/me/workspace')).json()
    expect(ws.data.conversations.map((c: { conversation: { externalUserId: string } }) => c.conversation.externalUserId)).toEqual(['ta-es-user'])
    const en = await db.conversation.findFirstOrThrow({ where: { tenantId: t.tenantId, externalUserId: 'ta-en-user' } })
    expect(en.currentAssignmentId).toBeNull() // not handed to the wrong-language operator
  })

  test('an account the tool created for one client cannot be used on another client\'s data', async () => {
    const other = await seedIsolatedTenant('toolacc-other')
    try {
      const mgr = await loginAs(mgrEmail, PASSWORD)
      const r = await mgr.get(`/api/v1/operators?tenantId=${other.tenantId}`)
      expect(r.status()).toBe(403)
    } finally { await cleanupTenant(other.tenantId) }
  })
})
