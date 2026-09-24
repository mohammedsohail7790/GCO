import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { changeStage } from './leads'
import { enqueueBpoHandoff } from '@/lib/queue/jobs'

// Confirmed V1 business rule (Cristian): commission is a flat, universal
// 10% - not a per-Hunter configurable rate. See confirmFirstPayment() below
// for why HunterProfile.commissionPercentage is no longer read for this.
const V1_COMMISSION_PERCENTAGE = 10.0

export class ApprovalError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** Hunter submits a PROPOSAL-stage lead for Closed-Won approval. Structurally, a
 *  Hunter cannot force Closed Won directly - this is the only path into
 *  PENDING_APPROVAL, and only a decideApproval() call (gated to MANAGER/CEO_ADMIN
 *  by RBAC) can ever move a lead to CLOSED_WON. */
export async function submitForApproval(leadId: string, hunterUserId: string, reason?: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
  if (lead.ownerId !== hunterUserId) throw new ApprovalError('You do not own this lead', 403)

  await changeStage(leadId, hunterUserId, 'PENDING_APPROVAL')

  const approval = await db.approval.create({
    data: { leadId, submittedByUserId: hunterUserId, reason },
  })
  await db.leadHistoryEntry.create({
    data: { leadId, actorUserId: hunterUserId, action: 'submitted_for_approval', metadata: { approvalId: approval.id } },
  })
  await writeAuditLog({
    actorUserId: hunterUserId,
    action: 'approval.submitted',
    resource: 'approval',
    resourceId: approval.id,
    metadata: { leadId },
  })

  return approval
}

/**
 * Manager/CEO decision. Server-side re-check that the reviewer did not submit
 * their own approval - defense-in-depth alongside the RBAC matrix, which
 * already keeps HUNTER off APPROVAL_DECIDE entirely.
 *
 * Approving moves the lead to Closed Won and enqueues the BPO handoff
 * (client onboarding) - reusing the existing BullMQ queue/dead-letter
 * infrastructure, not a new system. It deliberately does NOT create a
 * Commission: confirmed business rule is that Closed Won by itself must
 * never make a commission payable - only actual first-month payment
 * received does that. See confirmFirstPayment() below.
 *
 * The PENDING -> decided transition below is a race-safe conditional update
 * (mirrors lib/assignment/engine.ts::tryAssignConversation and
 * lib/crm/leads.ts::claimLead's updateMany+count pattern) rather than a plain
 * read-then-write. Two concurrent decide calls on the same approval (a
 * double-click, a client retry, two reviewers) previously could BOTH read
 * status: PENDING before either wrote, both pass the check above, and (back
 * when this function also created the Commission here) both proceed to
 * create one - confirmed by direct testing: 10 concurrent requests on one
 * approval created up to 10 duplicate Commission rows. The BpoHandoff step
 * was already safe (idempotent upsert on leadId).
 */
export async function decideApproval(
  approvalId: string,
  reviewerUserId: string,
  decision: 'APPROVED' | 'REJECTED',
  reviewNotes: string | undefined,
) {
  const approval = await db.approval.findUniqueOrThrow({ where: { id: approvalId }, include: { lead: true } })
  if (approval.submittedByUserId === reviewerUserId) {
    throw new ApprovalError('You cannot approve or reject your own submission', 403)
  }

  const claimed = await db.approval.updateMany({
    where: { id: approvalId, status: 'PENDING' },
    data: { status: decision, reviewedByUserId: reviewerUserId, reviewNotes, reviewedAt: new Date() },
  })
  if (claimed.count === 0) {
    throw new ApprovalError('This approval has already been decided', 409)
  }

  if (decision === 'REJECTED') {
    await changeStage(approval.leadId, reviewerUserId, 'PROPOSAL')
    await db.leadHistoryEntry.create({
      data: { leadId: approval.leadId, actorUserId: reviewerUserId, action: 'rejected', metadata: { approvalId, reviewNotes } },
    })
    await writeAuditLog({
      actorUserId: reviewerUserId,
      action: 'approval.rejected',
      resource: 'approval',
      resourceId: approvalId,
      metadata: { leadId: approval.leadId },
    })
    return { approval }
  }

  // APPROVED - Closed Won + client onboarding (BPO handoff). No commission yet.
  // PENDING_APPROVAL -> CLOSED_WON is deliberately NOT in changeStage()'s
  // generic transition map - this approval path is the only code that may
  // perform it, so the update + history entry are written directly here
  // rather than widening the generic (Hunter-reachable) transition table.
  await db.lead.update({ where: { id: approval.leadId }, data: { pipelineStage: 'CLOSED_WON' } })
  await db.leadHistoryEntry.create({
    data: {
      leadId: approval.leadId,
      actorUserId: reviewerUserId,
      action: 'approved',
      metadata: { approvalId, reviewNotes, from: 'PENDING_APPROVAL', to: 'CLOSED_WON' },
    },
  })
  await writeAuditLog({
    actorUserId: reviewerUserId,
    action: 'approval.approved',
    resource: 'approval',
    resourceId: approvalId,
    metadata: { leadId: approval.leadId },
  })

  // Idempotent on leadId: a retried/duplicate decide-approval call can never
  // create a second handoff record or double-enqueue the job - upsert is a
  // no-op if one already exists for this lead.
  await db.bpoHandoff.upsert({
    where: { leadId: approval.leadId },
    update: {},
    create: {
      leadId: approval.leadId,
      eventId: `handoff-${approval.leadId}`,
      payload: {
        leadId: approval.leadId,
        companyName: approval.lead.companyName,
        contactName: approval.lead.contactName,
        contactEmail: approval.lead.email,
      },
    },
  })
  await enqueueBpoHandoff(approval.leadId)

  return { approval }
}

