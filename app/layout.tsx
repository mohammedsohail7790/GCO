import type { Metadata } from 'next'
import './globals.css'

const faviconSvg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%233563e9'/%3E%3Ctext x='16' y='22' font-family='system-ui,sans-serif' font-size='17' font-weight='700' fill='white' text-anchor='middle'%3EG%3C/text%3E%3C/svg%3E"

export const metadata: Metadata = {
  title: 'GCO - Conversation Operations',
  description: 'Multi-tenant AI-powered conversation operations platform',
  icons: { icon: faviconSvg },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
