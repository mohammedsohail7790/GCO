-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AbsenceKind" AS ENUM ('SICK', 'LEAVE', 'NO_SHOW', 'OTHER');

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "kind" "AbsenceKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandover" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromOperatorId" TEXT NOT NULL,
    "toOperatorId" TEXT,
    "body" TEXT NOT NULL,
    "conversationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,

    CONSTRAINT "ShiftHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shift_tenantId_startsAt_idx" ON "Shift"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "Shift_operatorId_startsAt_idx" ON "Shift"("operatorId", "startsAt");

-- CreateIndex
CREATE INDEX "Absence_tenantId_startsAt_idx" ON "Absence"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "Absence_operatorId_startsAt_idx" ON "Absence"("operatorId", "startsAt");

-- CreateIndex
CREATE INDEX "ShiftHandover_tenantId_createdAt_idx" ON "ShiftHandover"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ShiftHandover_toOperatorId_idx" ON "ShiftHandover"("toOperatorId");
