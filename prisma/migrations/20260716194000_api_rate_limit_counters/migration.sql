CREATE TABLE "ApiRateLimitCounter" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRateLimitCounter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiRateLimitCounter_expiresAt_idx" ON "ApiRateLimitCounter"("expiresAt");
CREATE INDEX "ApiRateLimitCounter_scope_windowStartedAt_idx" ON "ApiRateLimitCounter"("scope", "windowStartedAt");
