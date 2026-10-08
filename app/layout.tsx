import type { Metadata } from 'next'
import { Inter_Tight, Inter } from 'next/font/google'
import './globals.css'
import { SITE_URL, SITE_NAME, SITE_TAGLINE } from '@/lib/config/site'
import { AnalyticsRoot } from '@/components/analytics/AnalyticsRoot'

// Self-hosted at build time by next/font (no runtime request to
// fonts.googleapis.com, no extra network round-trip) - a font pairing
// deliberate enough to avoid the "every SaaS site uses Inter for
// everything" look, without adding a real performance cost. Space
// Grotesk's slightly technical, geometric letterforms suit an operations/
// infrastructure brand for display type; Inter remains the reliable
// workhorse for body copy and UI.
const displayFont = Inter_Tight({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const bodyFont = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} - ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: SITE_TAGLINE,
  // Icons come from the file conventions: app/icon.svg, app/favicon.ico, app/apple-icon.png.
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        {children}
        <AnalyticsRoot />
      </body>
    </html>
  )
}
