-- CreateEnum
CREATE TYPE "QaOutcome" AS ENUM ('PASS', 'COACHING', 'FAIL');

-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "QaReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "operatorId" TEXT,
    "reviewerUserId" TEXT NOT NULL,
    "accuracy" INTEGER NOT NULL,
    "tone" INTEGER NOT NULL,
    "resolution" INTEGER NOT NULL,
    "outcome" "QaOutcome" NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QaReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QaReview_tenantId_createdAt_idx" ON "QaReview"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "QaReview_tenantId_operatorId_idx" ON "QaReview"("tenantId", "operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "QaReview_messageId_reviewerUserId_key" ON "QaReview"("messageId", "reviewerUserId");
