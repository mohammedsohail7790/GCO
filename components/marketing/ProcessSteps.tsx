export function ProcessSteps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((step, i) => (
        <li key={step.title} className="relative flex gap-6 pb-10 last:pb-0">
          {i < steps.length - 1 && (
            <span className="absolute left-[19px] top-11 h-[calc(100%-1.5rem)] w-px bg-paper-border" aria-hidden="true" />
          )}
          <div className="relative z-10 flex h-10 w-10 flex-none items-center justify-center rounded-full border border-paper-border bg-paper-surface">
            <span className="font-display text-[13px] font-semibold tabular-nums text-accent-600">
              {String(i + 1).padStart(2, '0')}
            </span>
          </div>
          <div className="pt-1.5">
            <h3 className="font-display text-[15.5px] font-semibold text-graphite">{step.title}</h3>
            <p className="mt-1.5 max-w-lg text-[14.5px] leading-relaxed text-graphite-secondary">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
