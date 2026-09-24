// DEMO / DEVELOPMENT SEED DATA - clearly not real client data (spec section 49).
// Run with: npm run seed
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  console.log('Seeding demo data (DEV ONLY)...')

  const tenant = await db.tenant.upsert({
    where: { slug: 'demo-dating-app' },
    update: {},
    create: { name: '[DEMO] Dating App Co', slug: 'demo-dating-app' },
  })

  const integration = await db.integration.create({
    data: {
      tenantId: tenant.id,
      adapterKey: 'dev-mock',
      name: '[DEMO] Dev Mock Integration',
      config: {},
      // Per-integration webhook secret (confirmed business rule: no shared
      // secret across clients). Sourced from DEV_WEBHOOK_SECRET here purely
      // for a stable, repeatable local/test value - tests/e2e/helpers.ts's
      // signWebhookBody() signs with the same env var. A second real
      // integration gets its own distinct secret via
      // PATCH /api/v1/admin/integrations/:id/webhook-secret, never this one.
      webhookSecret: process.env.DEV_WEBHOOK_SECRET || undefined,
    },
  })

  const pass = await bcrypt.hash('DemoPassword123!', 12)

  const admin = await db.user.upsert({
    where: { email: 'admin@demo.gco' },
    update: {},
    create: { email: 'admin@demo.gco', passwordHash: pass, role: 'CEO_ADMIN', displayName: '[DEMO] CEO Admin' },
  })

  const manager = await db.user.upsert({
    where: { email: 'manager@demo.gco' },
    update: {},
    create: { email: 'manager@demo.gco', passwordHash: pass, role: 'MANAGER', displayName: '[DEMO] Manager', tenantId: tenant.id },
  })

  const operatorUser = await db.user.upsert({
    where: { email: 'operator1@demo.gco' },
    update: {},
    create: { email: 'operator1@demo.gco', passwordHash: pass, role: 'OPERATOR', displayName: '[DEMO] Operator One', tenantId: tenant.id },
  })

  const existingOperator = await db.operator.findUnique({ where: { userId: operatorUser.id } })
  if (!existingOperator) {
    await db.operator.create({
      data: {
        userId: operatorUser.id,
        tenantId: tenant.id,
        status: 'AVAILABLE',
        services: { create: { tenantId: tenant.id } },
      },
    })
  }

  const clientUser = await db.user.upsert({
    where: { email: 'client@demo.gco' },
    update: {},
    create: { email: 'client@demo.gco', passwordHash: pass, role: 'CLIENT', displayName: '[DEMO] Client Contact', tenantId: tenant.id },
  })

  // HUNTER is a global/internal-staff role (like CEO_ADMIN) - Hunters work
  // GCO's own sales pipeline, not any one client tenant, so no tenantId here.
  const hunterUser = await db.user.upsert({
    where: { email: 'hunter1@demo.gco' },
    update: {},
    create: { email: 'hunter1@demo.gco', passwordHash: pass, role: 'HUNTER', displayName: '[DEMO] Hunter One' },
  })
  const existingHunterProfile = await db.hunterProfile.findUnique({ where: { userId: hunterUser.id } })
  if (!existingHunterProfile) {
    await db.hunterProfile.create({ data: { userId: hunterUser.id, commissionPercentage: 10.0 } })
  }

  console.log('Seed complete.')
  console.log('Login with any of these (password: DemoPassword123!):')
  console.log(` - ${admin.email} (CEO_ADMIN)`)
  console.log(` - ${manager.email} (MANAGER)`)
  console.log(` - ${operatorUser.email} (OPERATOR)`)
  console.log(` - ${clientUser.email} (CLIENT)`)
  console.log(` - ${hunterUser.email} (HUNTER)`)
  console.log(`Integration webhook URL: /api/v1/webhooks/${integration.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
