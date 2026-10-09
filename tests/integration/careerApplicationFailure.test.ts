import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { POST } from '@/app/api/v1/public/careers/apply/route'

// A database failure must surface as a generic 500 (no internals leaked to the applicant), must be logged, and
// persistence must not involve any email/notification code path.
describe('career application route - backend failures', () => {
  afterEach(() => vi.restoreAllMocks())
  const req = (ip: string) =>
    new NextRequest('http://localhost/api/v1/public/careers/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ fullName: '[TEST] Failure', email: `fail-${Date.now()}@careers-fail.gco` }),
    })

  it('returns a generic 500 when the database write fails, without leaking the error', async () => {
    vi.spyOn(db.careerApplication, 'findFirst').mockRejectedValue(new Error('connection refused: secret-host:5432 password=hunter2'))
    const res = await POST(req(`fail-db-${Date.now()}-${Math.random()}`))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('secret-host')
    expect(text).not.toContain('hunter2')
    expect(JSON.parse(text).error.message).toBe('Internal server error')
  })

  it('stores nothing when the create step fails', async () => {
    vi.spyOn(db.careerApplication, 'create').mockRejectedValue(new Error('disk full'))
    const res = await POST(req(`fail-create-${Date.now()}-${Math.random()}`))
    expect(res.status).toBe(500)
    expect(await db.careerApplication.count({ where: { email: { endsWith: '@careers-fail.gco' } } })).toBe(0)
  })

  it('does not depend on an email provider', async () => {
    const src = (await import('node:fs')).readFileSync('lib/careers/applications.ts', 'utf8')
    expect(src).not.toMatch(/nodemailer|sendMail|resend|sendgrid|smtp/i)
  })
})
