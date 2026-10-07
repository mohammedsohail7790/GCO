// Retire the five published-password demo accounts: disable (never delete) them and revoke their sessions. The demo tenant,
// its data and all history are untouched. Pinned by immutable user id; refuses unless the accounts match EXACTLY and a
// verified real CEO_ADMIN account already exists.
//
//   report only (default, changes nothing):  docker compose exec worker npx tsx prisma/ops/disable-demo-accounts.ts
//   perform it (interactive confirmation):   docker compose exec worker npx tsx prisma/ops/disable-demo-accounts.ts --execute
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { AccountToolError, disableDemoAccounts } from '@/lib/auth/staffAccounts'
import { describeDatabase, readLine, requireTerminal } from './prompt'

const db = new PrismaClient()

async function main() {
  const execute = process.argv.includes('--execute')
  const unknown = process.argv.slice(2).filter((a) => a !== '--execute' && a !== '--dry-run')
  if (unknown.length) throw new AccountToolError(`Unknown argument: ${unknown[0]}`)
  console.log(`\nDatabase: ${describeDatabase()}${process.env.NODE_ENV === 'production' ? '   *** PRODUCTION ***' : ''}`)

  const preview = await disableDemoAccounts(db, { dryRun: true })
  console.log('\nDemo accounts (matched by immutable id, role and tenant):')
  for (const a of preview.accounts) console.log(`  ${a.id}  ${a.email.padEnd(20)} ${a.role.padEnd(10)} ${a.wasActive ? 'active  ' : 'disabled'}  live sessions: ${a.liveSessions}`)
  console.log(`\nReplacement CEO check: ${preview.replacement.ok ? 'PASS' : 'FAIL'} - ${preview.replacement.reason}${preview.replacement.ceoEmail ? ` (${preview.replacement.ceoEmail})` : ''}`)

  if (!execute) {
    console.log('\nReport only - nothing was changed. Re-run with --execute to disable these accounts and revoke their sessions.')
    return
  }
  requireTerminal('--execute')
  if (!preview.replacement.ok) throw new AccountToolError(`Refusing to disable the demo accounts: ${preview.replacement.reason}`)
  const confirm = await readLine('\nType  disable demo accounts  to continue: ')
  if (confirm.trim() !== 'disable demo accounts') throw new AccountToolError('Not confirmed. Nothing was changed.')
  const r = await disableDemoAccounts(db)
  console.log(`\nDone: ${r.disabled} account(s) disabled, ${r.sessionsRevoked} session(s) revoked. Tenant, data and history were not touched.`)
  console.log('Note: an access token issued in the last 60 minutes stays valid until it expires (tokens are stateless); new logins and token refreshes are refused immediately.')
}

main()
  .catch((err) => {
    console.error(`\nError: ${err instanceof Error ? err.message : 'unknown error'}`)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
