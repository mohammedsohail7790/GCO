import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
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
        <section className="border-b border-slate-100 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Contact</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Tell us about your operation
            </h1>
            <p className="mt-4 max-w-2xl text-slate-600">
              Share a few details and we&apos;ll get back to you about how GCO can support your conversations.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-6 py-16">
          <div className="relative rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
            <ContactForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
