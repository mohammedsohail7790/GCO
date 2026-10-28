// Usage: npx tsx prisma/demo-showcase.ts [--reset]   (--reset clears the demo tenant's conversations first)
// SHOWCASE DEMO DATA for screen recordings and partner demos - LOCAL / STAGING ONLY, never production
// (assertSeedAllowed refuses a production-mode process). Run AFTER `npm run seed`:  npx tsx prisma/demo-showcase.ts
//
// Everything here is fictional: names, companies (.demo.gco addresses) and conversations. Conversation history is
// written as fixtures (backdated rows); live behaviour in a recording should be driven through the real UI/webhook.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createLead, claimLead, changeStage } from '@/lib/crm/leads'
import { assertSeedAllowed } from './seedGuard'
import { deriveOutcome } from '@/lib/qa/reviews'

const db = new PrismaClient()
const ago = (min: number) => new Date(Date.now() - min * 60_000)

/** Clears the demo tenant's conversations/reviews and the local onboarding rows so a recording starts from a clean slate. */
async function resetShowcase(tenantId: string) {
  const w = { tenantId }
  const convIds = (await db.conversation.findMany({ where: w, select: { id: true } })).map((c) => c.id)
  await db.conversation.updateMany({ where: w, data: { currentAssignmentId: null } })
  await db.qaReview.deleteMany({ where: w })
  await db.escalationEvent.deleteMany({ where: { escalation: { conversationId: { in: convIds } } } })
  await db.escalation.deleteMany({ where: { conversationId: { in: convIds } } })
  await db.aiGeneration.deleteMany({ where: w })
  await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId } } })
  await db.assignment.deleteMany({ where: w })
  await db.messageEvent.deleteMany({ where: { message: { tenantId } } })
  await db.usageRecord.deleteMany({ where: w })
  await db.message.deleteMany({ where: w })
  await db.conversation.deleteMany({ where: w })
  await db.$executeRawUnsafe('TRUNCATE TABLE "ClientOnboarding" CASCADE')
  console.log('Showcase reset: demo tenant conversations, QA reviews and local onboarding rows cleared.')
}

/** A second fictional client with its own login, so a demo can show that one client never sees another client's data. Idempotent. */
async function ensureSecondClient() {
  const tenant = await db.tenant.upsert({ where: { slug: 'demo-travel-co' }, update: {}, create: { name: 'Northbay Travel (demo)', slug: 'demo-travel-co', defaultResponseSlaSeconds: 300 } })
  const hash = (await db.user.findUniqueOrThrow({ where: { email: 'client@demo.gco' } })).passwordHash
  await db.user.upsert({ where: { email: 'client2@demo.gco' }, update: {}, create: { email: 'client2@demo.gco', passwordHash: hash, role: 'CLIENT', displayName: 'Riley Chen', tenantId: tenant.id } })
  if ((await db.conversation.count({ where: { tenantId: tenant.id } })) > 0) return
  const opUser = await db.user.upsert({ where: { email: 'operator4@demo.gco' }, update: {}, create: { email: 'operator4@demo.gco', passwordHash: hash, role: 'OPERATOR', displayName: 'Nina Rossi', tenantId: tenant.id } })
  const op = (await db.operator.findUnique({ where: { userId: opUser.id } })) ?? (await db.operator.create({ data: { userId: opUser.id, tenantId: tenant.id, languages: ['it', 'en'], status: 'OFFLINE', capacity: 2 } }))
  const rows = [
    { lang: 'it', customer: 'Giulia Ferri', msg: 'Buongiorno, vorrei cambiare la data del mio viaggio di prova.', reply: 'Buongiorno Giulia, certo. Le propongo due nuove date e conferma quella che preferisce.', minutesAgo: 95 },
    { lang: 'en', customer: 'Tom Hughes', msg: 'Can I add a bag to my demo booking?', reply: 'Hi Tom, yes. I have added one checked bag to your booking and sent the updated confirmation.', minutesAgo: 60 },
  ]
  for (const [i, r] of rows.entries()) {
    const conv = await db.conversation.create({ data: { tenantId: tenant.id, externalUserId: r.customer, state: 'WAITING_FOR_CLIENT', language: r.lang, createdAt: ago(r.minutesAgo) } })
    await db.message.create({ data: { tenantId: tenant.id, conversationId: conv.id, direction: 'INBOUND', status: 'RECEIVED', content: r.msg, externalMessageId: `showcase2-in-${i}`, createdAt: ago(r.minutesAgo) } })
    await db.message.create({ data: { tenantId: tenant.id, conversationId: conv.id, direction: 'OUTBOUND', status: 'DELIVERED', content: r.reply, externalMessageId: `showcase2-out-${i}`, operatorId: op.id, sentAt: ago(r.minutesAgo - 4), deliveredAt: ago(r.minutesAgo - 4), createdAt: ago(r.minutesAgo - 4) } })
  }
  console.log('Second demo client created: Northbay Travel (demo), login client2@demo.gco, 2 answered conversations (it/en).')
}

