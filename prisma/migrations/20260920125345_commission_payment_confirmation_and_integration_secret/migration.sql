-- DropIndex
DROP INDEX "Commission_leadId_idx";

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "webhookSecret" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Commission_leadId_key" ON "Commission"("leadId");
