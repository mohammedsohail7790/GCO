-- CreateEnum
CREATE TYPE "WeeklyReportStatus" AS ENUM ('DRAFT', 'REVIEWED');

-- CreateTable
CREATE TABLE "OperatorWeeklyReport" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "status" "WeeklyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "managerFeedback" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorWeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatorWeeklyReport_tenantId_weekStart_idx" ON "OperatorWeeklyReport"("tenantId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorWeeklyReport_operatorId_weekStart_key" ON "OperatorWeeklyReport"("operatorId", "weekStart");
