import { describe, it, expect, beforeAll } from 'vitest'
import { toCsv } from '@/lib/exports/csv'
import { createExportLink, verifyExportLink, EXPORT_LINK_TTL_SECONDS } from '@/lib/exports/link'

beforeAll(() => { process.env.AUTH_SECRET = 'x'.repeat(40) })

describe('toCsv', () => {
  it('quotes commas, quotes and line breaks and uses CRLF', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line1\nline2', 3]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line1\nline2",3\r\n')
  })
  it('neutralises spreadsheet formulas in text but leaves numbers (including negatives) alone', () => {
    const out = toCsv(['t', 'n'], [['=HYPERLINK("http://evil")', -5], ['+1', 0], ['@SUM(A1)', 1], ['-cmd', 2], ['plain', 3]])
    const lines = out.trim().split('\r\n')
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://evil"")",-5`)
    expect(lines[2]).toBe("'+1,0")
    expect(lines[3]).toBe("'@SUM(A1),1")
    expect(lines[4]).toBe("'-cmd,2")
    expect(lines[5]).toBe('plain,3')
  })
  it('writes dates as ISO text and empty for null/undefined', () => {
    expect(toCsv(['d', 'n', 'u'], [[new Date('2026-11-01T10:00:00Z'), null, undefined]])).toBe('d,n,u\r\n2026-11-01T10:00:00.000Z,,\r\n')
  })
})

describe('export download link', () => {
  const req = { kind: 'usage', tenantId: 't1', from: '2026-11-01', to: '2026-11-08' } as const
  it('is honoured for the same user and returns the exact filter', () => {
    const { token } = createExportLink('u1', req)
    expect(verifyExportLink(token, 'u1')).toEqual(req)
  })
  it('is refused for another user', () => {
    expect(verifyExportLink(createExportLink('u1', req).token, 'u2')).toBeNull()
  })
  it('expires after the time limit', () => {
    const now = Date.now()
    const { token } = createExportLink('u1', req, now)
    expect(verifyExportLink(token, 'u1', now + (EXPORT_LINK_TTL_SECONDS - 5) * 1000)).not.toBeNull()
    expect(verifyExportLink(token, 'u1', now + (EXPORT_LINK_TTL_SECONDS + 5) * 1000)).toBeNull()
  })
  it('is refused when the filter or signature is altered, or the token is garbage', () => {
    const [body = '', sig = ''] = createExportLink('u1', req).token.split('.')
    const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), tenantId: 'other' })).toString('base64url')
    expect(verifyExportLink(`${altered}.${sig}`, 'u1')).toBeNull()
    expect(verifyExportLink(`${body}.${sig.slice(0, -2)}AA`, 'u1')).toBeNull()
    expect(verifyExportLink('nonsense', 'u1')).toBeNull()
    expect(verifyExportLink('', 'u1')).toBeNull()
  })
})
