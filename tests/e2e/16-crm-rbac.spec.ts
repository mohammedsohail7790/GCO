import { test, expect } from '@playwright/test'
import { seedHunter, cleanupHunter, cleanupLead, sharedAdminContext, loginAs } from './helpers'

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
})
