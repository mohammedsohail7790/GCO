-- CreateEnum
CREATE TYPE "CareerApplicationStatus" AS ENUM ('NEW', 'REVIEWING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "CareerApplication" ADD COLUMN     "lastSubmittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "status" "CareerApplicationStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "statusUpdatedBy" TEXT,
ADD COLUMN     "submissionCount" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "CareerApplication_status_createdAt_idx" ON "CareerApplication"("status", "createdAt");

-- Existing rows: the last submission is the original one.
UPDATE "CareerApplication" SET "lastSubmittedAt" = "createdAt";
