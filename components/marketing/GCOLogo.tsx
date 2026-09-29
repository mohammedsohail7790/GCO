// GCO brand-mark system. Keeps the established "G" monogram concept from the
// Phase 13 redesign (per this phase's explicit instruction not to replace
// the design language) but formalizes it as a proper, reusable SVG asset
// with an intentional detail: a small accent-colored signal dot at the
// mark's corner. That dot is not decorative alone - it's the same visual
// device used for the "active conversation" pulses in OperationsFlow,
// giving the brand one small, consistent, recognizable motif instead of an
// arbitrary flourish. See docs/gco-brand-guidelines.md for usage rules.

/** The mark alone - a squircle containing "G" plus the signal dot. Used for
 *  the favicon, compact header lockup, and anywhere space is too tight for
 *  the wordmark. `tone="onDark"` renders a translucent surface for use
 *  directly on the ink-colored footer/hero; `tone="onLight"` (default)
 *  renders the solid ink square used everywhere else. */
export function GCOMark({ size = 32, tone = 'onLight' }: { size?: number; tone?: 'onLight' | 'onDark' }) {
  const bg = tone === 'onDark' ? 'rgba(255,255,255,0.1)' : '#0B0D12'
  const fg = tone === 'onDark' ? '#FFFFFF' : '#FAFAF8'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GCO">
      <rect width="32" height="32" rx="8" fill={bg} />
      <path
        d="M17.8 11.2c-.9-.6-2-1-3.3-1-3 0-5.2 2.3-5.2 5.4s2.2 5.4 5.3 5.4c1.7 0 3-.6 3.9-1.5v-3.3h-4.1v-1.9h6.2v6.1c-1.3 1.5-3.4 2.5-6 2.5-4.3 0-7.5-3.1-7.5-7.3s3.3-7.3 7.5-7.3c2 0 3.7.7 5 1.9l-1.8 1z"
        fill={fg}
      />
      <circle cx="23" cy="9" r="2" fill="#3D3FDB" />
    </svg>
  )
}

/** The "GCO" wordmark text, set in the display face. Kept as real text (not
 *  an image) for accessibility, crispness at any size, and so it inherits
 *  color correctly in both light and dark contexts via `currentColor`. */
export function GCOWordmark({ className = '' }: { className?: string }) {
  return <span className={`font-display font-semibold tracking-tight ${className}`}>GCO</span>
}

/** The full lockup: mark + wordmark, with an optional spelled-out tagline
 *  underneath for contexts where the acronym needs to be explained on
 *  first read (hero, OG image, footer) - see docs/gco-brand-guidelines.md's
 *  "logo usage" section for exactly which contexts need which lockup. */
export function GCOLockup({
  size = 'md',
  tone = 'onLight',
  withTagline = false,
}: {
  size?: 'sm' | 'md' | 'lg'
  tone?: 'onLight' | 'onDark'
  withTagline?: boolean
}) {
  const markSize = { sm: 28, md: 32, lg: 40 }[size]
  const wordmarkClass = { sm: 'text-sm', md: 'text-[15px]', lg: 'text-xl' }[size]
  const textColor = tone === 'onDark' ? 'text-white' : 'text-graphite'
  const taglineColor = tone === 'onDark' ? 'text-white/45' : 'text-graphite-muted'
  return (
    <div className="flex items-center gap-2.5">
      <GCOMark size={markSize} tone={tone} />
      <div>
        <GCOWordmark className={`${wordmarkClass} ${textColor}`} />
        {withTagline && (
          <p className={`-mt-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] ${taglineColor}`}>
            Global Conversation Operations
          </p>
        )}
      </div>
    </div>
  )
}
