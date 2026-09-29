import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { ContactForm } from '@/components/marketing/ContactForm'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'Contact',
  description: 'Tell GCO about your conversation operations needs - chat operations, moderation, support, or multilingual coverage.',
  path: '/contact',
})

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-paper-border bg-ink text-white">
          <Container className="py-20">
            <Eyebrow tone="dark">Contact</Eyebrow>
            <h1 className="font-display mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Tell us about your operation.
            </h1>
            <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-white/65">
              Tell us what you&apos;re trying to operate - the channels, the volume, the coverage you need - and
              we&apos;ll get back to you about how GCO can run it. Expect a reply within one business day.
            </p>
          </Container>
        </section>

        <section className="bg-paper py-20">
          <Container className="max-w-2xl">
            <div className="rounded-2xl border border-paper-border bg-paper-surface p-8 shadow-card sm:p-10">
              <ContactForm />
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
