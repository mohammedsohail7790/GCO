import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/response'

async function bodyOf(res: Response) {
  return res.json() as Promise<{ ok: boolean; error: { message: string } }>
}

describe('handleRouteError classification', () => {
  it('a Zod validation error is a 400 with the validation detail, not a 500', async () => {
    let caught: unknown
    try {
      z.object({ email: z.string().email() }).parse({ email: 'not-an-email' })
    } catch (err) {
      caught = err
    }
    const res = handleRouteError(caught)
    expect(res.status).toBe(400)
    const body = await bodyOf(res)
    expect(body.error.message).toContain('email')
  })

  it('malformed JSON (a SyntaxError) is a 400, not a 500', async () => {
    let caught: unknown
    try {
      JSON.parse('not valid json')
    } catch (err) {
      caught = err
    }
    const res = handleRouteError(caught)
    expect(res.status).toBe(400)
  })

  it('a deliberately thrown error with .status is passed through with its own message (our own fail() calls)', async () => {
    const err = Object.assign(new Error('This conversation is not currently assigned to you'), { status: 403 })
    const res = handleRouteError(err)
    expect(res.status).toBe(403)
    const body = await bodyOf(res)
    expect(body.error.message).toBe('This conversation is not currently assigned to you')
  })

  it('an unexpected error with no .status is a 500 with a GENERIC message - never the raw exception text', async () => {
    const err = new Error('Invalid `db.user.findUnique()` invocation: connection string details, internal query shape, etc.')
    const res = handleRouteError(err)
    expect(res.status).toBe(500)
    const body = await bodyOf(res)
    expect(body.error.message).toBe('Internal server error')
    expect(body.error.message).not.toContain('connection string')
    expect(body.error.message).not.toContain('db.user.findUnique')
  })
})
