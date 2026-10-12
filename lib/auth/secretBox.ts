import crypto from 'crypto'

// Authenticated encryption (AES-256-GCM) for small secrets stored in the database (the two-factor seed). The key is derived from
// AUTH_SECRET with HKDF under a purpose label, so the raw signing secret is never used directly. Rotating AUTH_SECRET makes stored
// seeds undecryptable (users would re-enrol two-factor) - documented in docs/operations-features.md.

function key(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET is not set')
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'gco-secret-box-v1', 'totp-seed', 32))
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':')
}

export function decryptSecret(box: string): string {
  const [v, iv, tag, ct] = box.split(':')
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported secret format')
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8')
}
