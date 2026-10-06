import Link from 'next/link'
import type { Block } from '@/lib/content/resources'

// Renders article blocks with comfortable reading typography. Inline links use [label](/path) and are internal only.
function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  const re = /\[([^\]]+)\]\((\/[^)\s]*)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <Link key={i++} href={m[2]!} className="font-medium text-accent-600 underline decoration-accent-600/30 underline-offset-[3px] transition-colors hover:text-accent-700 hover:decoration-accent-700">
        {m[1]}
      </Link>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export function ArticleBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="max-w-[68ch]">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h2':
            return (
              <h2 key={i} className="font-display mt-12 scroll-mt-24 text-[1.4rem] font-semibold leading-snug tracking-tight text-graphite first:mt-0 sm:text-[1.6rem]">
                {b.text}
              </h2>
            )
          case 'p':
            return (
              <p key={i} className="mt-5 text-[1.0625rem] leading-[1.75] text-graphite-secondary">
                <RichText text={b.text} />
              </p>
            )
          case 'ul':
            return (
              <ul key={i} className="mt-5 space-y-3">
                {b.items.map((it) => (
                  <li key={it} className="flex gap-3 text-[1.0625rem] leading-[1.7] text-graphite-secondary">
                    <span className="mt-[0.7em] h-1.5 w-1.5 flex-none rounded-full bg-accent-500" aria-hidden="true" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            )
          case 'callout':
            return (
              <aside key={i} className="mt-10 rounded-2xl border border-accent-100 bg-accent-50 p-6 text-[1.0625rem] leading-[1.7] text-graphite">
                <RichText text={b.text} />
              </aside>
            )
        }
      })}
    </div>
  )
}
