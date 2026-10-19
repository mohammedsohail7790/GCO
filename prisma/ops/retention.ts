// Applies every client's retention window (removes personal message content past the window; keeps billing/earnings records).
// Run daily, e.g. 03:30 UTC:  docker compose exec worker npx tsx prisma/ops/retention.ts            (add --dry-run to only count)
import { runRetention } from '../../lib/privacy/service'

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const res = await runRetention({ dryRun })
  console.log(JSON.stringify({ dryRun, clients: res.length, detail: res }, null, 2))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
