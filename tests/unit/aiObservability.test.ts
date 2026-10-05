import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { categorizeAiError, describeAiError, AiOutputTruncatedError } from '@/lib/ai/observability'

const named = (name: string, extra: object = {}) => Object.assign(new Error('x'), { name, ...extra })

describe('categorizeAiError', () => {
  it.each([
    [named('APIUserAbortError'), 'timeout'],
    [named('APIConnectionTimeoutError'), 'timeout'],
    [named('APIConnectionError'), 'connection'],
    [named('RateLimitError', { status: 429 }), 'rate_limited'],
    [named('AuthenticationError', { status: 401 }), 'auth'],
    [named('BadRequestError', { status: 400 }), 'bad_request'],
    [named('InternalServerError', { status: 500 }), 'provider_error'],
    [named('InternalServerError', { status: 503 }), 'provider_error'],
    [new SyntaxError('bad json'), 'invalid_output'],
    [new AiOutputTruncatedError(), 'truncated'],
    [new Error('whatever'), 'unknown'],
    ['not an error', 'unknown'],
  ])('%#', (err, expected) => expect(categorizeAiError(err)).toBe(expected))

  it('classifies schema-invalid model output (ZodError) as invalid_output', () => {
    const r = z.object({ a: z.string() }).safeParse({ a: 1 })
    expect(r.success).toBe(false)
    expect(categorizeAiError((r as any).error)).toBe('invalid_output')
  })

  it('describeAiError never includes the original message', () => {
    const e = named('RateLimitError', { status: 429, message: 'contains SECRET' })
    expect(describeAiError(e)).toBe('rate_limited (HTTP 429)')
    expect(describeAiError(e)).not.toContain('SECRET')
  })
})
