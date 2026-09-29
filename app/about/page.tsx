import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'About',
  description: 'GCO builds and manages human conversation operations teams - our approach to people, technology, and quality.',
  path: '/about',
})

const VALUES = [
  { title: 'Human + technology', body: 'Our operators do the work; our platform supports them - routing conversations, tracking response times, and giving supervisors the visibility they need to keep quality consistent as a team scales.' },
  { title: 'Quality and supervision', body: 'Every operator team is supervised on an ongoing basis. Conversations are reviewed against your standards, and feedback is fed back into training - not treated as a one-time setup step.' },
  { title: 'Scalability', body: 'Teams are built to flex with your actual volume. As your operation grows or your coverage needs change, staffing scales with it, rather than locking you into a fixed headcount.' },
  { title: 'Multilingual, global operations', body: 'We staff for the languages and time zones your users are actually in, so coverage matches where your conversations are actually happening.' },
]

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-paper-border bg-ink text-white">
          <Container className="py-20">
            <Eyebrow tone="dark">About GCO</Eyebrow>
            <h1 className="font-display mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              A managed human operations company for conversations.
            </h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-white/70">
              GCO builds and runs the human operations layer behind chat, conversation engagement, and moderation for
              businesses that need reliable coverage without building and managing an in-house team themselves. We
              handle staffing, training, supervision, and quality control so your conversations get consistent,
              on-brand attention.
            </p>
          </Container>
        </section>

        <section className="bg-paper py-20">
          <Container>
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-semibold text-graphite">Our operating philosophy</h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-graphite-secondary">
                We treat conversation operations as a discipline, not a commodity. Every operation starts from your
                actual requirements - tone, workflows, languages, coverage hours - rather than a generic playbook.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2">
              {VALUES.map((v) => (
                <div key={v.title} className="rounded-2xl border border-paper-border bg-paper-surface p-7">
                  <h3 className="font-display text-[16px] font-semibold text-graphite">{v.title}</h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-graphite-secondary">{v.body}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
