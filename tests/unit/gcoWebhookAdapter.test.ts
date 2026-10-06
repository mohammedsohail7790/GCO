import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GcoWebhookAdapter, signPayload, TIMESTAMP_TOLERANCE_SECONDS } from '@/lib/integrations/adapters/gcoWebhook'
import { isBlockedAddress, validateCallbackUrl } from '@/lib/integrations/safeHttp'

const adapter = new GcoWebhookAdapter()
const SECRET = 'a'.repeat(64)
const now = () => Math.floor(Date.now() / 1000)
const headers = (ts: string, sig: string) => new Headers({ 'x-gco-timestamp': ts, 'x-gco-signature': sig })
const signed = (body: string, ts = String(now()), secret = SECRET) => headers(ts, signPayload(secret, ts, body))
const event = (over: Record<string, unknown> = {}) => ({ event_id: 'e1', message_id: 'm1', user_id: 'u1', text: 'hello', ...over })

describe('gco-webhook: inbound signature, replay window', () => {
  const body = JSON.stringify({ events: [event()] })
  it('accepts a correctly signed, fresh request', () => expect(adapter.verifyWebhookSignature(body, signed(body), SECRET)).toBe(true))
  it('rejects a tampered body, a wrong secret, and a signature for another timestamp', () => {
    expect(adapter.verifyWebhookSignature(body + ' ', signed(body), SECRET)).toBe(false)
    expect(adapter.verifyWebhookSignature(body, signed(body, undefined, 'b'.repeat(64)), SECRET)).toBe(false)
    const ts = String(now())
    expect(adapter.verifyWebhookSignature(body, headers(String(now() - 1), signPayload(SECRET, ts, body)), SECRET)).toBe(false)
  })
  it('rejects missing/malformed headers', () => {
    expect(adapter.verifyWebhookSignature(body, new Headers(), SECRET)).toBe(false)
    expect(adapter.verifyWebhookSignature(body, headers(String(now()), ''), SECRET)).toBe(false)
    expect(adapter.verifyWebhookSignature(body, headers('abc', 'v1=00'), SECRET)).toBe(false)
    expect(adapter.verifyWebhookSignature(body, new Headers({ 'x-gco-signature': signPayload(SECRET, '1', body) }), SECRET)).toBe(false)
  })
  it('enforces the replay window in both directions (validly signed but stale/future is rejected)', () => {
    for (const skew of [-(TIMESTAMP_TOLERANCE_SECONDS + 5), TIMESTAMP_TOLERANCE_SECONDS + 5]) {
      expect(adapter.verifyWebhookSignature(body, signed(body, String(now() + skew)), SECRET), String(skew)).toBe(false)
    }
    expect(adapter.verifyWebhookSignature(body, signed(body, String(now() - 60)), SECRET)).toBe(true)
  })
  it('a dev-mock style signature (no timestamp) is not accepted', () => {
    expect(adapter.verifyWebhookSignature(body, new Headers({ 'x-gco-signature': 'deadbeef'.repeat(8) }), SECRET)).toBe(false)
  })
})

describe('gco-webhook: payload validation and normalisation', () => {
  it('pings are recognised and need no events', () => {
    expect(adapter.isPing({ type: 'ping', ping_id: 'x' })).toBe(true)
    expect(adapter.isPing({ events: [] })).toBe(false)
    expect(() => adapter.validateInbound({ type: 'ping' })).not.toThrow()
  })
  it('normalises valid events', () => {
    const out = adapter.normalizeInbound({ events: [event({ lang: 'it', sent_at: '2026-10-06T10:00:00Z' })] })
    expect(out).toEqual([{ externalEventId: 'e1', externalMessageId: 'm1', externalUserId: 'u1', content: 'hello', language: 'it', sentAt: new Date('2026-10-06T10:00:00Z') }])
  })
  it.each([
    ['null', null], ['array', []], ['no events', {}], ['empty events', { events: [] }], ['too many events', { events: Array.from({ length: 101 }, (_, i) => event({ event_id: `e${i}` })) }],
    ['missing event_id', { events: [event({ event_id: undefined })] }], ['non-string user', { events: [event({ user_id: 5 })] }],
    ['empty text', { events: [event({ text: '' })] }], ['oversize text', { events: [event({ text: 'x'.repeat(4001) })] }],
    ['oversize id', { events: [event({ message_id: 'x'.repeat(201) })] }], ['bad date', { events: [event({ sent_at: 'not a date' })] }], ['non-object event', { events: ['hi'] }],
  ])('rejects %s', (_n, payload) => {
    expect(() => adapter.validateInbound(payload)).toThrow()
    expect(() => adapter.normalizeInbound(payload)).toThrow()
  })
  it('validation errors never echo payload content', () => {
    try {
      adapter.validateInbound({ events: [event({ text: 'x'.repeat(5000) + 'SECRET-CONTENT' })] })
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('SECRET-CONTENT')
    }
  })
})

