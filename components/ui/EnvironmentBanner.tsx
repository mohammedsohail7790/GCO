import { IS_STAGING_BUILD } from '@/lib/config/environment'

// Shown on every page of a STAGING build so nobody mistakes it for production. Renders nothing in production.
export function EnvironmentBanner() {
  if (!IS_STAGING_BUILD) return null
  return (
    <div role="status" className="sticky top-0 z-[60] bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-slate-900">
      STAGING: test environment with fictional data only. Not the live GCO system.
    </div>
  )
}
