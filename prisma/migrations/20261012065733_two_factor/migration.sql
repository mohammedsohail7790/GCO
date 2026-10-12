-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpSecretEnc" TEXT;
