import Image from 'next/image'
import { Container } from './Container'
import { Eyebrow } from './SectionHeader'
import { Reveal } from './Reveal'
import { Bullets } from './Blocks'
import { INSIDE_SECTIONS, INSIDE_VIDEO } from '@/lib/content/insideGco'

// The "Inside GCO" tour: one section per area of the real platform, each with a captured screenshot of the real UI.
// Mobile: the screenshot keeps a legible width inside a swipeable, keyboard-focusable frame (the page never overflows).
export function InsideGcoVideo() {
  return (
    <section className="border-b border-paper-border bg-paper py-14 sm:py-16" aria-labelledby="inside-video">
      <Container>
        <Reveal>
          <Eyebrow>Watch the workflow</Eyebrow>
          <h2 id="inside-video" className="font-display mt-3 text-2xl font-semibold tracking-tight text-graphite sm:text-3xl">{INSIDE_VIDEO.title}</h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-graphite-secondary">{INSIDE_VIDEO.summary}</p>
        </Reveal>
        <div className="mt-8 overflow-hidden rounded-2xl border border-paper-border bg-paper-surface shadow-elevated">
          <video controls playsInline preload="none" poster={INSIDE_VIDEO.poster} className="aspect-video w-full bg-ink" aria-label={INSIDE_VIDEO.title}>
            <source src={INSIDE_VIDEO.src} type="video/mp4" />
            <track kind="captions" src={INSIDE_VIDEO.captions} srcLang="en" label="English" default />
            Your browser cannot play this video.
          </video>
        </div>
        <p className="mt-3 text-[13px] text-graphite-muted">Captions are on by default. No sound track: the captions describe each step.</p>
      </Container>
    </section>
  )
}

export function InsideGcoSections() {
  return (
    <>
      {INSIDE_SECTIONS.map((s, i) => {
        const flip = i % 2 === 1
        return (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className={`py-16 sm:py-20 ${flip ? 'border-t border-paper-border bg-paper-surface' : 'bg-paper'}`}>
            <Container>
              <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
                <Reveal className={flip ? 'lg:order-2' : ''}>
                  <Eyebrow>{s.eyebrow}</Eyebrow>
                  <h2 id={`${s.id}-h`} className="font-display mt-3 text-2xl font-semibold tracking-tight text-graphite sm:text-3xl">{s.title}</h2>
                  <p className="mt-4 text-[15px] leading-relaxed text-graphite-secondary">{s.lead}</p>
                  <div className="mt-5"><Bullets items={s.points} /></div>
                </Reveal>
                <figure className={`min-w-0 ${flip ? 'lg:order-1' : ''}`}>
                  <div role="region" aria-label={`${s.title} screenshot (scrollable)`} tabIndex={0} className="overflow-x-auto rounded-2xl border border-paper-border bg-paper-surface shadow-elevated md:overflow-hidden">
                    <Image
                      src={s.image.src}
                      alt={s.image.alt}
                      width={s.image.width}
                      height={s.image.height}
                      sizes="(min-width: 1152px) 660px, (min-width: 1024px) 56vw, (min-width: 768px) calc(100vw - 48px), 760px"
                      quality={90}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      className="h-auto w-full max-md:min-w-[760px]"
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-graphite-muted md:hidden">Swipe sideways to see the full screen.</p>
                  <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-4 text-[13px] text-graphite-muted">
                    <span>{s.image.caption}</span>
                    <a href={s.image.src} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-accent-600 transition-colors hover:text-accent-700">
                      View full size<span className="sr-only"> (opens the image in a new tab)</span>
                    </a>
                  </figcaption>
                </figure>
              </div>
            </Container>
          </section>
        )
      })}
    </>
  )
}
