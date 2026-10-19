-- CreateEnum
CREATE TYPE "TrainingKind" AS ENUM ('MATERIAL', 'TEST');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('ASSIGNED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "QualificationKind" AS ENUM ('CLIENT_APPROVAL', 'SERVICE', 'LANGUAGE');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "requireOperatorApproval" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TrainingModule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "kind" "TrainingKind" NOT NULL,
    "body" TEXT NOT NULL,
    "questions" JSONB,
    "passMarkPercent" INTEGER NOT NULL DEFAULT 80,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'ASSIGNED',
    "score" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "QualificationKind" NOT NULL,
    "serviceType" "ServiceType",
    "language" TEXT,
    "note" TEXT,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingModule_tenantId_archivedAt_idx" ON "TrainingModule"("tenantId", "archivedAt");

-- CreateIndex
CREATE INDEX "TrainingAssignment_operatorId_status_idx" ON "TrainingAssignment"("operatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_moduleId_operatorId_key" ON "TrainingAssignment"("moduleId", "operatorId");

-- CreateIndex
CREATE INDEX "Qualification_operatorId_kind_idx" ON "Qualification"("operatorId", "kind");

-- CreateIndex
CREATE INDEX "Qualification_tenantId_idx" ON "Qualification"("tenantId");
