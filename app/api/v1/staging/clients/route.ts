import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'
import { stagingSession } from '@/lib/staging/guard'
import { STAGING_CLIENTS } from '@/lib/staging/clients'

export const dynamic = 'force-dynamic'

// The fictional staging clients that have an ACTIVE simulated platform, with sample customer messages for the simulator.
export async function GET(req: NextRequest) {
  try {
    const g = await stagingSession(req)
    if ('notFound' in g) return g.notFound
    const tenants = await db.tenant.findMany({
      where: { slug: { in: STAGING_CLIENTS.map((c) => c.slug) } },
      select: { id: true, name: true, slug: true, integrations: { where: { adapterKey: 'dev-mock', status: 'ACTIVE' }, select: { id: true }, take: 1 } },
    })
    return ok(tenants.map((t) => {
      const c = STAGING_CLIENTS.find((x) => x.slug === t.slug)!
      return { tenantId: t.id, name: t.name, service: c.service, ready: t.integrations.length > 0, samples: c.samples }
    }))
  } catch (err) {
    return handleRouteError(err)
  }
}
