ALTER TABLE "MutualOpportunity"
  DROP CONSTRAINT "MutualOpportunity_activation_check",
  ADD CONSTRAINT "MutualOpportunity_activation_check" CHECK (
    ("status" = 'MUTUAL' AND "connectionId" IS NOT NULL AND "activatedAt" IS NOT NULL AND "terminalAt" IS NULL)
    OR
    ("status" IN ('DRAFT', 'PENDING') AND "connectionId" IS NULL AND "activatedAt" IS NULL AND "terminalAt" IS NULL)
    OR
    ("status" IN ('EXPIRED', 'UNAVAILABLE') AND "activatedAt" IS NULL AND "terminalAt" IS NOT NULL)
  );
