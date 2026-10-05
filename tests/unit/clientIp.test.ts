import { describe, it, expect } from 'vitest'
import { getClientIp, isCloudflareIp } from '@/lib/api/clientIp'

const h = (o: Record<string, string>) => new Headers(o)

// Real captured shape (production, via Caddy): XFF is ONLY the Cloudflare edge address;
// the visitor is in Cf-Connecting-Ip. Edge/visitor addresses below are examples.
describe('isCloudflareIp', () => {
  it.each(['172.68.234.206', '162.158.159.5', '104.16.0.1', '173.245.48.9', '2606:4700::1', '2a06:98c0::1', '::ffff:172.68.234.206'])('%s is Cloudflare', (ip) =>
    expect(isCloudflareIp(ip)).toBe(true),
  )
  it.each(['8.8.8.8', '92.98.50.60', '172.63.255.255', '172.72.0.0', '2001:db8::1', 'not-an-ip', '', '999.1.1.1'])('%s is not Cloudflare', (ip) =>
    expect(isCloudflareIp(ip)).toBe(false),
  )
})

describe('getClientIp', () => {
  it('1. direct request with no proxy headers -> shared "unknown" bucket (unchanged)', () => {
    expect(getClientIp(h({}))).toBe('unknown')
    expect(getClientIp(h({ 'x-forwarded-for': '' }))).toBe('unknown')
  })

  it('2. Cloudflare request: client comes from CF-Connecting-IP, not the edge in XFF', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '172.68.234.206', 'cf-connecting-ip': '203.0.113.7' }))).toBe('203.0.113.7')
  })

  it('3. non-Cloudflare peer: XFF is used as before (single hop)', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '198.51.100.9' }))).toBe('198.51.100.9')
  })

  it('3b. legacy/test labels in XFF are kept verbatim for a non-Cloudflare peer', () => {
    expect(getClientIp(h({ 'x-forwarded-for': 'test-contact-valid-123' }))).toBe('test-contact-valid-123')
  })

  it('4. SPOOFED CF-Connecting-IP from an untrusted direct client is ignored', () => {
    // Direct to origin: Caddy records the attacker as the peer; the attacker also sends a forged header.
    expect(getClientIp(h({ 'x-forwarded-for': '198.51.100.9', 'cf-connecting-ip': '1.2.3.4' }))).toBe('198.51.100.9')
    // Even with a forged chain claiming a Cloudflare hop in the MIDDLE, only the last hop is trusted.
    expect(getClientIp(h({ 'x-forwarded-for': '172.68.234.206, 198.51.100.9', 'cf-connecting-ip': '1.2.3.4' }))).toBe('198.51.100.9')
  })

  it('4b. a forged first X-Forwarded-For entry never wins', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '6.6.6.6, 198.51.100.9' }))).toBe('198.51.100.9')
  })

  it('5. multiple forwarded IPs: rightmost non-Cloudflare hop when Cloudflare sent no client header', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '203.0.113.50, 198.51.100.20, 172.68.234.206' }))).toBe('198.51.100.20')
    expect(getClientIp(h({ 'x-forwarded-for': '172.68.234.206' }))).toBe('172.68.234.206') // only the edge known
  })

  it('5b. an invalid CF-Connecting-IP behind a real Cloudflare peer is not used', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '172.68.234.206', 'cf-connecting-ip': 'garbage; DROP' }))).toBe('172.68.234.206')
  })

  it('6. the same visitor through DIFFERENT Cloudflare edges -> the same key', () => {
    const a = getClientIp(h({ 'x-forwarded-for': '172.68.234.206', 'cf-connecting-ip': '203.0.113.7' }))
    const b = getClientIp(h({ 'x-forwarded-for': '162.158.159.5', 'cf-connecting-ip': '203.0.113.7' }))
    const c = getClientIp(h({ 'x-forwarded-for': '104.16.9.9', 'cf-connecting-ip': '203.0.113.7' }))
    expect(new Set([a, b, c]).size).toBe(1)
  })

  it('7. different visitors through the SAME edge -> different keys', () => {
    const a = getClientIp(h({ 'x-forwarded-for': '172.68.234.206', 'cf-connecting-ip': '203.0.113.7' }))
    const b = getClientIp(h({ 'x-forwarded-for': '172.68.234.206', 'cf-connecting-ip': '203.0.113.8' }))
    expect(a).not.toBe(b)
  })

  it('IPv6 visitors are keyed by /64 (rotating inside a prefix cannot dodge the limit)', () => {
    const a = getClientIp(h({ 'x-forwarded-for': '172.68.234.206', 'cf-connecting-ip': '2001:8f8:1b3b:16cf:8dd5:5460:d695:995d' }))
    const b = getClientIp(h({ 'x-forwarded-for': '162.158.159.5', 'cf-connecting-ip': '2001:08f8:1b3b:16cf:1:2:3:4' }))
    const other = getClientIp(h({ 'x-forwarded-for': '162.158.159.5', 'cf-connecting-ip': '2001:8f8:1b3b:16d0::1' }))
    expect(a).toBe(b)
    expect(a).toBe('2001:08f8:1b3b:16cf::/64')
    expect(other).not.toBe(a)
  })

  it('IPv4 forms are canonicalised (zero-padded / IPv4-mapped cannot create a second bucket)', () => {
    const plain = getClientIp(h({ 'x-forwarded-for': '172.68.234.206', 'cf-connecting-ip': '203.0.113.7' }))
    expect(getClientIp(h({ 'x-forwarded-for': '172.68.234.206', 'cf-connecting-ip': '::ffff:203.0.113.7' }))).toBe(plain)
    expect(getClientIp(h({ 'x-forwarded-for': '198.51.100.9' }))).toBe('198.51.100.9')
  })
})
