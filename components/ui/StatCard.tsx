export function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: 'good' | 'warn'
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums ${
          accent === 'warn' ? 'text-amber-600' : accent === 'good' ? 'text-emerald-600' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
