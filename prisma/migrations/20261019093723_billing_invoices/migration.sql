-- CreateEnum
CREATE TYPE "BillingModel" AS ENUM ('PER_MESSAGE', 'PER_TICKET', 'PER_HOUR', 'MONTHLY_FLAT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "billingModel" "BillingModel" NOT NULL DEFAULT 'PER_MESSAGE',
ADD COLUMN     "monthlyFeeEurCents" INTEGER,
ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "pricePerHourEurCents" INTEGER,
ADD COLUMN     "pricePerTicketEurCents" INTEGER,
ADD COLUMN     "vatNote" TEXT,
ADD COLUMN     "vatRatePercent" INTEGER NOT NULL DEFAULT 22;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "billingModel" "BillingModel" NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotalEurCents" INTEGER NOT NULL,
    "vatRatePercent" INTEGER NOT NULL,
    "vatEurCents" INTEGER NOT NULL,
    "totalEurCents" INTEGER NOT NULL,
    "vatNote" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_periodStart_idx" ON "Invoice"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
