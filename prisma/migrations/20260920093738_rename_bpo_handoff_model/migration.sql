/*
  Warnings:

  - You are about to drop the `BPOHandoff` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "BpoHandoffStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTERED');

-- DropForeignKey
ALTER TABLE "BPOHandoff" DROP CONSTRAINT "BPOHandoff_leadId_fkey";

-- DropForeignKey
ALTER TABLE "BPOHandoff" DROP CONSTRAINT "BPOHandoff_tenantId_fkey";

-- DropTable
DROP TABLE "BPOHandoff";

-- DropEnum
DROP TYPE "BPOHandoffStatus";

-- CreateTable
CREATE TABLE "BpoHandoff" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tenantId" TEXT,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BpoHandoffStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "BpoHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BpoHandoff_leadId_key" ON "BpoHandoff"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "BpoHandoff_eventId_key" ON "BpoHandoff"("eventId");

-- AddForeignKey
ALTER TABLE "BpoHandoff" ADD CONSTRAINT "BpoHandoff_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BpoHandoff" ADD CONSTRAINT "BpoHandoff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
