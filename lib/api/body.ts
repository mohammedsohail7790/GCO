// Byte-limited JSON body reading for routes reachable without a session (login, invitations, public forms, 2FA).
// `req.json()` buffers the whole body whatever its size, and a declared Content-Length alone is not a limit
// (a chunked request has none). This reads the stream and stops as soon as the limit is passed.
// Errors fit handleRouteError: too large -> 413 (an error with .status), malformed JSON -> SyntaxError -> 400.

/** Small auth bodies (email, password, code, token): a few hundred bytes in practice. Public forms keep their own limit. */
export const AUTH_BODY_MAX_BYTES = 8_192

export class BodyTooLargeError extends Error {
  readonly status = 413
  constructor() {
    super('Request too large')
  }
}

export async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > maxBytes) throw new BodyTooLargeError()
  if (!req.body) return JSON.parse('')

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new BodyTooLargeError()
    }
    chunks.push(value)
  }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)))
}
