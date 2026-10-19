-- CreateEnum
CREATE TYPE "ClientRequestKind" AS ENUM ('WORKFLOW_CHANGE', 'INSTRUCTION_CHANGE', 'SETTINGS_CHANGE', 'MESSAGE');

-- CreateEnum
CREATE TYPE "ClientRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'DECLINED');

-- CreateTable
CREATE TABLE "ClientRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "ClientRequestKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ClientRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ClientRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "fromClient" BOOLEAN NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRoute" (
    "role" "Role" NOT NULL,
    "minSeverity" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRoute_pkey" PRIMARY KEY ("role")
);

-- CreateIndex
CREATE INDEX "ClientRequest_tenantId_status_idx" ON "ClientRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClientMessage_requestId_createdAt_idx" ON "ClientMessage"("requestId", "createdAt");
