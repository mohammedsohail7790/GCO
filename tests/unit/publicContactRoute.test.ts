import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ createLead: vi.fn(), limited: false }))

vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api/rateLimit', () => ({
  isRateLimited: async () => state.limited,
  RATE_LIMITS: { PUBLIC_FORM: { max: 5, windowSeconds: 60 } },
}))
vi.mock('@/lib/crm/leads', () => {
  class LeadDuplicateError extends Error {
    status = 409
  }
  return { createLead: state.createLead, LeadDuplicateError }
})

import { POST } from '@/app/api/v1/public/contact/route'

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://test/api/v1/public/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  state.createLead.mockReset().mockResolvedValue({})
  state.limited = false
})

describe('public contact endpoint (contact + 7-day pilot)', () => {
  it('pilot request: no name needed; maps new fields into the lead and uses the pilot source', async () => {
    const res = await POST(
      req({
        intent: 'pilot',
        email: 'ops@acme.test',
        company: 'Acme',
        companyWebsite: 'acme.test',
        service: 'Chat operations',
        volume: '1,000 – 10,000',
        languages: 'English, Spanish',
        coverage: 'Extended hours',
        message: 'Hello',
        website: '',
      }),
    )
    expect(res.status).toBe(201)
    const arg = state.createLead.mock.calls[0]![0]
    expect(arg).toMatchObject({
      companyName: 'Acme',
      contactName: 'Acme',
      email: 'ops@acme.test',
      website: 'acme.test',
      source: 'website_pilot_form',
      actorUserId: null,
    })
    expect(arg.notes).toContain('Request: 7-day pilot')
    expect(arg.notes).toContain('Interested in: Chat operations')
    expect(arg.notes).toContain('volume: 1,000 – 10,000')
    expect(arg.notes).toContain('Languages: English, Spanish')
    expect(arg.notes).toContain('Coverage needed: Extended hours')
  })

  it('the existing contact form still requires a name and keeps its source', async () => {
    const missingName = await POST(req({ company: 'Acme', email: 'a@acme.test' }))
    expect(missingName.status).toBe(400)
    expect(state.createLead).not.toHaveBeenCalled()

    const ok = await POST(req({ name: 'Priya', company: 'Acme', email: 'a@acme.test', service: 'Customer Support Operations' }))
    expect(ok.status).toBe(201)
    expect(state.createLead.mock.calls[0]![0]).toMatchObject({ contactName: 'Priya', source: 'website_contact_form' })
  })

  it('honeypot is preserved: a filled `website` field is silently accepted and creates no lead', async () => {
    const res = await POST(req({ intent: 'pilot', email: 'bot@x.test', company: 'Bot', website: 'http://spam.test' }))
    expect(res.status).toBe(201)
    expect(state.createLead).not.toHaveBeenCalled()
  })

  it('rate limiting is preserved', async () => {
    state.limited = true
    const res = await POST(req({ intent: 'pilot', email: 'a@acme.test', company: 'Acme' }))
    expect(res.status).toBe(429)
    expect(state.createLead).not.toHaveBeenCalled()
  })

  it('oversized payloads are still rejected', async () => {
    const res = await POST(req({ intent: 'pilot', email: 'a@acme.test', company: 'Acme' }, { 'content-length': '50000' }))
    expect(res.status).toBe(413)
  })

  it('invalid email is a 400 and creates nothing', async () => {
    const res = await POST(req({ intent: 'pilot', email: 'nope', company: 'Acme' }))
    expect(res.status).toBe(400)
    expect(state.createLead).not.toHaveBeenCalled()
  })

  it('a duplicate email is a graceful success (not an internal error)', async () => {
    const { LeadDuplicateError } = await import('@/lib/crm/leads')
    state.createLead.mockRejectedValueOnce(new (LeadDuplicateError as any)())
    const res = await POST(req({ intent: 'pilot', email: 'dup@acme.test', company: 'Acme' }))
    expect(res.status).toBe(201)
  })
})
