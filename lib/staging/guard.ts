import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { stagingToolsEnabled } from '@/lib/config/environment'
import { fail } from '@/lib/api/response'

/** Staging tools do not exist outside staging: anything else gets the same 404 as an unknown route, before any auth or data access. */
export async function stagingSession(req: NextRequest) {
  if (!stagingToolsEnabled()) return { notFound: fail('Not found', 404) } as const
  return { session: await requirePermission(req, 'STAGING_TOOLS') } as const
}
