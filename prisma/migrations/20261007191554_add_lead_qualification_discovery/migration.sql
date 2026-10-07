-- CreateEnum
CREATE TYPE "QualificationStatus" AS ENUM ('QUALIFIED', 'NOT_QUALIFIED', 'NEEDS_FOLLOW_UP');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "discovery" JSONB,
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "qualification" "QualificationStatus";

-- CreateIndex
CREATE INDEX "Lead_nextActionAt_idx" ON "Lead"("nextActionAt");
