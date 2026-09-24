import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'About',
  description: 'GCO builds and manages human conversation operations teams - our approach to people, technology, and quality.',
  path: '/about',
})

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-slate-100 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">About GCO</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              A managed human operations company for conversations
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-3xl space-y-10 px-6 py-16">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">What we do</h2>
            <p className="mt-3 text-slate-600">
              GCO builds and runs the human operations layer behind chat, conversation engagement, and moderation for
              businesses that need reliable coverage without building and managing an in-house team themselves. We
              handle staffing, training, supervision, and quality control so your conversations get consistent,
              on-brand attention.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900">Our operating philosophy</h2>
            <p className="mt-3 text-slate-600">
              We treat conversation operations as a discipline, not a commodity. Every operation starts from your
              actual requirements - tone, workflows, languages, coverage hours - rather than a generic playbook.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900">Human + technology</h2>
            <p className="mt-3 text-slate-600">
              Our operators do the work; our platform supports them - routing conversations, tracking response times,
              and giving supervisors the visibility they need to keep quality consistent as a team scales.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900">Quality and supervision</h2>
            <p className="mt-3 text-slate-600">
              Every operator team is supervised on an ongoing basis. Conversations are reviewed against your
              standards, and feedback is fed back into training - not treated as a one-time setup step.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900">Scalability</h2>
            <p className="mt-3 text-slate-600">
              Teams are built to flex with your actual volume. As your operation grows or your coverage needs change,
              staffing scales with it, rather than locking you into a fixed headcount.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900">Multilingual, global operations</h2>
            <p className="mt-3 text-slate-600">
              We staff for the languages and time zones your users are actually in, so coverage matches where your
              conversations are actually happening.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
