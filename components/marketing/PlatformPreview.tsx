import Image from 'next/image'
import { Container } from './Container'
import { SectionHeader } from './SectionHeader'
import { PLATFORM_SCREENSHOTS } from '@/lib/content/platformAssets'

// Shows approved, sanitized screenshots of the REAL platform - and nothing at all until some exist.
// We never render mock-ups or illustrations of the product as if they were real screenshots.
export function PlatformPreview() {
  if (PLATFORM_SCREENSHOTS.length === 0) return null
  return (
    <section className="bg-paper py-16 sm:py-20">
      <Container>
        <SectionHeader eyebrow="Inside the platform" title="The operations platform behind the team" description="Sanitized screens from the GCO platform." />
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {PLATFORM_SCREENSHOTS.map((s, i) => (
            <figure key={s.src} className="overflow-hidden rounded-2xl border border-paper-border bg-paper-surface shadow-card">
              <Image src={s.src} alt={s.alt} width={s.width} height={s.height} sizes="(min-width: 1024px) 560px, 100vw" loading={i === 0 ? 'eager' : 'lazy'} className="h-auto w-full" />
              <figcaption className="px-5 py-3 text-[13px] text-graphite-secondary">{s.caption}</figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  )
}
