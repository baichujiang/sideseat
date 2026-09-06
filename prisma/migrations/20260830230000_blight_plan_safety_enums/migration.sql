-- BL-DB-06, part 1: approved pair-safety vocabulary only.
--
-- The following expand migration consumes the cancellation enum. Keeping every
-- enum change in its own committed transaction makes a failure fully retryable
-- and prevents a newly added value from being used before commit.

BEGIN;

ALTER TYPE "PlanRequestStatus" ADD VALUE IF NOT EXISTS 'INVALIDATED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'PLAN_SAFETY_TERMINATED';

CREATE TYPE "PlanCommitmentCancellationReason" AS ENUM (
  'USER_CANCELED',
  'SAFETY_UNAVAILABLE'
);

COMMIT;
