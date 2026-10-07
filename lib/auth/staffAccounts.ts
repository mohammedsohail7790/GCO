import bcrypt from 'bcryptjs'
import type { PrismaClient, Role } from '@prisma/client'
import { PUBLISHED_SEED_PASSWORD } from './password'

// Operator-run account tooling (see prisma/ops/*): create/rotate a real staff account WITHOUT ever handling the password
// in plain text outside the process that hashes it, and retire the published demo accounts safely. Pure DB logic lives
// here so it is testable; the scripts are thin interactive wrappers.

type Db = Pick<PrismaClient, 'user' | 'session' | 'auditLog' | 'hunterProfile' | '$transaction'>

export const STAFF_ROLES = ['CEO_ADMIN', 'ASSISTANT', 'HUNTER'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export class AccountToolError extends Error {}

/** The five demo accounts created by prisma/seed.ts in production on 2026-09-28, pinned by IMMUTABLE id + role + tenant. */
export const DEMO_ACCOUNTS: readonly { id: string; email: string; role: Role; tenantId: string | null }[] = [
  { id: 'cmulg4h660003z8nwkizgjbhv', email: 'admin@demo.gco', role: 'CEO_ADMIN', tenantId: null },
  { id: 'cmulg4h6e0005z8nw0lbvc1ap', email: 'manager@demo.gco', role: 'MANAGER', tenantId: 'cmulg4gwr0000z8nw5wy9kjwy' },
  { id: 'cmulg4h6j0007z8nw6v13lsda', email: 'operator1@demo.gco', role: 'OPERATOR', tenantId: 'cmulg4gwr0000z8nw5wy9kjwy' },
  { id: 'cmulg4h70000cz8nw70u8o91n', email: 'client@demo.gco', role: 'CLIENT', tenantId: 'cmulg4gwr0000z8nw5wy9kjwy' },
  { id: 'cmulg4h73000dz8nwzzr2qk6z', email: 'hunter1@demo.gco', role: 'HUNTER', tenantId: null },
]
export const DEMO_EMAIL_DOMAIN = '@demo.gco'

export const normalizeStaffEmail = (e: string) => e.trim().toLowerCase()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface UpsertInput {
  email: string
  displayName: string
  role: StaffRole
  /** bcrypt hash of the password the operator typed (null only for dry runs). */
  passwordHash: string | null
  updatePassword?: boolean
  allowRoleChange?: boolean
  dryRun?: boolean
}
export interface UpsertResult {
  action: 'created' | 'password_updated' | 'would_create' | 'would_update_password'
  userId: string | null
  email: string
  role: StaffRole
}

/** Creates a staff account, or (explicitly) sets a new password on an existing one. Never prints or stores a password. */
export async function upsertStaffAccount(db: Db, input: UpsertInput): Promise<UpsertResult> {
  const email = normalizeStaffEmail(input.email)
  if (!EMAIL.test(email) || email.length > 200) throw new AccountToolError('That does not look like a valid email address.')
  if (email.endsWith(DEMO_EMAIL_DOMAIN)) throw new AccountToolError('Demo accounts are retired with disable-demo-accounts, never edited here.')
  if (!(STAFF_ROLES as readonly string[]).includes(input.role)) throw new AccountToolError(`Role must be one of: ${STAFF_ROLES.join(', ')}.`)
  const displayName = input.displayName.trim().slice(0, 120)
  if (!displayName) throw new AccountToolError('A display name is required.')
  if (!input.dryRun && !input.passwordHash) throw new AccountToolError('A password hash is required.')
  if (input.passwordHash && !/^\$2[aby]\$12\$/.test(input.passwordHash)) throw new AccountToolError('The hash is not bcrypt cost 12 - use the application hashing.')

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.tenantId || !(STAFF_ROLES as readonly string[]).includes(existing.role)) throw new AccountToolError('That email belongs to a client/tenant account; this tool only manages global staff accounts.')
    if (existing.role !== input.role && !input.allowRoleChange) throw new AccountToolError(`That account exists as ${existing.role}. Role changes need --allow-role-change.`)
    if (!input.updatePassword) throw new AccountToolError('That account already exists. To set a new password for it, re-run with --update-password.')
    if (input.dryRun) return { action: 'would_update_password', userId: existing.id, email, role: input.role }
    await db.user.update({ where: { id: existing.id }, data: { passwordHash: input.passwordHash!, role: input.role, isActive: true, displayName } })
    // a password change must end every older session
    await db.session.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } })
    await db.auditLog.create({ data: { action: 'staff.password_set', resource: 'user', resourceId: existing.id, metadata: { role: input.role, via: 'ops-cli' } as object } })
    return { action: 'password_updated', userId: existing.id, email, role: input.role }
  }
  if (input.dryRun) return { action: 'would_create', userId: null, email, role: input.role }
  const user = await db.user.create({ data: { email, displayName, role: input.role, passwordHash: input.passwordHash!, isActive: true } })
  if (input.role === 'HUNTER') await db.hunterProfile.create({ data: { userId: user.id, commissionPercentage: 10.0 } })
  await db.auditLog.create({ data: { action: 'staff.account_created', resource: 'user', resourceId: user.id, metadata: { role: input.role, via: 'ops-cli' } as object } })
  return { action: 'created', userId: user.id, email, role: input.role }
}

