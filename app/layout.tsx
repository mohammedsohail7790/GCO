import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GCO - Conversation Operations',
  description: 'Multi-tenant AI-powered conversation operations platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
