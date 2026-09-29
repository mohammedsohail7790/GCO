// An abstract visualization of GCO's actual operating model - conversations
// flowing in, through a shared operations layer (AI-assisted routing +
// supervised human operators), out to a resolved outcome. Deliberately
// abstract (no specific channel logos, no fabricated metrics) so it never
// implies a provider integration or a number that isn't real. Pure SVG +
// CSS animation (dash-offset flow, staggered pulse) - no JS, no animation
// library; respects prefers-reduced-motion via the global rule in
// app/globals.css that flattens all animation/transition durations.
export function OperationsFlow() {
  const nodes = [
    { y: 40, label: 'Chat' },
    { y: 110, label: 'Support' },
    { y: 180, label: 'Community' },
  ]

  return (
    <div className="relative w-full max-w-md" aria-hidden="true">
      <svg viewBox="0 0 480 260" className="w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* inbound conversation nodes */}
        {nodes.map((n, i) => (
          <g key={n.label}>
            <rect x="8" y={n.y - 16} width="88" height="32" rx="8" className="fill-white/[0.06] stroke-white/15" strokeWidth="1" />
            <text x="52" y={n.y + 5} textAnchor="middle" className="fill-white/70 font-sans text-[11px] font-medium">
              {n.label}
            </text>
            {/* flow line from node into the operations layer */}
            <path
              d={`M 96 ${n.y} H 190`}
              stroke="url(#flowGradient)"
              strokeWidth="1.5"
              strokeDasharray="4 5"
              className="animate-[dash_3s_linear_infinite]"
              style={{ animationDelay: `${i * 0.4}s` }}
            />
            <circle cx="96" cy={n.y} r="2.5" className="fill-accent-400">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="2.4s" repeatCount="indefinite" begin={`${i * 0.4}s`} />
            </circle>
          </g>
        ))}

        {/* the GCO operations layer - central node */}
        <rect x="190" y="70" width="120" height="120" rx="14" className="fill-accent-500/15 stroke-accent-400/50" strokeWidth="1.25" />
        <text x="250" y="122" textAnchor="middle" className="fill-white font-display text-[13px] font-semibold">
          GCO
        </text>
        <text x="250" y="140" textAnchor="middle" className="fill-white/60 font-sans text-[9px] font-medium uppercase tracking-wider">
          Operations Layer
        </text>
        {/* AI + human indicators inside the layer */}
        <circle cx="212" cy="90" r="3" className="fill-accent-300">
          <animate attributeName="opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <text x="222" y="93" className="fill-white/50 font-sans text-[8px]">AI-assisted</text>
        <circle cx="212" cy="170" r="3" className="fill-emerald-300">
          <animate attributeName="opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" begin="0.6s" />
        </circle>
        <text x="222" y="173" className="fill-white/50 font-sans text-[8px]">Human operators</text>

        {/* outbound to resolution */}
        <path
          d="M 310 130 H 404"
          stroke="url(#flowGradient)"
          strokeWidth="1.5"
          strokeDasharray="4 5"
          className="animate-[dash_3s_linear_infinite]"
        />
        <circle cx="310" cy="130" r="2.5" className="fill-accent-400">
          <animate attributeName="opacity" values="0.3;1;0.3" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <rect x="404" y="106" width="68" height="48" rx="8" className="fill-white/[0.06] stroke-white/15" strokeWidth="1" />
        <text x="438" y="126" textAnchor="middle" className="fill-white/70 font-sans text-[10px] font-medium">
          Resolved
        </text>
        <text x="438" y="140" textAnchor="middle" className="fill-white/40 font-sans text-[9px]">
          & reported
        </text>

        <defs>
          <linearGradient id="flowGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5B62E8" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#5B62E8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#5B62E8" stopOpacity="0.1" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
