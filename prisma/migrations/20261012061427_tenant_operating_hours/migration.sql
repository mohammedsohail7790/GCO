-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "operatingHours" JSONB,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';
