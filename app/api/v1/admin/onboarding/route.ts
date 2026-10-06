import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'

// Onboarding console list. Safe fields only - never the invitation token hash, secrets or passwords.
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'ONBOARDING_VIEW')
    const rows = await db.clientOnboarding.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, status: true, contactEmail: true, lastError: true, createdAt: true, liveAt: true, tenant: { select: { id: true, name: true, slug: true } } },
    })
    return ok(rows)
  } catch (err) {
    return handleRouteError(err)
  }
}
