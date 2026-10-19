-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('DATING', 'ECOMMERCE', 'SAAS', 'GAMING', 'SOCIAL_PLATFORM', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('LIVE_CHAT_SUPPORT', 'CHAT_MODERATION', 'COMMUNITY_MODERATION', 'MULTILINGUAL_CHAT', 'COVERAGE_24_7', 'DEDICATED_TEAM');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "industry" "Industry";

-- CreateTable
CREATE TABLE "TenantService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantService_tenantId_idx" ON "TenantService"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantService_tenantId_serviceType_key" ON "TenantService"("tenantId", "serviceType");

-- AddForeignKey
ALTER TABLE "TenantService" ADD CONSTRAINT "TenantService_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
