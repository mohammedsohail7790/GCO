'use client'

import { EarningsConsole } from '@/components/admin/EarningsConsole'

export default function AdminEarningsPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500"><span className="text-xs font-bold text-white">G</span></div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Operator earnings and payments</h1>
        <a href="/admin" className="ml-auto text-sm font-medium text-brand-600 hover:underline">Back to dashboard</a>
      </div>
      <EarningsConsole canManage />
    </div>
  )
}
