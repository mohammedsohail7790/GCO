import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
                <span className="text-xs font-bold text-white">G</span>
              </div>
              <span className="text-sm font-semibold tracking-tight text-slate-900">GCO</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-500">
              Managed human conversation operations - chat, engagement, and moderation teams for businesses that need
              reliable coverage without building an in-house team.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:flex sm:gap-12">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Company</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/services" className="text-slate-600 hover:text-slate-900">Services</Link></li>
                <li><Link href="/how-it-works" className="text-slate-600 hover:text-slate-900">How It Works</Link></li>
                <li><Link href="/about" className="text-slate-600 hover:text-slate-900">About</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Get involved</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/careers" className="text-slate-600 hover:text-slate-900">Careers</Link></li>
                <li><Link href="/contact" className="text-slate-600 hover:text-slate-900">Contact</Link></li>
                <li><Link href="/login" className="text-slate-600 hover:text-slate-900">Sign in</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-100 pt-6 text-xs text-slate-400">
          © {new Date().getFullYear()} GCO. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
