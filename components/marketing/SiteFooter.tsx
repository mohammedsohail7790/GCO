import Link from 'next/link'
import { Container } from './Container'

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink">
      <Container className="py-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10">
                <span className="font-display text-xs font-bold text-white">G</span>
              </div>
              <span className="font-display text-sm font-semibold tracking-tight text-white">GCO</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/50">
              Global Conversation Operations - managed human conversation operations, supported by AI-assisted
              workflows, for businesses that need reliable coverage at scale.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:flex sm:gap-16">
            <div>
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Company</p>
              <ul className="mt-4 space-y-3">
                <li><Link href="/services" className="text-sm text-white/60 transition-colors hover:text-white">Services</Link></li>
                <li><Link href="/how-it-works" className="text-sm text-white/60 transition-colors hover:text-white">How It Works</Link></li>
                <li><Link href="/about" className="text-sm text-white/60 transition-colors hover:text-white">About</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Get involved</p>
              <ul className="mt-4 space-y-3">
                <li><Link href="/careers" className="text-sm text-white/60 transition-colors hover:text-white">Careers</Link></li>
                <li><Link href="/contact" className="text-sm text-white/60 transition-colors hover:text-white">Contact</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Platform</p>
              <ul className="mt-4 space-y-3">
                <li><Link href="/login" className="text-sm text-white/60 transition-colors hover:text-white">Client Login</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-8 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Global Conversation Operations. All rights reserved.</span>
        </div>
      </Container>
    </footer>
  )
}
