// Create a real staff account, or set a new password on one, WITHOUT the password ever being an argument, an
// environment variable, a file, a log line or chat text. Run it yourself, on the server, in an interactive terminal:
//
//   ssh -t gco@<server> 'cd /opt/gco && docker compose exec worker npx tsx prisma/ops/staff-account.ts --role CEO_ADMIN'
//
// You are prompted for the email, a display name, and the password (hidden, typed twice). Only a bcrypt hash is stored.
// Flags: --role CEO_ADMIN|ASSISTANT|HUNTER (required) - --email x - --name "x" - --dry-run (validate, change nothing,
// ask for no password) - --update-password (rotate an EXISTING account) - --allow-role-change.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { hashPassword, validateStaffPassword } from '@/lib/auth/password'
import { AccountToolError, STAFF_ROLES, upsertStaffAccount, normalizeStaffEmail, type StaffRole } from '@/lib/auth/staffAccounts'
import { describeDatabase, readLine, requireTerminal } from './prompt'

const db = new PrismaClient()
const log = (m: string) => console.log(m)

interface Args { role?: string; email?: string; name?: string; dryRun: boolean; updatePassword: boolean; allowRoleChange: boolean }
function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, updatePassword: false, allowRoleChange: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    const value = () => {
      const v = argv[++i]
      if (!v || v.startsWith('--')) throw new AccountToolError(`${a} needs a value`)
      return v
    }
    const flag = a.split('=')[0]!
    if (/(pass|pwd|\bpw\b|secret|token|credential)/i.test(flag) && flag !== '--update-password') throw new AccountToolError('Passwords are never accepted as arguments - you will be prompted privately.')
    if (a === '--role') out.role = value()
    else if (a === '--email') out.email = value()
    else if (a === '--name') out.name = value()
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--update-password') out.updatePassword = true
    else if (a === '--allow-role-change') out.allowRoleChange = true
    else throw new AccountToolError(`Unknown argument: ${a}`)
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.role || !(STAFF_ROLES as readonly string[]).includes(args.role)) throw new AccountToolError(`--role is required: ${STAFF_ROLES.join(' | ')}`)
  const role = args.role as StaffRole
  const production = process.env.NODE_ENV === 'production'
  if (!args.dryRun || !args.email) requireTerminal('This command')

  log(production ? `\n*** PRODUCTION *** database: ${describeDatabase()}` : `\nDevelopment/non-production process. Database: ${describeDatabase()}`)
  log(`Role: ${role}${args.dryRun ? '   (DRY RUN - nothing will be changed)' : ''}\n`)

  const email = normalizeStaffEmail(args.email ?? (await readLine('Email: ')))
  const displayName = (args.name ?? (await readLine('Display name: '))).trim()

  if (args.dryRun) {
    const r = await upsertStaffAccount(db, { email, displayName, role, passwordHash: null, updatePassword: args.updatePassword, allowRoleChange: args.allowRoleChange, dryRun: true })
    log(`Dry run OK: would ${r.action === 'would_create' ? 'create' : 'set a new password on'} ${r.role} account ${r.email}. Nothing was changed and no password was requested.`)
    return
  }
  if (production) {
    const confirm = await readLine('Type the word  production  to continue: ')
    if (confirm.trim() !== 'production') throw new AccountToolError('Not confirmed. Nothing was changed.')
  }

  let password = await readLine('Password (hidden): ', { hidden: true })
  const problem = validateStaffPassword(password, email)
  if (problem) throw new AccountToolError(`Password rejected: ${problem}`)
  const again = await readLine('Repeat password (hidden): ', { hidden: true })
  if (again !== password) throw new AccountToolError('The two passwords did not match. Nothing was changed.')
  const passwordHash = await hashPassword(password)
  password = '' // best effort: drop the plaintext reference now that only the hash is needed

  const r = await upsertStaffAccount(db, { email, displayName, role, passwordHash, updatePassword: args.updatePassword, allowRoleChange: args.allowRoleChange })
  log(`\nDone: ${r.action === 'created' ? 'created' : 'updated the password of'} ${r.role} account ${r.email} (id ${r.userId}).`)
  log('The password was not displayed, logged or stored anywhere except as a bcrypt hash in the database.')
  if (r.action === 'password_updated') log('All previous sessions for this account were revoked.')
}

main()
  .catch((err) => {
    console.error(`\nError: ${err instanceof AccountToolError || err instanceof Error ? err.message : 'unknown error'}`)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
