// DEMO / DEVELOPMENT SEED DATA - clearly not real client data (spec section 49).
// Run with: npm run seed
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createLead, claimLead, changeStage } from '@/lib/crm/leads'
import { processWebhookEvent } from '@/lib/messages/ingest'

const db = new PrismaClient()

async function main() {
  console.log('Seeding demo data (DEV ONLY)...')

  // Fictional e-commerce/services company used as the standard sales-demo
  // narrative (see docs/sales-demo-script.md) - not a real client. Slug kept
  // as `demo-dating-app` for backwards compatibility with any existing demo
  // data already keyed on it; only the display name shown on screen changed.
  const tenant = await db.tenant.upsert({
    where: { slug: 'demo-dating-app' },
    update: { name: '[DEMO] Everline Retail Co' },
    create: { name: '[DEMO] Everline Retail Co', slug: 'demo-dating-app' },
  })

  // findFirst+create rather than db.integration.create() unconditionally -
  // Integration has no natural unique key to upsert on, but re-running this
  // script (e.g. before every live sales demo) must not pile up duplicate
  // "[DEMO] Dev Mock Integration" rows and orphaned WebhookEvents each time.
  let integration = await db.integration.findFirst({
    where: { tenantId: tenant.id, adapterKey: 'dev-mock', name: '[DEMO] Dev Mock Integration' },
  })
  if (!integration) {
    integration = await db.integration.create({
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
  }

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

  // --- Sales-demo scenario data (see docs/sales-demo-script.md) ---------
  // Created through the same lib/crm/leads.ts functions the real API routes
  // use (createLead/claimLead/changeStage), not raw Prisma writes, so the
  // seeded state is indistinguishable from what a live Hunter session would
  // produce. Idempotent: re-running `npm run seed` skips a lead that's
  // already there instead of throwing LeadDuplicateError.

  let northwindLead = await db.lead.findUnique({ where: { email: 'ops@northwindsupply.demo.gco' } })
  if (!northwindLead) {
    const { lead } = await createLead({
      companyName: '[DEMO] Northwind Supply Co',
      contactName: '[DEMO] Priya Desai',
      email: 'ops@northwindsupply.demo.gco',
      website: 'northwindsupply.demo.gco',
      industry: 'E-commerce / logistics',
      country: 'United Kingdom',
      source: 'website_contact_form',
      notes: 'Fictional demo lead - left unclaimed/NEW to demonstrate live ownership claiming.',
      estimatedValueEurCents: 850000,
      actorUserId: null,
    })
    northwindLead = lead
  }

  let marloweLead = await db.lead.findUnique({ where: { email: 'contact@marlowefinch.demo.gco' } })
  if (!marloweLead) {
    const { lead } = await createLead({
      companyName: '[DEMO] Marlowe & Finch Goods',
      contactName: '[DEMO] Tom Marlowe',
      email: 'contact@marlowefinch.demo.gco',
      website: 'marlowefinch.demo.gco',
      industry: 'E-commerce / retail',
      country: 'Ireland',
      source: 'website_contact_form',
      notes: 'Fictional demo lead - pre-walked to PROPOSAL so the demo can go straight to Submit for Approval.',
      estimatedValueEurCents: 1200000,
      actorUserId: null,
    })
    marloweLead = lead
    await claimLead(marloweLead.id, hunterUser.id)
    for (const stage of ['CONTACTED', 'ENGAGED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL']) {
      await changeStage(marloweLead.id, hunterUser.id, stage)
    }
  }

  // One inbound demo conversation, ingested through the actual webhook
  // pipeline (db.webhookEvent.create + processWebhookEvent), exactly the way
  // tests/integration/*.test.ts exercise it - not a hand-inserted Message row.
  // This exercises real dedup, queueing, and the live assignment engine, so
  // it lands on operator1@demo.gco's queue the same way a real message would.
  const demoEventPayload = {
    events: [
      {
        event_id: 'demo-seed-order-not-shipped-1',
        message_id: 'demo-seed-order-not-shipped-1-msg',
        user_id: 'demo-customer-order-48213',
        text: "Hi, I placed an order three days ago (order #48213) and it still shows as not shipped. Could someone please check on this?",
      },
    ],
  }
  let demoWebhookEvent = await db.webhookEvent.findUnique({
    where: {
      integrationId_externalEventId: {
        integrationId: integration.id,
        externalEventId: demoEventPayload.events[0]!.event_id,
      },
    },
  })
  if (!demoWebhookEvent) {
    demoWebhookEvent = await db.webhookEvent.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        externalEventId: demoEventPayload.events[0]!.event_id,
        payloadHash: 'demo-seed-payload-hash',
        rawPayload: demoEventPayload,
      },
    })
  }
  if (!demoWebhookEvent.processed) {
    try {
      await processWebhookEvent(demoWebhookEvent.id)
    } catch (err) {
      console.warn(
        'Could not process the demo conversation webhook event (Redis/queue infra may not be running). ' +
          'The event is persisted and will process once the stack (worker + Redis) is up - re-run `npm run seed` then.',
        err instanceof Error ? err.message : err,
      )
    }
  }

  console.log('Seed complete.')
  console.log('Login with any of these (password: DemoPassword123!):')
  console.log(` - ${admin.email} (CEO_ADMIN)`)
  console.log(` - ${manager.email} (MANAGER)`)
  console.log(` - ${operatorUser.email} (OPERATOR)`)
  console.log(` - ${clientUser.email} (CLIENT)`)
  console.log(` - ${hunterUser.email} (HUNTER)`)
  console.log(`Integration webhook URL: /api/v1/webhooks/${integration.id}`)
  console.log(`Demo lead (unclaimed, NEW): ${northwindLead.companyName}`)
  console.log(`Demo lead (owned by ${hunterUser.email}, PROPOSAL): ${marloweLead.companyName}`)
  const finalWebhookEvent = await db.webhookEvent.findUniqueOrThrow({ where: { id: demoWebhookEvent.id } })
  console.log(`Demo conversation webhook event: ${finalWebhookEvent.id} (processed: ${finalWebhookEvent.processed})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
