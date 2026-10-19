// Turns each active client's current alerts into in-app notifications for the right people (see Admin alert routing).
// Run every 5 minutes, e.g. systemd timer / cron:  docker compose exec worker npx tsx prisma/ops/alerts-dispatch.ts
import { db } from '../../lib/db/client'
import { computeAlerts } from '../../lib/ops/alerts'
import { dispatchAlerts } from '../../lib/notify/service'

async function main() {
  const tenants = await db.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
  let sent = 0
  for (const t of tenants) sent += await dispatchAlerts(t.id, await computeAlerts(t.id))
  console.log(`alerts dispatched for ${tenants.length} clients, ${sent} notifications created`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
