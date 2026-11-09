-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "aiDailyCallLimit" INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN     "aiMaskPersonalData" BOOLEAN NOT NULL DEFAULT true;
