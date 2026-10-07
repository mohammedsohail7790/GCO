import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { ok, handleRouteError } from '@/lib/api/response'
import { getAdapter, listAdapterKeys, isProductionAdapter, supportsVerification } from '@/lib/integrations/registry'

/** Adapters GCO can create integrations for. Capability comes from the registry only - it cannot be declared by a caller. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'INTEGRATION_MANAGE')
    return ok(
      listAdapterKeys().map((key) => ({
        key,
        productionCapable: getAdapter(key).productionCapable === true,
        usableForGoLive: isProductionAdapter(key),
        supportsVerification: supportsVerification(key),
        requiresCallbackUrl: supportsVerification(key),
      })),
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
