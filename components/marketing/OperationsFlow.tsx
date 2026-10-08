// An illustration of GCO's operating model: conversations come in, pass through
// a supervised operations layer (AI-assisted drafting, a human operator who
// reviews and sends every reply, a team lead for escalations), and end as a
// resolved, reported outcome. Deliberately illustrative - no channel logos, no
// metrics, no fake conversation data - so it never implies an integration or a
// number that is not real. Plain HTML/CSS (legible at every width); the only
// motion is a gentle status pulse, which the global prefers-reduced-motion rule
// in app/globals.css already flattens.
const INBOUND = ['Chat', 'Support', 'Community']

const LAYER = [
  { step: '1', title: 'AI-assisted triage', body: 'Routes the conversation and suggests a draft.', tone: 'bg-accent-400' },
  { step: '2', title: 'Human operator', body: 'Reviews, edits and sends every reply.', tone: 'bg-emerald-400' },
  { step: '3', title: 'Team lead supervision', body: 'Owns escalations and quality review.', tone: 'bg-amber-300' },
]

export function OperationsFlow() {
  return (
    <figure className="w-full max-w-[34rem]" aria-label="Illustration of the GCO operating model">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/5 backdrop-blur sm:p-6">
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
          <span>Operating model</span>
          <span className="flex items-center gap-1.5 normal-case tracking-normal">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
            Illustrative
          </span>
        </div>

        {/* 1. Inbound */}
        <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">Conversations in</p>
        <ul className="mt-2 grid grid-cols-3 gap-2">
          {INBOUND.map((c) => (
            <li key={c} className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-center text-[13px] font-medium text-white/85">
              {c}
            </li>
          ))}
        </ul>

        <div className="mx-auto h-5 w-px bg-gradient-to-b from-white/20 to-accent-400/60" aria-hidden="true" />

        {/* 2. Operations layer */}
        <div className="rounded-xl border border-accent-400/30 bg-accent-500/[0.12] p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-display text-[15px] font-semibold text-white">GCO operations layer</p>
            <p className="text-[12px] text-white/50">Supervised workflow</p>
          </div>
          <ol className="mt-3 space-y-2">
            {LAYER.map((l) => (
              <li key={l.step} className="flex items-start gap-3 rounded-lg bg-ink/50 px-3 py-2.5">
                <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${l.tone}`} aria-hidden="true" />
                <div>
                  <p className="text-[13.5px] font-semibold text-white">{l.title}</p>
                  <p className="text-[12.5px] leading-snug text-white/60">{l.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mx-auto h-5 w-px bg-gradient-to-b from-accent-400/60 to-white/20" aria-hidden="true" />

        {/* 3. Outcome */}
        <div className="flex items-center justify-between rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-3">
          <p className="text-[13.5px] font-semibold text-white">Resolved and reported</p>
          <p className="text-[12.5px] text-white/60">Visible to your team</p>
        </div>
      </div>
    </figure>
  )
}