export interface ReplacementCheck {
  ok: boolean
  reason: string
  ceoEmail?: string
}

/** A real (non-demo) active CEO_ADMIN must exist, with a bcrypt hash that is NOT the published seed password. */
export async function verifyReplacementCeo(db: Db, demoDomain: string = DEMO_EMAIL_DOMAIN): Promise<ReplacementCheck> {
  const ceos = await db.user.findMany({ where: { role: 'CEO_ADMIN', isActive: true, NOT: { email: { endsWith: demoDomain } } }, select: { email: true, passwordHash: true } })
  if (ceos.length === 0) return { ok: false, reason: 'No active non-demo CEO_ADMIN account exists. Create one first (prisma/ops/staff-account.ts).' }
  for (const c of ceos) {
    if (!/^\$2[aby]\$\d{2}\$/.test(c.passwordHash)) continue
    if (await bcrypt.compare(PUBLISHED_SEED_PASSWORD, c.passwordHash)) continue
    return { ok: true, reason: 'A non-demo active CEO_ADMIN with a non-default password exists.', ceoEmail: c.email }
  }
  return { ok: false, reason: 'The non-demo CEO_ADMIN account(s) use the published seed password or an invalid hash.' }
}

export interface DisableReport {
  dryRun: boolean
  accounts: { id: string; email: string; role: string; wasActive: boolean; liveSessions: number }[]
  replacement: ReplacementCheck
  disabled: number
  sessionsRevoked: number
}

/**
 * Disables (never deletes) exactly the expected demo accounts and revokes their sessions. Refuses unless the accounts match
 * the expected table EXACTLY (id + email + role + tenant, nothing missing, no extra @demo.gco user) and a verified
 * replacement CEO exists. Idempotent. Tenant, data and history are untouched.
 */
export async function disableDemoAccounts(db: Db, opts: { expected?: typeof DEMO_ACCOUNTS; dryRun?: boolean; requireReplacement?: boolean; demoEmailDomain?: string; replacementDomain?: string } = {}): Promise<DisableReport> {
  const expected = opts.expected ?? DEMO_ACCOUNTS
  const demoDomain = opts.demoEmailDomain ?? DEMO_EMAIL_DOMAIN // overridable only so tests can use isolated fixtures
  const ids = expected.map((e) => e.id)
  const found = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, role: true, tenantId: true, isActive: true } })
  if (found.length !== expected.length) throw new AccountToolError(`Expected ${expected.length} demo accounts but found ${found.length}. Refusing to continue.`)
  for (const e of expected) {
    const u = found.find((f) => f.id === e.id)
    if (!u || u.email !== e.email || u.role !== e.role || (u.tenantId ?? null) !== e.tenantId) throw new AccountToolError(`Account ${e.id} does not match the expected demo account. Refusing to continue.`)
  }
  const strays = await db.user.count({ where: { email: { endsWith: demoDomain }, id: { notIn: ids } } })
  if (strays > 0) throw new AccountToolError(`${strays} unexpected @demo.gco account(s) exist that are not in the expected list. Refusing to continue.`)

  const replacement = opts.requireReplacement === false ? { ok: true, reason: 'replacement check skipped (tests only)' } : await verifyReplacementCeo(db, opts.replacementDomain ?? demoDomain) // replacementDomain: test seam
  const live = await db.session.groupBy({ by: ['userId'], where: { userId: { in: ids }, revokedAt: null, expiresAt: { gt: new Date() } }, _count: { _all: true } })
  const accounts = found.map((u) => ({ id: u.id, email: u.email, role: u.role, wasActive: u.isActive, liveSessions: live.find((l) => l.userId === u.id)?._count._all ?? 0 }))
  const base = { accounts, replacement }
  if (opts.dryRun) return { dryRun: true, ...base, disabled: 0, sessionsRevoked: 0 }
  if (!replacement.ok) throw new AccountToolError(`Refusing to disable the demo accounts: ${replacement.reason}`)

  const result = await db.$transaction(async (tx) => {
    const disabled = await tx.user.updateMany({ where: { id: { in: ids }, isActive: true }, data: { isActive: false } })
    const revoked = await tx.session.updateMany({ where: { userId: { in: ids }, revokedAt: null }, data: { revokedAt: new Date() } })
    for (const a of accounts.filter((x) => x.wasActive)) {
      await tx.auditLog.create({ data: { action: 'staff.demo_account_disabled', resource: 'user', resourceId: a.id, metadata: { role: a.role, via: 'ops-cli' } as object } })
    }
    return { disabled: disabled.count, revoked: revoked.count }
  })
  return { dryRun: false, ...base, disabled: result.disabled, sessionsRevoked: result.revoked }
}
