// Set, extend, or clear the time-limited privileged-access expiry on one account (CEO decision, 16 Nov 2026).
// Once accessExpiresAt passes, the hourly sweep in workers/index.ts (lib/auth/accessExpiry.ts) disables the account.
// To EXTEND (renew) access: run this again with a new, later date before the old one passes.
// To REVOKE immediately: don't use this script - set isActive=false directly (already exists, no expiry wait needed).
// Run it yourself on the server:
//
//   ssh -t gco@<server> 'cd /opt/gco && docker compose exec worker npx tsx prisma/ops/set-access-expiry.ts --email someone@example.com --days 90'
//   ssh -t gco@<server> 'cd /opt/gco && docker compose exec worker npx tsx prisma/ops/set-access-expiry.ts --email someone@example.com --clear'
//
// It never reads or prints any secret or password. Verify the person's identity and the requested duration (who
// approved it, for how long) through a separate channel before running it - this is a privileged-access decision,
// not a routine account change.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { describeDatabase, readLine, requireTerminal } from './prompt'

const db = new PrismaClient()
const log = (m: string) => console.log(m)

async function main() {
  const args = process.argv
  const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : undefined }
  const email = flag('email')?.trim().toLowerCase()
  const daysArg = flag('days')
  const clear = args.includes('--clear')
  if (!email) throw new Error('--email is required')
  if (!clear && !daysArg) throw new Error('Specify --days N (extend/set expiry N days from now) or --clear (remove the expiry)')
  requireTerminal('This command')

  const production = process.env.NODE_ENV === 'production'
  log(production ? `\n*** PRODUCTION *** database: ${describeDatabase()}` : `\nDatabase: ${describeDatabase()}`)
  const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true, isActive: true, accessExpiresAt: true } })
  if (!user) throw new Error('No account with that email.')

  const newValue = clear ? null : new Date(Date.now() + Number(daysArg) * 24 * 60 * 60 * 1000)
  if (newValue && Number.isNaN(newValue.getTime())) throw new Error('--days must be a number')
  log(`Account: ${email} (${user.role}, currently ${user.isActive ? 'active' : 'DISABLED'})`)
  log(`Current expiry: ${user.accessExpiresAt ? user.accessExpiresAt.toISOString() : 'none (no expiry set)'}`)
  log(`New expiry: ${newValue ? newValue.toISOString() : 'none (cleared)'}`)
  const confirm = await readLine('Type  confirm  to apply this change: ')
  if (confirm.trim() !== 'confirm') throw new Error('Not confirmed. Nothing was changed.')

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { accessExpiresAt: newValue } }),
    db.auditLog.create({ data: { tenantId: null, actorUserId: null, action: 'auth.access_expiry_set', resource: 'user', resourceId: user.id, metadata: { role: user.role, email, newExpiry: newValue?.toISOString() ?? null, via: 'ops-cli' } as object } }),
  ])
  log(`Done. ${newValue ? `This account must be re-renewed before ${newValue.toISOString()} or it will be auto-disabled.` : 'This account no longer has a privileged-access expiry.'}`)
}
main().catch((e) => { console.error(`\nError: ${e instanceof Error ? e.message : 'unknown error'}`); process.exitCode = 1 }).finally(() => db.$disconnect())
