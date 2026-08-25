'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Tenant {
  id: string
  name: string
  slug: string
  status: string
}

interface SystemHealth {
  database: { healthy: boolean }
  redis: { healthy: boolean }
  queues: Record<string, { waiting: number; active: number; delayed: number; failed: number; completed: number }>
}

export default function AdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [health, setHealth] = useState<SystemHealth | null>(null)

  useEffect(() => {
    const load = () => {
      apiFetch<Tenant[]>('/admin/tenants').then(setTenants).catch(() => {})
      apiFetch<SystemHealth>('/admin/system-health').then(setHealth).catch(() => {})
    }
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen p-6">
      <h1 className="mb-6 text-xl font-semibold text-slate-900">CEO / Admin</h1>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-900">System health</h2>
          {health ? (
            <div className="space-y-1 text-sm">
              <p>Database: <span className={health.database.healthy ? 'text-emerald-600' : 'text-red-600'}>{health.database.healthy ? 'healthy' : 'down'}</span></p>
              <p>Redis: <span className={health.redis.healthy ? 'text-emerald-600' : 'text-red-600'}>{health.redis.healthy ? 'healthy' : 'down'}</span></p>
              <p>Dead-letter jobs: {health.queues.deadLetter?.waiting ?? 0}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900">Tenants</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2">{t.name}</td>
                <td className="px-4 py-2 text-slate-500">{t.slug}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{t.status}</span>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">No tenants yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
