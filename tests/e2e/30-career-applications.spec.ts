import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { anonymousContext, loginAs } from './helpers'

// Operator application form, end to end: public submit -> PostgreSQL -> CEO review (search, filter, status) -> audit.
// All records are synthetic ([E2E] names, @careers30.gco addresses) and removed afterwards.
const stamp = Date.now()
const EMAIL_DOMAIN = 'careers30.gco'
const apply = async (data: Record<string, unknown>, tag: string) => {
  const anon = await anonymousContext()
  return anon.post('/api/v1/public/careers/apply', { data, headers: { 'x-forwarded-for': `careers30-${tag}-${stamp}-${Math.random()}` } })
}

test.describe('operator applications: submit, review, audit', () => {
  const ids: string[] = []
  test.afterAll(async () => {
    await db.auditLog.deleteMany({ where: { resource: 'career_application', resourceId: { in: ids } } })
    await db.careerApplication.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } })
  })

  test('a valid application is persisted as NEW and shows in the CEO list with its submission date', async () => {
    const email = `Ada.Lovelace-${stamp}@${EMAIL_DOMAIN}`
    const res = await apply({ fullName: '[E2E] Ada Lovelace', email, country: 'Kenya', languages: 'English, Swahili', message: 'Experienced moderator.' }, 'ok')
    expect(res.status()).toBe(201)

    const row = await db.careerApplication.findFirstOrThrow({ where: { email: email.toLowerCase() } })
    ids.push(row.id)
    expect(row.status).toBe('NEW')
    expect(row.submissionCount).toBe(1)

    const admin = await loginAs('admin@demo.gco')
    const list = await admin.get(`/api/v1/admin/career-applications?q=${encodeURIComponent('Lovelace')}&status=NEW`)
    expect(list.status()).toBe(200)
    expect(list.headers()['cache-control']).toContain('no-store')
    const body = await list.json()
    const found = body.data.find((a: { id: string }) => a.id === row.id)
    expect(found.fullName).toBe('[E2E] Ada Lovelace')
    expect(found.createdAt).toBeTruthy()
    expect(body.meta.byStatus.NEW).toBeGreaterThanOrEqual(1)
  })

  test('invalid submissions are rejected and nothing is stored', async () => {
    const before = await db.careerApplication.count()
    expect((await apply({ fullName: '', email: 'nope' }, 'bad')).status()).toBe(400)
    expect((await apply({ fullName: 'x', email: `x@${EMAIL_DOMAIN}`, message: 'a'.repeat(4001) }, 'long')).status()).toBe(400)
    const anon = await anonymousContext()
    const malformed = await anon.post('/api/v1/public/careers/apply', {
      data: Buffer.from('{not json'),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `careers30-json-${stamp}` },
    })
    expect(malformed.status()).toBe(400)
    expect(await db.careerApplication.count()).toBe(before)
  })

  test('a repeat submission from the same email merges into the open application instead of duplicating it', async () => {
    const email = `dup-${stamp}@${EMAIL_DOMAIN}`
    expect((await apply({ fullName: '[E2E] Dup', email, message: 'first' }, 'd1')).status()).toBe(201)
    expect((await apply({ fullName: '[E2E] Dup', email: email.toUpperCase(), message: 'second' }, 'd2')).status()).toBe(201)
    const rows = await db.careerApplication.findMany({ where: { email } })
    expect(rows).toHaveLength(1)
    ids.push(rows[0]!.id)
    expect(rows[0]!.submissionCount).toBe(2)
    expect(rows[0]!.message).toBe('second')
  })

  test('the CEO can move an application through the workflow; each change is audited without personal data', async () => {
    const email = `flow-${stamp}@${EMAIL_DOMAIN}`
    await apply({ fullName: '[E2E] Flow', email, message: 'hello' }, 'f1')
    const row = await db.careerApplication.findFirstOrThrow({ where: { email } })
    ids.push(row.id)
    const admin = await loginAs('admin@demo.gco')

    const r1 = await admin.patch(`/api/v1/admin/career-applications/${row.id}`, { data: { status: 'REVIEWING', reviewNote: 'Strong English' } })
    expect(r1.status()).toBe(200)
    const r2 = await admin.patch(`/api/v1/admin/career-applications/${row.id}`, { data: { status: 'REJECTED' } })
    expect(r2.status()).toBe(200)
    const after = await db.careerApplication.findUniqueOrThrow({ where: { id: row.id } })
    expect(after.status).toBe('REJECTED')
    expect(after.reviewNote).toBe('Strong English')
    expect(after.statusUpdatedBy).toBeTruthy()

    const audit = await db.auditLog.findMany({ where: { resource: 'career_application', resourceId: row.id }, orderBy: { createdAt: 'asc' } })
    expect(audit.map((a) => (a.metadata as { to: string }).to)).toEqual(['REVIEWING', 'REJECTED'])
    expect(JSON.stringify(audit)).not.toContain(email)
    expect(JSON.stringify(audit)).not.toContain('Strong English')

    // A closed application does not absorb a later re-application: it becomes a new row.
    await apply({ fullName: '[E2E] Flow', email, message: 'applying again' }, 'f2')
    const rows = await db.careerApplication.findMany({ where: { email }, orderBy: { createdAt: 'asc' } })
    expect(rows).toHaveLength(2)
    expect(rows[1]!.status).toBe('NEW')
    ids.push(rows[1]!.id)
  })

  test('status updates validate input and unknown ids', async () => {
    const admin = await loginAs('admin@demo.gco')
    expect((await admin.patch('/api/v1/admin/career-applications/does-not-exist', { data: { status: 'REVIEWING' } })).status()).toBe(404)
    expect((await admin.patch('/api/v1/admin/career-applications/anything', { data: { status: 'HIRED' } })).status()).toBe(400)
    expect((await admin.patch('/api/v1/admin/career-applications/anything', { data: { status: 'NEW', fullName: 'tamper' } })).status()).toBe(400)
    expect((await admin.get('/api/v1/admin/career-applications?status=BOGUS')).status()).toBe(400)
  })

  test('only the CEO can view or change applications - everyone else is refused', async () => {
    const row = await db.careerApplication.findFirstOrThrow({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } })
    const anon = await anonymousContext()
    expect((await anon.get('/api/v1/admin/career-applications')).status()).toBe(401)
    expect((await anon.patch(`/api/v1/admin/career-applications/${row.id}`, { data: { status: 'ACCEPTED' } })).status()).toBe(401)
    for (const who of ['manager@demo.gco', 'operator1@demo.gco', 'client@demo.gco', 'hunter1@demo.gco']) {
      const ctx = await loginAs(who)
      expect((await ctx.get('/api/v1/admin/career-applications')).status(), `${who} list`).toBe(403)
      expect((await ctx.patch(`/api/v1/admin/career-applications/${row.id}`, { data: { status: 'ACCEPTED' } })).status(), `${who} patch`).toBe(403)
    }
    expect((await db.careerApplication.findUniqueOrThrow({ where: { id: row.id } })).status).not.toBe('ACCEPTED')
  })
})
