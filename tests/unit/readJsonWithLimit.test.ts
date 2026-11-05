import { describe, it, expect } from 'vitest'
import { readJsonWithLimit, BodyTooLargeError } from '@/lib/api/body'
import { handleRouteError } from '@/lib/api/response'

const json = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://test/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })

// A body with no Content-Length (as a chunked upload arrives), streamed in pieces.
function chunked(parts: string[]) {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p))
      c.close()
    },
  })
  return new Request('http://test/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
}

describe('readJsonWithLimit', () => {
  it('parses a body within the limit', async () => {
    expect(await readJsonWithLimit(json('{"email":"a@b.c"}'), 100)).toEqual({ email: 'a@b.c' })
  })

  it('refuses a declared Content-Length over the limit before reading', async () => {
    await expect(readJsonWithLimit(json('{}', { 'content-length': '5000' }), 100)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it('refuses a streamed body with no Content-Length once it passes the limit', async () => {
    const req = chunked(['{"a":"', 'x'.repeat(80), 'y'.repeat(80), '"}'])
    expect(req.headers.get('content-length')).toBeNull()
    await expect(readJsonWithLimit(req, 100)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it('counts bytes, not characters', async () => {
    // 40 three-byte characters = 120 bytes, over a 100-byte limit although only 40 characters long.
    await expect(readJsonWithLimit(chunked([`"${'€'.repeat(40)}"`]), 100)).rejects.toBeInstanceOf(BodyTooLargeError)
    expect(await readJsonWithLimit(chunked([`"${'€'.repeat(20)}"`]), 100)).toBe('€'.repeat(20))
  })

  it('maps to 413 for too large and 400 for malformed or empty JSON', async () => {
    expect(handleRouteError(new BodyTooLargeError()).status).toBe(413)
    const malformed = await readJsonWithLimit(json('{oops'), 100).catch((e) => e)
    expect(handleRouteError(malformed).status).toBe(400)
    const empty = await readJsonWithLimit(json(''), 100).catch((e) => e)
    expect(handleRouteError(empty).status).toBe(400)
  })
})
