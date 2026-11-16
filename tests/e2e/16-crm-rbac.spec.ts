import { test, expect } from '@playwright/test'
import { seedHunter, cleanupHunter, cleanupLead, sharedAdminContext, loginAs } from './helpers'
import { db } from '../../lib/db/client'
import { hashPassword } from '../../lib/auth/password'
import { upsertStaffAccount } from '../../lib/auth/staffAccounts'

// CRM RBAC: Hunters see only their own leads/commissions (never another
// Hunter's), Manager/CEO see the whole team, and only CEO_ADMIN reaches the
// executive dashboard + payout controls. See lib/auth/rbac.ts's PERMISSIONS
// additions and each route's assertCan/requirePermission call.
test.describe('CRM RBAC', () => {
  test('a Hunter cannot see another Hunter\'s owned lead in their own-leads list', async () => {
    const hunterA = await seedHunter('rbac-a')
    const hunterB = await seedHunter('rbac-b')
    let leadId = ''
    try {
      const createRes = await hunterA.ctx.post('/api/v1/crm/leads', {
        data: { companyName: '[E2E] RBAC Isolation Co', contactName: 'Sam', email: `rbac-${Date.now()}@e2e.gco` },
      })
      leadId = (await createRes.json()).data.lead.id
      await hunterA.ctx.post(`/api/v1/crm/leads/${leadId}/claim`)

      const bListRes = await hunterB.ctx.get('/api/v1/crm/leads')
      const bLeads = (await bListRes.json()).data
      expect(bLeads.some((l: any) => l.id === leadId)).toBe(false)

      // B also cannot see it in the unassigned pool (it's owned by A).
      const bUnassignedRes = await hunterB.ctx.get('/api/v1/crm/leads?unassigned=true')
      const bUnassigned = (await bUnassignedRes.json()).data
      expect(bUnassigned.some((l: any) => l.id === leadId)).toBe(false)

      // B cannot release A's lead.
      const releaseRes = await hunterB.ctx.post(`/api/v1/crm/leads/${leadId}/release`)
      expect(releaseRes.status()).toBe(403)

      // B cannot log activity against A's lead (ownership check in logActivity).
      const activityRes = await hunterB.ctx.post(`/api/v1/crm/leads/${leadId}/activities`, { data: { note: 'sneaky' } })
      expect(activityRes.status()).toBe(409)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunterA.userId)
      await cleanupHunter(hunterB.userId)
    }
  })

  test('a Hunter cannot see another Hunter\'s commissions', async () => {
    const hunterA = await seedHunter('rbac-comm-a')
    const hunterB = await seedHunter('rbac-comm-b')
    try {
      const resA = await hunterA.ctx.get('/api/v1/crm/commissions')
      expect(resA.status()).toBe(200)
      const resB = await hunterB.ctx.get('/api/v1/crm/commissions')
      expect(resB.status()).toBe(200)
      // Each Hunter's own commission list request only ever returns rows
      // scoped to their own hunterId (enforced server-side, not by filtering).
      const dataA = (await resA.json()).data
      const dataB = (await resB.json()).data
      expect(dataA.every((c: any) => c.hunterId === hunterA.userId)).toBe(true)
      expect(dataB.every((c: any) => c.hunterId === hunterB.userId)).toBe(true)
    } finally {
      await cleanupHunter(hunterA.userId)
      await cleanupHunter(hunterB.userId)
    }
  })

  test('Manager sees team-wide leads and pending approvals; CEO reaches the executive dashboard', async () => {
    const hunter = await seedHunter('rbac-manager-view')
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const createRes = await hunter.ctx.post('/api/v1/crm/leads', {
        data: { companyName: '[E2E] Manager Visible Co', contactName: 'Tara', email: `rbac-mgr-${Date.now()}@e2e.gco` },
      })
      leadId = (await createRes.json()).data.lead.id

      const managerCtx = await loginAs('manager@demo.gco')
      const managerLeadsRes = await managerCtx.get('/api/v1/crm/leads')
      expect(managerLeadsRes.status()).toBe(200)
      const managerLeads = (await managerLeadsRes.json()).data
      expect(managerLeads.some((l: any) => l.id === leadId)).toBe(true)

      const managerDashRes = await managerCtx.get('/api/v1/crm/dashboard/manager')
      expect(managerDashRes.status()).toBe(200)

      // Manager cannot reach the CEO-only executive dashboard or payout control.
      const managerCeoRes = await managerCtx.get('/api/v1/crm/dashboard/ceo')
      expect(managerCeoRes.status()).toBe(403)

      const ceoRes = await admin.get('/api/v1/crm/dashboard/ceo')
      expect(ceoRes.status()).toBe(200)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('a Hunter cannot reach team/manager/CEO-only CRM endpoints', async () => {
    const hunter = await seedHunter('rbac-hunter-forbidden')
    try {
      const approvalsRes = await hunter.ctx.get('/api/v1/crm/approvals')
      expect(approvalsRes.status()).toBe(403)

      const managerDashRes = await hunter.ctx.get('/api/v1/crm/dashboard/manager')
      expect(managerDashRes.status()).toBe(403)

      const ceoDashRes = await hunter.ctx.get('/api/v1/crm/dashboard/ceo')
      expect(ceoDashRes.status()).toBe(403)

      const revenueRes = await hunter.ctx.post('/api/v1/crm/revenue', {
        data: { tenantId: 'whatever', amountEurCents: 100, periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() },
      })
      expect(revenueRes.status()).toBe(403)
    } finally {
      await cleanupHunter(hunter.userId)
    }
  })

  test('an unauthenticated request to any CRM endpoint is rejected', async () => {
    const { anonymousContext } = await import('./helpers')
    const anon = await anonymousContext()
    const res = await anon.get('/api/v1/crm/leads')
    expect(res.status()).toBe(401)
  })

  // CEO decision, 16 Nov 2026: CTO gets a time-limited, view-only CRM scope - leads and career applications,
  // never editable, and nothing on billing/revenue. See lib/auth/rbac.ts (LEAD_VIEW_TEAM vs the new LEAD_MANAGE,
  // and CAREER_VIEW) and the two routes split out of LEAD_VIEW_TEAM for this: leads/[id] PATCH and
  // leads/[id]/discovery PATCH, which now require LEAD_MANAGE instead.
  test('CTO: can view leads and career applications, but can never edit either, and has no billing/revenue access', async () => {
    const stamp = Date.now()
    const ctoEmail = `cto-crm-${stamp}@e2e.gco`
    const hash = await hashPassword('Harbor-Quiet-Lantern-2026')
    await upsertStaffAccount(db, { email: ctoEmail, displayName: 'E2E CTO', role: 'CTO', passwordHash: hash })
    const hunter = await seedHunter('rbac-cto-view')
    let leadId = ''
    const appEmail = `cto-view-${stamp}@careers16.gco`
    try {
      const createRes = await hunter.ctx.post('/api/v1/crm/leads', {
        data: { companyName: '[E2E] CTO View-Only Co', contactName: 'Priya', email: `cto-view-lead-${stamp}@e2e.gco` },
      })
      leadId = (await createRes.json()).data.lead.id

      const { anonymousContext } = await import('./helpers')
      const anon = await anonymousContext()
      const applyRes = await anon.post('/api/v1/public/careers/apply', {
        data: { fullName: '[E2E] CTO View-Only Applicant', email: appEmail, country: 'Portugal', languages: 'English', message: 'Test applicant for CTO view-only RBAC check.' },
        headers: { 'x-forwarded-for': `cto-crm-view-${stamp}` },
      })
      expect(applyRes.status()).toBe(201)
      const appRow = await db.careerApplication.findFirstOrThrow({ where: { email: appEmail.toLowerCase() } })

      const cto = await loginAs(ctoEmail, 'Harbor-Quiet-Lantern-2026')

      // Can view: the lead appears in CTO's team-wide list, and the application is readable.
      const ctoLeadsRes = await cto.get('/api/v1/crm/leads')
      expect(ctoLeadsRes.status()).toBe(200)
      expect((await ctoLeadsRes.json()).data.some((l: any) => l.id === leadId)).toBe(true)
      const ctoLeadDetailRes = await cto.get(`/api/v1/crm/leads/${leadId}`)
      expect(ctoLeadDetailRes.status()).toBe(200)
      const ctoAppsRes = await cto.get('/api/v1/admin/career-applications')
      expect(ctoAppsRes.status()).toBe(200)
      expect((await ctoAppsRes.json()).data.some((a: any) => a.id === appRow.id)).toBe(true)

      // Cannot edit either: PATCH is refused even though GET just succeeded.
      const ctoLeadPatchRes = await cto.patch(`/api/v1/crm/leads/${leadId}`, { data: { notes: 'CTO should not be able to write this' } })
      expect(ctoLeadPatchRes.status()).toBe(403)
      const ctoDiscoveryRes = await cto.patch(`/api/v1/crm/leads/${leadId}/discovery`, { data: { nextAction: 'should be refused' } })
      expect(ctoDiscoveryRes.status()).toBe(403)
      const ctoAppPatchRes = await cto.patch(`/api/v1/admin/career-applications/${appRow.id}`, { data: { status: 'REVIEWING' } })
      expect(ctoAppPatchRes.status()).toBe(403)

      // Still no billing/revenue/commission/payout access of any kind.
      expect((await cto.get('/api/v1/crm/dashboard/ceo')).status()).toBe(403)
      expect((await cto.get('/api/v1/crm/commissions')).status()).toBe(403)
      expect((await cto.post('/api/v1/crm/revenue', { data: { tenantId: 'whatever', amountEurCents: 100, periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() } })).status()).toBe(403)
    } finally {
      await db.careerApplication.deleteMany({ where: { email: appEmail.toLowerCase() } })
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
      const ctoUser = await db.user.findUnique({ where: { email: ctoEmail } })
      if (ctoUser) { await db.session.deleteMany({ where: { userId: ctoUser.id } }); await db.auditLog.deleteMany({ where: { actorUserId: ctoUser.id } }); await db.user.delete({ where: { id: ctoUser.id } }) }
    }
  })
})
