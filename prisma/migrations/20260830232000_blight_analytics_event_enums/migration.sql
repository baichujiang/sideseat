-- Add the remaining server-owned B-light funnel vocabulary. This migration is
-- enum-only and additive: legacy events and rows retain their existing meaning.
-- Keep it separate from data writes because PostgreSQL cannot use a newly added
-- enum value until the transaction that adds it has committed.

BEGIN;

ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'ACTION_RESPONSE_VIEWED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'ACTION_RESPONSE_HIDDEN';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'ACTION_RESPONSE_RESTORED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'COORDINATION_RESERVED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'COORDINATION_RELEASED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'ACTION_CONNECTED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'FIRST_HUMAN_RESPONSE';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'COORDINATION_ENDED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'ACTION_INTEREST_TERMINATED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'PLAN_WITHDRAWN';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'PLAN_EXPIRED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'PLAN_RESCHEDULE_PROPOSED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'PLAN_RESCHEDULE_ACCEPTED';
ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'PLAN_CANCELED';

COMMIT;
