-- AlterEnum
ALTER TYPE "BillingModel" ADD VALUE 'HOURLY_PLUS_TICKETS';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "includedTicketsPerPeriod" INTEGER,
ADD COLUMN     "pricePerModeratedItemEurCents" INTEGER;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "firstClosedAt" TIMESTAMP(3);

-- Backfill: a conversation already resolved keeps its current close time as its first resolution.
UPDATE "Conversation" SET "firstClosedAt" = "closedAt" WHERE "closedAt" IS NOT NULL;

-- CreateTable
CREATE TABLE "ExternalTicketCount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalTicketCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalTicketCount_tenantId_periodStart_idx" ON "ExternalTicketCount"("tenantId", "periodStart");

-- AddForeignKey
ALTER TABLE "ExternalTicketCount" ADD CONSTRAINT "ExternalTicketCount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
