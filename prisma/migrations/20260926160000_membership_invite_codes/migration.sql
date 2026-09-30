CREATE TABLE "UserMembership" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "plusExpiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MembershipInviteCode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "codeHash" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "maxRedemptions" INTEGER NOT NULL,
  "redeemedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipInviteCode_duration_check" CHECK ("durationDays" BETWEEN 1 AND 3650),
  CONSTRAINT "MembershipInviteCode_capacity_check" CHECK ("maxRedemptions" > 0 AND "redeemedCount" >= 0 AND "redeemedCount" <= "maxRedemptions")
);
CREATE UNIQUE INDEX "MembershipInviteCode_codeHash_key" ON "MembershipInviteCode"("codeHash");

CREATE TABLE "MembershipRedemption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "codeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "plusExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "MembershipInviteCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MembershipRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MembershipRedemption_codeId_userId_key" ON "MembershipRedemption"("codeId", "userId");
CREATE INDEX "MembershipRedemption_userId_createdAt_idx" ON "MembershipRedemption"("userId", "createdAt");
