-- CreateEnum
CREATE TYPE "ModerationItemKind" AS ENUM ('MESSAGE', 'IMAGE', 'PROFILE', 'POST', 'COMMENT', 'REPORT');

-- CreateEnum
CREATE TYPE "ModerationItemStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'DECIDED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ModerationVerdict" AS ENUM ('APPROVE', 'REJECT', 'ESCALATE');

-- CreateEnum
CREATE TYPE "ModerationActionKind" AS ENUM ('WARNING', 'RESTRICTION', 'BAN');

-- CreateEnum
CREATE TYPE "ModerationActionStatus" AS ENUM ('REQUESTED', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'UPHELD', 'OVERTURNED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "moderationCategories" TEXT[] DEFAULT ARRAY['spam', 'harassment', 'nudity', 'hate', 'violence', 'scam', 'underage', 'other']::TEXT[];

-- CreateTable
CREATE TABLE "ModerationItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "ModerationItemKind" NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "subjectExternalId" TEXT NOT NULL,
    "reporterExternalId" TEXT,
    "content" TEXT,
    "mediaUrl" TEXT,
    "flagReason" TEXT,
    "language" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "ModerationItemStatus" NOT NULL DEFAULT 'PENDING',
    "assignedOperatorId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "redactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationDecision" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT,
    "userId" TEXT NOT NULL,
    "verdict" "ModerationVerdict" NOT NULL,
    "category" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectExternalId" TEXT NOT NULL,
    "kind" "ModerationActionKind" NOT NULL,
    "itemId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "ModerationActionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "subjectExternalId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "decidedByUserId" TEXT,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationItem_tenantId_status_priority_createdAt_idx" ON "ModerationItem"("tenantId", "status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationItem_tenantId_subjectExternalId_idx" ON "ModerationItem"("tenantId", "subjectExternalId");

-- CreateIndex
CREATE INDEX "ModerationItem_assignedOperatorId_status_idx" ON "ModerationItem"("assignedOperatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationItem_tenantId_kind_externalItemId_key" ON "ModerationItem"("tenantId", "kind", "externalItemId");

-- CreateIndex
CREATE INDEX "ModerationDecision_itemId_idx" ON "ModerationDecision"("itemId");

-- CreateIndex
CREATE INDEX "ModerationDecision_tenantId_operatorId_createdAt_idx" ON "ModerationDecision"("tenantId", "operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_tenantId_status_idx" ON "ModerationAction"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ModerationAction_tenantId_subjectExternalId_idx" ON "ModerationAction"("tenantId", "subjectExternalId");

-- CreateIndex
CREATE INDEX "ModerationAppeal_tenantId_status_idx" ON "ModerationAppeal"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ModerationAppeal_itemId_idx" ON "ModerationAppeal"("itemId");
