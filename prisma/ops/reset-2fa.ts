// Turn two-factor sign-in OFF for one account whose owner lost their phone AND their recovery codes. The person then signs in
// with their password only and can set two-factor up again from the account page. Run it yourself on the server:
//
//   ssh -t gco@<server> 'cd /opt/gco && docker compose exec worker npx tsx prisma/ops/reset-2fa.ts --email someone@example.com'
//
// It never reads or prints any secret or password. Verify the person's identity by another channel before running it.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { describeDatabase, readLine, requireTerminal } from './prompt'

const db = new PrismaClient()
const log = (m: string) => console.log(m)

async function main() {
  const i = process.argv.indexOf('--email')
  const email = (i > -1 ? process.argv[i + 1] : undefined)?.trim().toLowerCase()
  if (!email) throw new Error('--email is required')
  requireTerminal('This command')
  const production = process.env.NODE_ENV === 'production'
  log(production ? `\n*** PRODUCTION *** database: ${describeDatabase()}` : `\nDatabase: ${describeDatabase()}`)
  const user = await db.user.findUnique({ where: { email }, select: { id: true, tenantId: true, role: true, totpEnabledAt: true } })
  if (!user) throw new Error('No account with that email.')
  if (!user.totpEnabledAt) { log('Two-factor is not on for that account. Nothing to do.'); return }
  const confirm = await readLine(`Turn off two-factor for ${email} (${user.role})? Type  reset  to continue: `)
  if (confirm.trim() !== 'reset') throw new Error('Not confirmed. Nothing was changed.')
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryHashes: [] } }),
    db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    db.auditLog.create({ data: { tenantId: user.tenantId, actorUserId: null, action: 'auth.2fa_reset_by_operator', resource: 'user', resourceId: user.id } }),
  ])
  log('Done. Two-factor is off for that account and its sessions were signed out. They can set it up again from the account page.')
}
main().catch((e) => { console.error(`\nError: ${e instanceof Error ? e.message : 'unknown error'}`); process.exitCode = 1 }).finally(() => db.$disconnect())
