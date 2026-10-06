-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PROVISIONING', 'FAILED', 'SETUP', 'READY_FOR_GO_LIVE', 'LIVE');

-- CreateTable
CREATE TABLE "ClientOnboarding" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'PROVISIONING',
    "contactEmail" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "clientUserId" TEXT,
    "inviteTokenHash" TEXT,
    "inviteIssuedAt" TIMESTAMP(3),
    "inviteExpiresAt" TIMESTAMP(3),
    "inviteAcceptedAt" TIMESTAMP(3),
    "requestedProfile" JSONB NOT NULL DEFAULT '{}',
    "confirmations" JSONB NOT NULL DEFAULT '{}',
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "liveAt" TIMESTAMP(3),
    "liveByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientOnboarding_leadId_key" ON "ClientOnboarding"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientOnboarding_tenantId_key" ON "ClientOnboarding"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientOnboarding_clientUserId_key" ON "ClientOnboarding"("clientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientOnboarding_inviteTokenHash_key" ON "ClientOnboarding"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "ClientOnboarding_status_idx" ON "ClientOnboarding"("status");

-- AddForeignKey
ALTER TABLE "ClientOnboarding" ADD CONSTRAINT "ClientOnboarding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
