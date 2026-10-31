-- CreateEnum
CREATE TYPE "IntegrationEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "environment" "IntegrationEnvironment" NOT NULL DEFAULT 'SANDBOX';

-- CreateTable
CREATE TABLE "IntegrationCheck" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "category" TEXT,
    "latencyMs" INTEGER,
    "environment" "IntegrationEnvironment" NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationCheck_integrationId_createdAt_idx" ON "IntegrationCheck"("integrationId", "createdAt");

-- AddForeignKey
ALTER TABLE "IntegrationCheck" ADD CONSTRAINT "IntegrationCheck_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
