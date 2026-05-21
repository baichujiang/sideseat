CREATE TABLE "EmailOtpChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailOtpChallenge_email_purpose_createdAt_idx" ON "EmailOtpChallenge"("email", "purpose", "createdAt");
