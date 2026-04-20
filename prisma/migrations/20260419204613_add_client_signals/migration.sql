-- CreateEnum
CREATE TYPE "ClientSignalAction" AS ENUM ('SIGNUP', 'LOGIN', 'INVITATION_SENT');

-- CreateTable
CREATE TABLE "ClientSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "ClientSignalAction" NOT NULL,
    "wasSuccessful" BOOLEAN NOT NULL DEFAULT true,
    "installId" TEXT,
    "attemptedEmail" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "acceptLanguage" TEXT,
    "timezone" TEXT,
    "platform" TEXT,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientSignal_action_createdAt_idx" ON "ClientSignal"("action", "createdAt");

-- CreateIndex
CREATE INDEX "ClientSignal_installId_createdAt_idx" ON "ClientSignal"("installId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientSignal_attemptedEmail_createdAt_idx" ON "ClientSignal"("attemptedEmail", "createdAt");

-- CreateIndex
CREATE INDEX "ClientSignal_ipHash_createdAt_idx" ON "ClientSignal"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "ClientSignal_userId_createdAt_idx" ON "ClientSignal"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClientSignal" ADD CONSTRAINT "ClientSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