export class PaymentConfirmationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/**
 * Confirms the client's first-month payment was actually received, and ONLY
 * THEN creates the Hunter's commission - the confirmed business rule this
 * function exists to implement: Closed Won alone must never make a
 * commission payable.
 *
 * Requires the BPO handoff to have already SUCCEEDED (the Tenant/client
 * profile exists) - payment confirmation logically follows client
 * onboarding, and this also means Commission.tenantId can be set directly
 * here rather than backfilled asynchronously later.
 *
 * Idempotency/concurrency: relies on Commission.leadId being @unique (see
 * schema) rather than a read-then-write check - the same DB-constraint-
 * backed pattern already used for Lead.email/vatId. Two concurrent
 * confirmations for the same lead race on a single `create()`; Postgres
 * allows only one to succeed, the other hits a P2002 violation which is
 * translated into PaymentConfirmationError(409) here - never a duplicate
 * Commission, never a silently-lost second attempt.
 *
 * Also creates a RevenueRecord (source: DEAL_CLOSED) for the same confirmed
 * amount, so MRR/revenue dashboards reflect it automatically without the
 * caller double-entering the same figure via POST /crm/revenue. Any LATER
 * revenue for this tenant (month 2 onward) is recorded the same way but
 * never touches Commission at all - there is no code path from
 * /crm/revenue to Commission creation, which is what keeps second-month-
 * onward revenue from ever generating an additional Hunter commission.
 */
export async function confirmFirstPayment(leadId: string, actorUserId: string, amountEurCents: number) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
  if (lead.pipelineStage !== 'CLOSED_WON') {
    throw new PaymentConfirmationError('Lead must be Closed Won before confirming payment', 409)
  }
  if (!lead.ownerId) {
    throw new PaymentConfirmationError('Lead has no owner - cannot calculate commission', 409)
  }

  const handoff = await db.bpoHandoff.findUnique({ where: { leadId } })
  if (!handoff || handoff.status !== 'SUCCEEDED' || !handoff.tenantId) {
    throw new PaymentConfirmationError('Client onboarding (BPO handoff) is not complete yet - cannot confirm payment', 409)
  }

  // Confirmed V1 business rule: commission is a flat, universal 10% - not a
  // per-Hunter configurable rate. HunterProfile.commissionPercentage predates
  // that decision (it was built when a prior, separate instruction called
  // for "dynamic % per Hunter, never hardcoded 10%") and is deliberately NOT
  // read here anymore, so a CEO setting a different rate on a HunterProfile
  // can no longer silently produce a commission that violates the confirmed
  // rule. The field itself is left in the schema (not removed) in case a
  // future, explicit business decision reintroduces per-Hunter rates.
  const percentage = V1_COMMISSION_PERCENTAGE

  let commission
  try {
    commission = await db.commission.create({
      data: {
        leadId,
        hunterId: lead.ownerId,
        tenantId: handoff.tenantId,
        percentage,
        revenueBasisEurCents: amountEurCents,
        // Server-calculated, always - the client never supplies this figure.
        amountEurCents: Math.round((amountEurCents * Number(percentage)) / 100),
      },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new PaymentConfirmationError('First payment has already been confirmed for this lead', 409)
    }
    throw err
  }

  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setMonth(periodEnd.getMonth() + 1)
  const revenueRecord = await db.revenueRecord.create({
    data: {
      tenantId: handoff.tenantId,
      leadId,
      amountEurCents,
      periodStart: now,
      periodEnd,
      source: 'DEAL_CLOSED',
    },
  })

  await db.leadHistoryEntry.create({
    data: {
      leadId,
      actorUserId,
      action: 'first_payment_confirmed',
      metadata: { amountEurCents, commissionId: commission.id, revenueRecordId: revenueRecord.id },
    },
  })
  await writeAuditLog({
    tenantId: handoff.tenantId,
    actorUserId,
    action: 'payment.first_confirmed',
    resource: 'lead',
    resourceId: leadId,
    metadata: { amountEurCents },
  })
  await writeAuditLog({
    tenantId: handoff.tenantId,
    actorUserId,
    action: 'commission.generated',
    resource: 'commission',
    resourceId: commission.id,
    metadata: { leadId, hunterId: lead.ownerId, amountEurCents: commission.amountEurCents, percentage: String(percentage) },
  })

  return { commission, revenueRecord }
}
