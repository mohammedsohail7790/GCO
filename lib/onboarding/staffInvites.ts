import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { SITE_URL } from '@/lib/config/site'
import { DEMO_TENANT } from '@/lib/auth/staffAccounts'
import { validateStaffPassword } from '@/lib/auth/password'
import { normalizeLanguage, normalizeLanguageList } from '@/lib/languages'
import { INVITE_TTL_MS, OnboardingError, sha256 } from './service'

// OPERATOR and MANAGER accounts for a client are created INACTIVE with an unusable password and a one-time setup link.
// The invited person chooses their own password (staff password policy); GCO staff never see or choose it. Only a SHA-256 of
// the token is stored, it is single-use, expires in 7 days, and every failure to redeem it is the same generic 400.

export const INVITABLE_ROLES = ['OPERATOR', 'MANAGER'] as const
type InvitableRole = (typeof INVITABLE_ROLES)[number]
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVALID = 'This invitation link is invalid or has expired'

const newToken = () => crypto.randomBytes(32).toString('hex')
// Fragment, not query: browsers do not send it to servers, proxies, logs or Referer headers.
const setupUrl = (token: string) => `${SITE_URL}/accept-invitation#token=${token}`

export async function inviteStaff(p: { tenantId: string; email: string; displayName: string; role: string; languages?: string[]; actorUserId: string }) {
  if (!(INVITABLE_ROLES as readonly string[]).includes(p.role)) throw new OnboardingError('Role must be OPERATOR or MANAGER', 400)
  const role = p.role as InvitableRole
  const email = p.email.trim().toLowerCase()
  if (!EMAIL.test(email) || email.length > 200) throw new OnboardingError('That does not look like a valid email address', 400)
  if (email.endsWith('@demo.gco')) throw new OnboardingError('Demo accounts cannot be invited', 400)
  const displayName = p.displayName.trim().slice(0, 120)
  if (!displayName) throw new OnboardingError('A name is required', 400)
  const tenant = await db.tenant.findUnique({ where: { id: p.tenantId }, select: { id: true, slug: true, status: true, defaultOperatorCapacity: true } })
  if (!tenant) throw new OnboardingError('Client not found', 404)
  if (tenant.id === DEMO_TENANT.id || tenant.slug === DEMO_TENANT.slug) throw new OnboardingError('That is the demo client; real staff cannot be invited to it', 400)
  if (tenant.status !== 'ACTIVE') throw new OnboardingError(`That client is ${tenant.status}; staff can only be invited to an ACTIVE client`, 409)
  let languages: string[] = []
  if (p.languages?.length) {
    if (role !== 'OPERATOR') throw new OnboardingError('Languages apply to operators only', 400)
    if (p.languages.some((l) => !normalizeLanguage(l))) throw new OnboardingError('Use two-letter language codes such as en, es, fr', 400)
    languages = normalizeLanguageList(p.languages)
  }
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) throw new OnboardingError('A user with that email already exists', 409)

  const token = newToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12) // nobody knows this password
  const out = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, displayName, role, tenantId: tenant.id, passwordHash: unusable, isActive: false } })
    if (role === 'OPERATOR') await tx.operator.create({ data: { userId: user.id, tenantId: tenant.id, status: 'OFFLINE', capacity: tenant.defaultOperatorCapacity, languages } })
    const inv = await tx.staffInvitation.create({ data: { tenantId: tenant.id, userId: user.id, role, tokenHash: sha256(token), expiresAt, createdByUserId: p.actorUserId } })
    return { user, inv }
  })
  await writeAuditLog({ tenantId: tenant.id, actorUserId: p.actorUserId, action: 'staff.invited', resource: 'user', resourceId: out.user.id, metadata: { role, expiresAt: expiresAt.toISOString(), ...(languages.length ? { languages } : {}) } }) // never the token
  return { invitationId: out.inv.id, userId: out.user.id, setupUrl: setupUrl(token), expiresAt }
}

