import Image from 'next/image'
import { Container } from './Container'
import { Eyebrow } from './SectionHeader'
import { Reveal } from './Reveal'
import { PLATFORM_SCREENSHOTS, PLATFORM_SCREENSHOT_NOTE } from '@/lib/content/platformAssets'

// One section per approved screenshot of the REAL platform (see lib/content/platformAssets.ts).
// Renders nothing if the registry is empty. Never renders mock-ups or illustrations as screenshots.
export function PlatformShowcase() {
  if (PLATFORM_SCREENSHOTS.length === 0) return null
  return (
    <>
      {PLATFORM_SCREENSHOTS.map((s, i) => {
        const flip = i % 2 === 1
        return (
          <section key={s.id} id={s.id} className={`py-16 sm:py-20 ${flip ? 'border-t border-paper-border bg-paper-surface' : 'bg-paper'}`}>
            <Container>
              <div className={`grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:gap-14 ${flip ? 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]' : 'lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'}`}>
                <Reveal className={flip ? 'lg:order-2' : ''}>
                  <Eyebrow>Inside the platform</Eyebrow>
                  <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-graphite sm:text-3xl">{s.title}</h2>
                  <p className="mt-4 text-[15px] leading-relaxed text-graphite-secondary">{s.body}</p>
                </Reveal>
                <figure className={`min-w-0 ${flip ? 'lg:order-1' : ''}`}>
                  {/* Below md the UI text would be unreadable if scaled to phone width, so the image keeps a legible
                      width inside a swipeable, keyboard-focusable frame (the page itself never overflows). */}
                  <div
                    role="region"
                    aria-label={`${s.title} screenshot (scrollable)`}
                    tabIndex={0}
                    className="overflow-x-auto rounded-2xl border border-paper-border bg-paper-surface shadow-elevated md:overflow-hidden"
                  >
                    <Image
                      src={s.src}
                      alt={s.alt}
                      width={s.width}
                      height={s.height}
                      sizes="(min-width: 1152px) 660px, (min-width: 1024px) 56vw, (min-width: 768px) calc(100vw - 48px), 760px"
                      quality={90}
                      preload={i === 0}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      className="h-auto w-full max-md:min-w-[760px]"
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-graphite-muted md:hidden">Swipe sideways to see the full screen.</p>
                  <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-4 text-[13px] text-graphite-muted">
                    <span>{s.caption}</span>
                    <a href={s.src} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-accent-600 transition-colors hover:text-accent-700">
                      View full size<span className="sr-only"> (opens the image in a new tab)</span>
                    </a>
                  </figcaption>
                </figure>
              </div>
            </Container>
          </section>
        )
      })}
      <p className="bg-paper-surface px-6 pb-10 pt-2 text-center text-[13px] text-graphite-muted">{PLATFORM_SCREENSHOT_NOTE}</p>
    </>
  )
}
