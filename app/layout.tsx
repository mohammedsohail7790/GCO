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

const faviconSvg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230B0D12'/%3E%3Ctext x='16' y='22' font-family='system-ui,sans-serif' font-size='16' font-weight='700' fill='%23FAFAF8' text-anchor='middle'%3EGCO%3C/text%3E%3C/svg%3E"

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
