import type { Metadata } from 'next'
import { Space_Grotesk, Inter } from 'next/font/google'
import './globals.css'
import { SITE_URL, SITE_NAME, SITE_TAGLINE } from '@/lib/config/site'

// Self-hosted at build time by next/font (no runtime request to
// fonts.googleapis.com, no extra network round-trip) - a font pairing
// deliberate enough to avoid the "every SaaS site uses Inter for
// everything" look, without adding a real performance cost. Space
// Grotesk's slightly technical, geometric letterforms suit an operations/
// infrastructure brand for display type; Inter remains the reliable
// workhorse for body copy and UI.
const displayFont = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const bodyFont = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })

// Matches components/marketing/GCOLogo.tsx's <GCOMark> exactly (same "G"
// path + accent signal dot) so the browser tab icon is the same mark used
// everywhere else, not a separate ad-hoc glyph.
const faviconSvg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230B0D12'/%3E%3Cpath d='M17.8 11.2c-.9-.6-2-1-3.3-1-3 0-5.2 2.3-5.2 5.4s2.2 5.4 5.3 5.4c1.7 0 3-.6 3.9-1.5v-3.3h-4.1v-1.9h6.2v6.1c-1.3 1.5-3.4 2.5-6 2.5-4.3 0-7.5-3.1-7.5-7.3s3.3-7.3 7.5-7.3c2 0 3.7.7 5 1.9l-1.8 1z' fill='%23FAFAF8'/%3E%3Ccircle cx='23' cy='9' r='2' fill='%233D3FDB'/%3E%3C/svg%3E"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} - ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: SITE_TAGLINE,
  icons: { icon: faviconSvg },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  )
}
