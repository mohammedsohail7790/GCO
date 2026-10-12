// Seeds the STAGING environment with three fictional clients, their teams and a simulated client platform each.
// STAGING ONLY: refuses unless GCO_ENVIRONMENT=staging (and, in a production-mode process, the explicit staging flag).
//
//   STAGING_PERSONA_PASSWORD='<12+ chars you choose>' GCO_ENVIRONMENT=staging npx tsx prisma/staging-seed.ts [--reset]
//
// The shared password for the fictional persona accounts is chosen by you at run time; it is not in the repository and is never printed.
// Cristian's own CEO account is NOT created here - use prisma/ops/staff-account.ts --role CEO_ADMIN (hidden password prompt).
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '@/lib/auth/password'
import { assertSeedAllowed } from './seedGuard'
import { assertStagingSeedAllowed, checkPersonaPassword, resetStagingActivity, seedStaging, StagingSeedError } from '@/lib/staging/seed'

const db = new PrismaClient()

async function main() {
  assertStagingSeedAllowed()
  assertSeedAllowed() // production-mode (docker) process additionally needs GCO_ALLOW_DEMO_SEED=yes-this-is-staging-not-production
  const reset = process.argv.includes('--reset')
  const passwordHash = await hashPassword(checkPersonaPassword(process.env.STAGING_PERSONA_PASSWORD))
  const first = await seedStaging(db, { passwordHash, history: !reset })
  if (reset) {
    await resetStagingActivity(db, first.tenants.map((t) => t.tenantId))
    await seedStaging(db, { passwordHash, history: true })
    console.log('Staging activity reset (conversations, reviews, escalations cleared; accounts and settings kept).')
  }
  console.log(`Staging seeded: ${first.tenants.length} fictional clients.`)
  for (const t of first.tenants) {
    console.log(`\n${t.name}  (slug ${t.slug})`)
    for (const [role, list] of Object.entries(t.emails)) console.log(`  ${role}: ${list.join(', ')}`)
  }
  console.log('\nAll persona accounts use the password you supplied in STAGING_PERSONA_PASSWORD (not shown).')
}
main().catch((e) => { console.error(`\nError: ${e instanceof StagingSeedError || e instanceof Error ? e.message : 'unknown'}`); process.exitCode = 1 }).finally(() => db.$disconnect())
