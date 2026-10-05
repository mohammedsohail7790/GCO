import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ keys: [] as string[], limited: false }))

vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api/rateLimit', () => ({
  isRateLimited: async (key: string) => {
    state.keys.push(key)
    return state.limited
  },
  RATE_LIMITS: { PUBLIC_FORM: { max: 5, windowSeconds: 60 }, LOGIN: { max: 10, windowSeconds: 900 } },
}))
vi.mock('@/lib/crm/leads', () => ({ createLead: vi.fn().mockResolvedValue({}), LeadDuplicateError: class extends Error {} }))
vi.mock('@/lib/db/client', () => ({ db: { user: { findUnique: async () => null }, careerApplication: { create: async () => ({}) } } }))
vi.mock('@/lib/tenant/activity', () => ({ isTenantActive: async () => true }))
vi.mock('@/lib/audit/log', () => ({ writeAuditLog: async () => undefined }))

import { POST as contact } from '@/app/api/v1/public/contact/route'
import { POST as careers } from '@/app/api/v1/public/careers/apply/route'
import { POST as login } from '@/app/api/v1/auth/login/route'

const call = (handler: any, body: unknown, headers: Record<string, string>) =>
  handler(new Request('http://t/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }) as any)

const CF = (edge: string, client: string) => ({ 'x-forwarded-for': edge, 'cf-connecting-ip': client })
const contactBody = { intent: 'pilot', email: 'a@acme.test', company: 'Acme', website: 'x' } // honeypot: never creates a lead
const careersBody = { name: 'N', email: 'n@x.test', country: 'KE', website: 'x' }
const loginBody = { email: 'user@x.test', password: 'pw' }

beforeEach(() => {
  state.keys = []
  state.limited = false
})

describe('every IP-keyed limiter uses the Cloudflare-aware client address', () => {
  it('contact/pilot: same visitor via different edges -> same key; spoofed header from a direct client ignored', async () => {
    await call(contact, contactBody, CF('172.68.234.206', '203.0.113.7'))
    await call(contact, contactBody, CF('162.158.159.5', '203.0.113.7'))
    await call(contact, contactBody, CF('162.158.159.5', '203.0.113.8'))
    await call(contact, contactBody, { 'x-forwarded-for': '198.51.100.9', 'cf-connecting-ip': '1.2.3.4' })
    expect(state.keys).toEqual([
      'public-contact:203.0.113.7',
      'public-contact:203.0.113.7',
      'public-contact:203.0.113.8',
      'public-contact:198.51.100.9',
    ])
  })

  it('careers uses the same helper', async () => {
    await call(careers, careersBody, CF('172.68.234.206', '203.0.113.7'))
    await call(careers, careersBody, CF('104.16.9.9', '203.0.113.7'))
    expect(state.keys).toEqual(['public-careers:203.0.113.7', 'public-careers:203.0.113.7'])
  })

  it('9. login limiter: keyed by real client + email, stable across edges, not spoofable by direct clients', async () => {
    await call(login, loginBody, CF('172.68.234.206', '203.0.113.7'))
    await call(login, loginBody, CF('162.158.159.5', '203.0.113.7'))
    await call(login, { ...loginBody, email: 'other@x.test' }, CF('162.158.159.5', '203.0.113.7'))
    await call(login, loginBody, { 'x-forwarded-for': '198.51.100.9', 'cf-connecting-ip': '1.2.3.4' })
    expect(state.keys).toEqual([
      'login:203.0.113.7:user@x.test',
      'login:203.0.113.7:user@x.test',
      'login:203.0.113.7:other@x.test',
      'login:198.51.100.9:user@x.test',
    ])
  })

  it('a limited client gets the unchanged 429 responses', async () => {
    state.limited = true
    const c = await call(contact, contactBody, CF('172.68.234.206', '203.0.113.7'))
    const r = await call(careers, careersBody, CF('172.68.234.206', '203.0.113.7'))
    const l = await call(login, loginBody, CF('172.68.234.206', '203.0.113.7'))
    expect([c.status, r.status, l.status]).toEqual([429, 429, 429])
    expect((await l.json()).error.message).toBe('Too many login attempts. Try again later.')
  })
})
