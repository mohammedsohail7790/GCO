export function ServiceCard({
  index,
  title,
  body,
  status,
}: {
  index?: number
  title: string
  body: string
  status?: 'implemented' | 'integration-ready'
}) {
  return (
    <div className="group relative rounded-2xl border border-paper-border bg-paper-surface p-7 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated">
      {index !== undefined && (
        <span className="font-display text-xs font-semibold tabular-nums text-graphite-muted">
          {String(index + 1).padStart(2, '0')}
        </span>
      )}
      <h3 className="font-display mt-3 text-[17px] font-semibold text-graphite">{title}</h3>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-graphite-secondary">{body}</p>
      {status === 'integration-ready' && (
        <span className="mt-4 inline-block rounded-full bg-accent-50 px-2.5 py-1 text-[11px] font-medium text-accent-700">
          Integration-ready
        </span>
      )}
    </div>
  )
}
