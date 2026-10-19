'use client'

import { EarningsConsole } from '@/components/admin/EarningsConsole'

// Read-only: managers see the earnings of operators in their own client only. Rates, adjustments and payments are CEO-only.
export default function ManagerEarningsPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500"><span className="text-xs font-bold text-white">G</span></div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Team earnings</h1>
        <a href="/manager" className="ml-auto text-sm font-medium text-brand-600 hover:underline">Back to dashboard</a>
      </div>
      <EarningsConsole canManage={false} />
    </div>
  )
}
