export function Eyebrow({ children, tone = 'light' }: { children: React.ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <p
      className={`font-display text-xs font-semibold uppercase tracking-[0.14em] ${
        tone === 'dark' ? 'text-accent-100' : 'text-accent-600'
      }`}
    >
      {children}
    </p>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  tone = 'light',
  align = 'left',
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  tone?: 'light' | 'dark'
  align?: 'left' | 'center'
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      <h2
        className={`font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${
          tone === 'dark' ? 'text-paper' : 'text-graphite'
        }`}
      >
        {title}
      </h2>
      {description && (
        <p className={`mt-4 text-base leading-relaxed ${tone === 'dark' ? 'text-white/70' : 'text-graphite-secondary'}`}>
          {description}
        </p>
      )}
    </div>
  )
}
