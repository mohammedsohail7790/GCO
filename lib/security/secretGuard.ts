// One guard for "no credentials in business records". Used wherever a human types free text that is stored and later shown
// to other staff: client profile (onboarding), discovery/qualification/next-action and notes (CRM). API keys, passwords,
// bearer tokens, webhook secrets, private keys and OAuth tokens never belong there - the integration secret mechanism is the
// only place a secret may exist. Heuristic by nature: it refuses the common shapes and ordinary prose passes.

export class SecretInFieldError extends Error {
  status = 400
  code = 'LOOKS_LIKE_SECRET'
}

export function looksLikeSecret(v: string): boolean {
  // Long opaque tokens are only judged outside URLs (a long LinkedIn/profile path is not a credential)...
  const withoutUrls = v.replace(/https?:\/\/\S+/gi, ' ')
  return (
    /[A-Za-z0-9+/_=-]{32,}/.test(withoutUrls) || // one long unbroken token
    /\b(sk|pk|rk|whsec|xox[abp])[-_][A-Za-z0-9_-]{8,}/i.test(v) || // vendor key prefixes (sk-live-..., whsec_..., xoxb-...)
    /\bbearer\s+(?=[A-Za-z0-9._~+/-]*\d)[A-Za-z0-9._~+/-]{6,}/i.test(v) ||
    /(secret|password|passwd|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|bearer|private[ _-]?key)\s*[:=]/i.test(v) ||
    /[?&](token|key|secret|password|api[_-]?key|access_token|refresh_token)=[^&\s]{6,}/i.test(v) || // ...but a URL that carries one is
    /-----BEGIN/.test(v)
  )
}

/** Throws SecretInFieldError naming the offending FIELD (never its value) if any value looks like a credential. */
export function assertNoSecrets(fields: Record<string, unknown>): void {
  for (const [name, raw] of Object.entries(fields)) {
    if (typeof raw === 'string' && raw && looksLikeSecret(raw)) {
      throw new SecretInFieldError(`${name} looks like a credential. Never record API keys, passwords, tokens or secrets here - use the integration secret instead.`)
    }
  }
}
