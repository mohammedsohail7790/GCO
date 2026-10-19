// Generates (or refreshes the drafts of) last week's report for every operator. Safe to run repeatedly.
// Run weekly, e.g. Monday 06:00 UTC:  docker compose exec worker npx tsx prisma/ops/weekly-reports.ts
import { db } from '../../lib/db/client'
import { ensureWeeklyReport, lastCompletedWeek } from '../../lib/reports/weekly'

async function main() {
  const week = lastCompletedWeek()
  const ops = await db.operator.findMany({ select: { id: true } })
  let done = 0
  for (const o of ops) {
    await ensureWeeklyReport(o.id, week)
    done++
  }
  console.log(`weekly reports ready for ${done} operators, week starting ${week.toISOString().slice(0, 10)}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