async function main() {
  assertSeedAllowed()
  const tenant = await db.tenant.findFirstOrThrow({ where: { slug: 'demo-dating-app' } })
  if (process.argv.includes('--reset')) await resetShowcase(tenant.id)
  await ensureSecondClient()
  if ((await db.conversation.count({ where: { tenantId: tenant.id } })) > 3) {
    console.log('Showcase data already present (tenant has conversations) - nothing to do.')
    return
  }
  await db.tenant.update({ where: { id: tenant.id }, data: { name: 'Everline Retail Co (demo)', defaultResponseSlaSeconds: 300 } })

  // --- people (display names only; emails/roles unchanged) -----------------
  const rename = (email: string, displayName: string) => db.user.update({ where: { email }, data: { displayName } })
  await rename('manager@demo.gco', 'Taylor Reed')
  await rename('client@demo.gco', 'Jordan Blake')
  await rename('hunter1@demo.gco', 'Casey Nguyen')
  const alexUser = await rename('operator1@demo.gco', 'Alex Morgan')
  const hash = alexUser.passwordHash
  const manager = await db.user.findUniqueOrThrow({ where: { email: 'manager@demo.gco' } })

  const mkOperator = async (email: string, displayName: string, languages: string[], status: 'AVAILABLE' | 'OFFLINE') => {
    const u = await db.user.upsert({ where: { email }, update: { displayName }, create: { email, passwordHash: hash, role: 'OPERATOR', displayName, tenantId: tenant.id } })
    const existing = await db.operator.findUnique({ where: { userId: u.id } })
    if (existing) return db.operator.update({ where: { id: existing.id }, data: { languages, status, capacity: 2 } })
    return db.operator.create({ data: { userId: u.id, tenantId: tenant.id, languages, status, capacity: 2 } })
  }
  const alex = await db.operator.update({ where: { userId: alexUser.id }, data: { languages: ['en', 'es'], status: 'AVAILABLE', capacity: 2 } })
  const lucia = await mkOperator('operator2@demo.gco', 'Lucía Fernández', ['es', 'en'], 'OFFLINE')
  const marc = await mkOperator('operator3@demo.gco', 'Marc Dubois', ['fr', 'en'], 'OFFLINE')

  // --- conversation history (answered conversations, backdated) --------------
  type Ex = { lang: string; customer: string; msg: string; reply: string; op: typeof alex; minutesAgo: number }
  const history: Ex[] = [
    { lang: 'en', customer: 'Daniel Brooks', msg: 'Hi, could you help me with my demo order? It has not arrived yet.', reply: 'Of course, Daniel. I can see your order left the warehouse yesterday; it should arrive by tomorrow evening. I will stay on this until it does.', op: alex, minutesAgo: 190 },
    { lang: 'es', customer: 'Sofía Martínez', msg: 'Hola, necesito ayuda con el estado de mi pedido de demostración.', reply: '¡Claro, Sofía! Con gusto te ayudo a revisar el estado de tu pedido de demostración. Ya fue enviado y llegará mañana.', op: lucia, minutesAgo: 160 },
    { lang: 'en', customer: 'Priya Nair', msg: 'I was charged twice for the same demo order.', reply: 'Thanks for flagging this, Priya. I have passed the duplicate charge to our billing team; you will see the refund in 3–5 business days.', op: alex, minutesAgo: 140 },
    { lang: 'es', customer: 'Javier Ortega', msg: '¿Puedo cambiar la dirección de entrega de mi pedido?', reply: 'Lo siento, ya no es posible.', op: lucia, minutesAgo: 120 },
    { lang: 'fr', customer: 'Camille Laurent', msg: 'Bonjour, mon colis de démonstration est arrivé abîmé.', reply: 'Bonjour Camille, nous en sommes désolés. Nous vous renvoyons un colis neuf sans frais ; vous recevrez le suivi par message.', op: marc, minutesAgo: 100 },
    { lang: 'en', customer: 'Mei Tanaka', msg: 'How do I return an item from my demo order?', reply: 'You can start a return from your order page. If you tell me the item, I will send the return label link.', op: alex, minutesAgo: 75 },
  ]
  const messageIds: string[] = []
  for (const [i, h] of history.entries()) {
    const conv = await db.conversation.create({ data: { tenantId: tenant.id, externalUserId: h.customer, state: 'WAITING_FOR_CLIENT', language: h.lang, createdAt: ago(h.minutesAgo) } })
    await db.message.create({ data: { tenantId: tenant.id, conversationId: conv.id, direction: 'INBOUND', status: 'RECEIVED', content: h.msg, externalMessageId: `showcase-in-${i}`, createdAt: ago(h.minutesAgo) } })
    const out = await db.message.create({ data: { tenantId: tenant.id, conversationId: conv.id, direction: 'OUTBOUND', status: 'DELIVERED', content: h.reply, externalMessageId: `showcase-out-${i}`, operatorId: h.op.id, sentAt: ago(h.minutesAgo - 4), deliveredAt: ago(h.minutesAgo - 4), createdAt: ago(h.minutesAgo - 4) } })
    messageIds.push(out.id)
  }
  // Three replies already reviewed by the supervisor (so the QA summary has real, entered scores); the rest stay in the queue.
  const reviews: [number, number, number, number, string[], string][] = [
    [0, 5, 5, 4, [], 'Clear and proactive.'],
    [1, 5, 4, 5, [], 'Good Spanish, warm tone.'],
    [3, 3, 2, 2, ['tone', 'no_resolution'], 'Too curt - offer an alternative (re-route via carrier).'],
  ]
  for (const [idx, accuracy, tone, resolution, flags, note] of reviews) {
    const m = await db.message.findUniqueOrThrow({ where: { id: messageIds[idx]! } })
    await db.qaReview.create({ data: { tenantId: tenant.id, conversationId: m.conversationId, messageId: m.id, operatorId: m.operatorId, reviewerUserId: manager.id, accuracy, tone, resolution, outcome: deriveOutcome(accuracy, tone, resolution), flags, note, createdAt: ago(30) } })
  }

  // --- sales CRM (fictional prospects, built through the real CRM functions) ----------
  for (const [email, name] of [['ops@northwindsupply.demo.gco', 'Northwind Supply Co'], ['contact@marlowefinch.demo.gco', 'Marlowe & Finch Goods']] as const) {
    await db.lead.updateMany({ where: { email }, data: { companyName: name } })
  }
  await db.user.updateMany({ where: { email: 'hunter1@demo.gco' }, data: { displayName: 'Casey Nguyen' } })
  const hunter = await db.user.findUniqueOrThrow({ where: { email: 'hunter1@demo.gco' } })
  const prospects: [string, string, string, string, string, number, string[]][] = [
    ['Brightwave Retail', 'Hannah Cole', 'hannah@brightwave.demo.gco', 'E-commerce', 'United Kingdom', 640000, ['CONTACTED']],
    ['Nordic Parcel Services', 'Elias Berg', 'elias@nordicparcel.demo.gco', 'Logistics', 'Sweden', 920000, ['CONTACTED', 'ENGAGED']],
    ['Alpine Travel Group', 'Marta Keller', 'marta@alpinetravel.demo.gco', 'Travel', 'Switzerland', 1450000, ['CONTACTED', 'ENGAGED', 'QUALIFIED']],
    ['Harbor & Pine Outfitters', 'Liam Fraser', 'liam@harborpine.demo.gco', 'Retail', 'Canada', 780000, ['CONTACTED', 'ENGAGED', 'QUALIFIED', 'MEETING_BOOKED']],
  ]
  for (const [company, contact, email, industry, country, value, stages] of prospects) {
    if (await db.lead.findUnique({ where: { email } })) continue
    const { lead } = await createLead({ companyName: company, contactName: contact, email, website: email.split('@')[1]!, industry, country, source: 'website_contact_form', estimatedValueEurCents: value, actorUserId: null })
    await claimLead(lead.id, hunter.id)
    for (const s of stages) await changeStage(lead.id, hunter.id, s)
  }
  console.log('Showcase data created: 3 operators (languages), 6 answered conversations (en/es/fr), 3 QA reviews, CRM prospects.')
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
