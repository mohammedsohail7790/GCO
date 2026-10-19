-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'SUPERVISOR';
ALTER TYPE "Role" ADD VALUE 'CTO';

-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "supervisorUserId" TEXT;

-- CreateIndex
CREATE INDEX "Operator_supervisorUserId_idx" ON "Operator"("supervisorUserId");
