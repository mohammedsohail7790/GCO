-- CreateEnum
CREATE TYPE "DataRequestKind" AS ENUM ('EXPORT', 'ERASURE');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('OPEN', 'COMPLETED', 'REJECTED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "redactedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "dataRegion" TEXT,
ADD COLUMN     "messageRetentionDays" INTEGER,
ADD COLUMN     "regulations" TEXT[] DEFAULT ARRAY['GDPR']::TEXT[];

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "DataRequestKind" NOT NULL,
    "subjectRefHash" TEXT NOT NULL,
    "subjectHint" TEXT NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requestedByUserId" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataRequest_tenantId_status_idx" ON "DataRequest"("tenantId", "status");
