-- BL-DB-02, part 1: stable Plan vocabulary only.
--
-- The following expand migration consumes these types. Keeping enum creation in
-- its own committed transaction makes a failed migration fully retryable and
-- avoids using a newly added enum value before commit.

BEGIN;

CREATE TYPE "PlanResolutionReason" AS ENUM (
  'PROPOSER_WITHDREW',
  'RECEIVER_DECLINED',
  'COMMITMENT_CANCELED',
  'COMMITMENT_COMPLETED',
  'SOURCE_FULFILLED',
  'SOURCE_REMOVED',
  'SAFETY_UNAVAILABLE',
  'TIME_EXPIRED'
);

CREATE TYPE "PlanCommitmentStatus" AS ENUM (
  'NEGOTIATING',
  'CONFIRMED',
  'CLOSED',
  'CANCELED'
);

CREATE TYPE "PlanRevisionKind" AS ENUM (
  'INITIAL',
  'RESCHEDULE'
);

CREATE TYPE "CalendarProjectionStatus" AS ENUM (
  'ACTIVE',
  'CANCELED'
);

COMMIT;
