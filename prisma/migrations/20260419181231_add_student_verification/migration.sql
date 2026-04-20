-- CreateEnum
CREATE TYPE "StudentVerificationStatus" AS ENUM ('UNVERIFIED', 'EMAIL_PENDING', 'VERIFIED', 'MANUAL_REVIEW_REQUIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SchoolEmailVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'CANCELED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "schoolEmail" TEXT,
ADD COLUMN     "schoolEmailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "studentVerificationNotes" TEXT,
ADD COLUMN     "studentVerificationStatus" "StudentVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verifiedStudent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SchoolEmailVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolEmail" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "SchoolEmailVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolEmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolEmailVerification_token_key" ON "SchoolEmailVerification"("token");

-- CreateIndex
CREATE INDEX "SchoolEmailVerification_userId_status_idx" ON "SchoolEmailVerification"("userId", "status");

-- AddForeignKey
ALTER TABLE "SchoolEmailVerification" ADD CONSTRAINT "SchoolEmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
