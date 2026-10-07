// Minimal interactive prompt for operator scripts. Secrets are read ONLY from an interactive terminal with echo off:
// never from arguments, environment variables or a pipe, so they cannot land in shell history, `ps`, CI logs or files.
export function requireTerminal(what: string): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`${what} must be run in an interactive terminal (ssh -t ...). It will not read secrets from arguments, environment variables or pipes.`)
  }
}

export function readLine(prompt: string, opts: { hidden?: boolean } = {}): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin
    // Echo is switched OFF *before* the prompt is printed: anything typed or pasted the instant the prompt appears must
    // never be echoed by the terminal's line discipline.
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    process.stdout.write(prompt)
    let buf = ''
    let skip = 0 // swallow the 2 characters that follow an ESC (arrow keys etc.)
    const done = (value: string) => {
      stdin.removeListener('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      process.stdout.write('\n')
      resolve(value)
    }
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (skip > 0) { skip--; continue }
        if (ch === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130) } // Ctrl-C
        if (ch === '\u001b') { skip = 2; continue }
        if (ch === '\r' || ch === '\n') return done(buf)
        if (ch === '\u007f' || ch === '\b') {
          if (buf.length > 0) {
            buf = buf.slice(0, -1)
            if (!opts.hidden) process.stdout.write('\b \b')
          }
          continue
        }
        if (ch >= ' ') {
          buf += ch
          if (!opts.hidden) process.stdout.write(ch)
        }
      }
    }
    stdin.on('data', onData)
  })
}

/** Database location for the confirmation banner - host/port/name only, never the credentials in the URL. */
export function describeDatabase(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '')
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}
