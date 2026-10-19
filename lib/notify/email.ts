import nodemailer, { type Transporter } from 'nodemailer'
import { logger } from '@/lib/observability/logger'
import { SITE_URL } from '@/lib/config/site'

// Optional email channel for notifications. OFF unless SMTP_URL is set (e.g. smtps://user:pass@smtp.example.com:465) - the platform works
// fully without it. Messages carry only a short title and a link into the app: never conversation content, names of customers or amounts.
// Failures are logged WITHOUT the address and never raise: a mail outage must not break the action that triggered the notification.

export const emailConfigured = () => !!process.env.SMTP_URL
const FROM = () => process.env.SMTP_FROM || 'GCO <no-reply@globalconversationoperations.com>'

let cached: { url: string; transport: Transporter } | null = null
function transport() {
  const url = process.env.SMTP_URL!
  if (!cached || cached.url !== url) cached = { url, transport: nodemailer.createTransport({ url, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000 }) }
  return cached.transport
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!emailConfigured()) return false
  try {
    await transport().sendMail({ from: FROM(), to, subject: subject.slice(0, 200), text: `${text}\n\nOpen GCO: ${SITE_URL}/home\n\nYou receive this because of your role at GCO. Sign in to change what you are notified about.` })
    return true
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message.split('\n')[0]!.replace(/[\w.+-]+@[\w.-]+\.[a-z]+/gi, '[email]').slice(0, 160) : 'unknown' }, 'notification email failed')
    return false
  }
}
