-- CreateEnum
CREATE TYPE "EscalationLevel" AS ENUM ('SUPERVISOR', 'CLIENT_DECISION');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'CLAIMED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "EscalationReason" AS ENUM ('DECISION_NEEDED', 'CLIENT_APPROVAL_NEEDED', 'SENSITIVE_SITUATION', 'CANNOT_RESOLVE_SAFELY');

-- CreateEnum
CREATE TYPE "EscalationEventVisibility" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "level" "EscalationLevel" NOT NULL DEFAULT 'SUPERVISOR',
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "reason" "EscalationReason" NOT NULL,
    "summary" TEXT NOT NULL,
    "raisedByUserId" TEXT NOT NULL,
    "claimedByUserId" TEXT,
    "resolvedByUserId" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "escalatedToClientAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationEvent" (
    "id" TEXT NOT NULL,
    "escalationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "visibility" "EscalationEventVisibility" NOT NULL DEFAULT 'INTERNAL',
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Escalation_tenantId_status_level_idx" ON "Escalation"("tenantId", "status", "level");

-- CreateIndex
CREATE INDEX "Escalation_conversationId_idx" ON "Escalation"("conversationId");

-- CreateIndex
CREATE INDEX "EscalationEvent_escalationId_idx" ON "EscalationEvent"("escalationId");

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "Escalation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