async function pending(invitationId: string, tenantId?: string) {
  const inv = await db.staffInvitation.findUnique({ where: { id: invitationId } })
  if (!inv || (tenantId && inv.tenantId !== tenantId)) throw new OnboardingError('Invitation not found', 404)
  if (inv.acceptedAt) throw new OnboardingError('This person has already set up their login', 409, 'ALREADY_ACCEPTED')
  if (inv.cancelledAt) throw new OnboardingError('This invitation was cancelled', 409, 'CANCELLED')
  return inv
}

/** New one-time link; the previous link stops working immediately. */
export async function reissueStaffInvite(invitationId: string, actorUserId: string) {
  const inv = await pending(invitationId)
  const token = newToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await db.staffInvitation.update({ where: { id: inv.id }, data: { tokenHash: sha256(token), issuedAt: new Date(), expiresAt } })
  await writeAuditLog({ tenantId: inv.tenantId, actorUserId, action: 'staff.invitation_reissued', resource: 'user', resourceId: inv.userId, metadata: { expiresAt: expiresAt.toISOString() } })
  return { setupUrl: setupUrl(token), expiresAt }
}

/** Withdraws an unused invitation. The inactive user stays (nothing is deleted) and can never sign in. */
export async function cancelStaffInvite(invitationId: string, actorUserId: string) {
  const inv = await pending(invitationId)
  await db.staffInvitation.update({ where: { id: inv.id }, data: { cancelledAt: new Date(), tokenHash: null } })
  await writeAuditLog({ tenantId: inv.tenantId, actorUserId, action: 'staff.invitation_cancelled', resource: 'user', resourceId: inv.userId })
  return { cancelled: true }
}

/** Public. Returns null if the token belongs to no staff invitation (so the caller can try the client flow). */
export async function acceptStaffInvitation(token: string, password: string): Promise<{ tenantId: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const hash = sha256(token)
  const inv = await db.staffInvitation.findUnique({ where: { tokenHash: hash } })
  if (!inv) return null
  if (inv.acceptedAt || inv.cancelledAt || inv.expiresAt <= new Date()) throw new OnboardingError(INVALID, 400)
  const user = await db.user.findUniqueOrThrow({ where: { id: inv.userId }, select: { email: true } })
  const problem = validateStaffPassword(password, user.email) // checked BEFORE the token is consumed, so a weak password can be retried
  if (problem) throw new OnboardingError(problem, 400)
  const passwordHash = await bcrypt.hash(password, 12)
  await db.$transaction(async (tx) => {
    // Atomic single-use claim: only one request can ever flip an unexpired, unused token.
    const claimed = await tx.staffInvitation.updateMany({ where: { id: inv.id, tokenHash: hash, acceptedAt: null, cancelledAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date(), tokenHash: null } })
    if (claimed.count === 0) throw new OnboardingError(INVALID, 400)
    await tx.user.update({ where: { id: inv.userId }, data: { passwordHash, isActive: true } })
  })
  await writeAuditLog({ tenantId: inv.tenantId, actorUserId: inv.userId, action: 'staff.invitation_accepted', resource: 'user', resourceId: inv.userId })
  return { tenantId: inv.tenantId }
}

/** The client's operators and managers with their invitation state. */
export async function listStaff(tenantId: string) {
  const users = await db.user.findMany({ where: { tenantId, role: { in: [...INVITABLE_ROLES] } }, orderBy: { createdAt: 'asc' }, select: { id: true, email: true, displayName: true, role: true, isActive: true, operator: { select: { status: true, capacity: true, languages: true } } } })
  const invs = await db.staffInvitation.findMany({ where: { userId: { in: users.map((u) => u.id) } } })
  const byUser = new Map(invs.map((i) => [i.userId, i]))
  const now = Date.now()
  return users.map((u) => {
    const i = byUser.get(u.id)
    const state = u.isActive ? 'active' : !i ? 'disabled' : i.acceptedAt ? 'disabled' : i.cancelledAt ? 'cancelled' : i.expiresAt.getTime() <= now ? 'expired' : 'invited'
    return { userId: u.id, invitationId: i?.id ?? null, email: u.email, name: u.displayName, role: u.role, state, expiresAt: i && state === 'invited' ? i.expiresAt : null, operatorStatus: u.operator?.status ?? null, languages: u.operator?.languages ?? [] }
  })
}
