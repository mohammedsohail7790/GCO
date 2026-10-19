import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { ok, handleRouteError } from '@/lib/api/response'
import { executiveSearch } from '@/lib/executive/overview'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'VIEW_REVENUE')
    return ok(await executiveSearch(new URL(req.url).searchParams.get('q') ?? ''))
  } catch (err) {
    return handleRouteError(err)
  }
}
