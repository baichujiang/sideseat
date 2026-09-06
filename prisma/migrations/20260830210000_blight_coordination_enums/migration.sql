-- BL-DB-01, part 1: enum vocabulary only.
--
-- Keeping existing-enum expansion separate ensures the new ClassmatePostStatus
-- values are committed before the coordination tables and columns reference the
-- new enum types. No row is rewritten and no feature is enabled here.

BEGIN;

CREATE TYPE "ActionCoordinationPolicy" AS ENUM (
  'DIRECT_CONVERSATION_V1',
  'CREATOR_GATED_V2'
);

CREATE TYPE "ActionCoordinationState" AS ENUM (
  'WAITING',
  'INITIATING',
  'OPEN',
  'ENDED',
  'UNAVAILABLE'
);

CREATE TYPE "ActionInterestSurface" AS ENUM (
  'FEED_CARD',
  'ACTION_DETAIL'
);

CREATE TYPE "ActionFirstContentType" AS ENUM (
  'MESSAGE',
  'PLAN'
);

CREATE TYPE "ActionInterestTerminalReason" AS ENUM (
  'ACTION_FULFILLED_BEFORE_CONNECT',
  'ACTION_EXPIRED_BEFORE_CONNECT',
  'INTEREST_WITHDRAWN_BEFORE_CONNECT',
  'SAFETY_UNAVAILABLE_BEFORE_CONNECT'
);

CREATE TYPE "ActionCoordinationEndReason" AS ENUM (
  'USER_ENDED',
  'PLAN_CONFIRMED',
  'SOURCE_FULFILLED',
  'SOURCE_REMOVED',
  'SAFETY_UNAVAILABLE'
);

ALTER TYPE "ClassmatePostStatus" ADD VALUE IF NOT EXISTS 'FULFILLED';
ALTER TYPE "ClassmatePostStatus" ADD VALUE IF NOT EXISTS 'REMOVED';

COMMIT;