describe('gco-webhook: config and destination safety (SSRF)', () => {
  const saved = process.env.ALLOW_DEV_ADAPTERS
  beforeEach(() => delete process.env.ALLOW_DEV_ADAPTERS)
  afterEach(() => (saved === undefined ? delete process.env.ALLOW_DEV_ADAPTERS : (process.env.ALLOW_DEV_ADAPTERS = saved)))

  it.each([
    'https://client.example.com/hooks/gco', 'https://api.client.io/v1/gco?x=1',
  ])('accepts %s', (u) => expect(validateCallbackUrl(u)).toBeNull())
  it.each([
    ['http (not https)', 'http://client.example.com/h'], ['loopback ip', 'https://127.0.0.1/h'], ['localhost', 'https://localhost/h'],
    ['ipv6 literal', 'https://[::1]/h'], ['metadata ip', 'https://169.254.169.254/latest'], ['private ip', 'https://10.0.0.5/h'],
    ['internal tld', 'https://svc.internal/h'], ['no dot host', 'https://intranet/h'], ['credentials', 'https://user:pw@client.example.com/h'],
    ['non-default port', 'https://client.example.com:8443/h'], ['fragment', 'https://client.example.com/h#x'], ['file scheme', 'file:///etc/passwd'],
    ['javascript scheme', 'javascript:alert(1)'], ['empty', ''], ['not a url', 'client.example.com'], ['too long', 'https://client.example.com/' + 'a'.repeat(500)],
  ])('rejects %s', (_n, u) => expect(validateCallbackUrl(u)).toEqual(expect.any(String)))
  it.each([
    ['127.0.0.1', true], ['10.1.2.3', true], ['172.16.0.1', true], ['172.31.255.255', true], ['192.168.1.1', true], ['169.254.169.254', true], ['100.64.0.1', true], ['0.0.0.0', true],
    ['224.0.0.1', true], ['198.18.0.1', true], ['::1', true], ['fe80::1', true], ['fd00::1', true], ['::ffff:127.0.0.1', true], ['::ffff:10.0.0.1', true], ['not-an-ip', true],
    ['8.8.8.8', false], ['172.32.0.1', false], ['1.1.1.1', false], ['2606:4700:4700::1111', false], ['::ffff:8.8.8.8', false],
  ])('address %s blocked=%s', (a, blocked) => expect(isBlockedAddress(a)).toBe(blocked))
  it('the dev flag relaxes only for local/CI (http + loopback allowed)', () => {
    expect(validateCallbackUrl('http://127.0.0.1:4010/h')).toEqual(expect.any(String))
    process.env.ALLOW_DEV_ADAPTERS = 'true'
    expect(validateCallbackUrl('http://127.0.0.1:4010/h')).toBeNull()
  })
  it('validateConfig: requires a safe callbackUrl, rejects unknown keys and attempts to set verification', async () => {
    expect(await adapter.validateConfig({ callbackUrl: 'https://client.example.com/h' })).toBeNull()
    expect(await adapter.validateConfig({})).toEqual(expect.any(String))
    expect(await adapter.validateConfig({ callbackUrl: 'https://client.example.com/h', apiKey: 'sk-live-123' })).toMatch(/Unsupported config key/)
    expect(await adapter.validateConfig({ callbackUrl: 'https://client.example.com/h', verification: { outboundAt: 'x' } })).toMatch(/set by GCO/)
  })
})

describe('gco-webhook: outbound refuses unsafe or incomplete configuration without any network call', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    delete process.env.ALLOW_DEV_ADAPTERS
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => vi.unstubAllGlobals())
  const req = { externalUserId: 'u', content: 'hi', externalMessageId: 'out_1' }
  it('no secret -> permanent credential failure', async () => {
    const r = await adapter.sendOutbound(req, { callbackUrl: 'https://client.example.com/h' }, { integrationId: 'i', tenantId: 't', secret: null })
    expect(r).toMatchObject({ delivered: false, retryable: false, failureCategory: 'credential' })
  })
  it('unsafe URL -> permanent bad_config, delivered=false', async () => {
    for (const url of ['http://169.254.169.254/x', 'https://127.0.0.1/x', 'https://localhost/x']) {
      const r = await adapter.sendOutbound(req, { callbackUrl: url }, { integrationId: 'i', tenantId: 't', secret: SECRET })
      expect(r, url).toMatchObject({ delivered: false, retryable: false, failureCategory: 'bad_config' })
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('verifyOutbound with bad config/secret never reports ok', async () => {
    expect((await adapter.verifyOutbound!({ callbackUrl: 'http://10.0.0.1/x' }, { integrationId: 'i', tenantId: 't', secret: SECRET })).ok).toBe(false)
    expect((await adapter.verifyOutbound!({ callbackUrl: 'https://client.example.com/x' }, { integrationId: 'i', tenantId: 't', secret: null })).ok).toBe(false)
  })
})
