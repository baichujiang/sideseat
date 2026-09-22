CREATE TYPE "SessionClientKind" AS ENUM ('WEB', 'IOS');
CREATE TYPE "SessionRevocationReason" AS ENUM (
  'ROTATED',
  'LOGOUT',
  'DEVICE_REPLACED',
  'DEVICE_MISMATCH',
  'REUSE_DETECTED',
  'EXPIRED',
  'USER_REVOKED'
);

ALTER TABLE "Session"
ADD COLUMN "clientKind" "SessionClientKind" NOT NULL DEFAULT 'WEB',
ADD COLUMN "familyId" TEXT,
ADD COLUMN "familyExpiresAt" TIMESTAMP(3),
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "deviceName" TEXT,
ADD COLUMN "appVersion" TEXT,
ADD COLUMN "platformVersion" TEXT,
ADD COLUMN "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "revocationReason" "SessionRevocationReason",
ADD COLUMN "replacedBySessionId" TEXT;

CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");
CREATE INDEX "Session_userId_clientKind_revokedAt_idx"
ON "Session"("userId", "clientKind", "revokedAt");
