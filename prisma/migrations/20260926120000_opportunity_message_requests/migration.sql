CREATE TABLE "MutualOpportunityBookmark" (
  "opportunityId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MutualOpportunityBookmark_pkey" PRIMARY KEY ("opportunityId", "userId"),
  CONSTRAINT "MutualOpportunityBookmark_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "MutualOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MutualOpportunityBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MutualOpportunityBookmark_userId_createdAt_idx" ON "MutualOpportunityBookmark"("userId", "createdAt");
CREATE TABLE "MutualOpportunityMessageRequest" (
  "opportunityId" TEXT NOT NULL PRIMARY KEY, "senderId" TEXT NOT NULL,
  "body" VARCHAR(500) NOT NULL, "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MutualOpportunityMessageRequest_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "MutualOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MutualOpportunityMessageRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MutualOpportunityMessageRequest_senderId_status_idx" ON "MutualOpportunityMessageRequest"("senderId", "status");
