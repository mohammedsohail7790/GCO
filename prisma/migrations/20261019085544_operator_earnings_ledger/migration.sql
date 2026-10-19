-- CreateEnum
CREATE TYPE "PayableBasis" AS ENUM ('DELIVERED', 'APPROVED');

-- CreateEnum
CREATE TYPE "EarningState" AS ENUM ('PENDING', 'PAYABLE', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "OperatorRateCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "operatorId" TEXT,
    "amountEurCents" INTEGER NOT NULL,
    "basis" "PayableBasis" NOT NULL DEFAULT 'DELIVERED',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorRateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorEarningLine" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "rateEurCents" INTEGER NOT NULL,
    "basis" "PayableBasis" NOT NULL,
    "state" "EarningState" NOT NULL DEFAULT 'PENDING',
    "stateReason" TEXT,
    "messageAt" TIMESTAMP(3) NOT NULL,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorEarningLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorEarningAdjustment" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tenantId" TEXT,
    "amountEurCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "lineId" TEXT,
    "payoutId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorEarningAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorPayout" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "linesEurCents" INTEGER NOT NULL,
    "adjustmentsEurCents" INTEGER NOT NULL,
    "totalEurCents" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,

    CONSTRAINT "OperatorPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatorRateCard_tenantId_operatorId_effectiveFrom_idx" ON "OperatorRateCard"("tenantId", "operatorId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorEarningLine_messageId_key" ON "OperatorEarningLine"("messageId");

-- CreateIndex
CREATE INDEX "OperatorEarningLine_operatorId_messageAt_idx" ON "OperatorEarningLine"("operatorId", "messageAt");

-- CreateIndex
CREATE INDEX "OperatorEarningLine_operatorId_state_payoutId_idx" ON "OperatorEarningLine"("operatorId", "state", "payoutId");

-- CreateIndex
CREATE INDEX "OperatorEarningLine_tenantId_messageAt_idx" ON "OperatorEarningLine"("tenantId", "messageAt");

-- CreateIndex
CREATE INDEX "OperatorEarningAdjustment_operatorId_createdAt_idx" ON "OperatorEarningAdjustment"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorEarningAdjustment_operatorId_payoutId_idx" ON "OperatorEarningAdjustment"("operatorId", "payoutId");

-- CreateIndex
CREATE INDEX "OperatorPayout_operatorId_createdAt_idx" ON "OperatorPayout"("operatorId", "createdAt");
