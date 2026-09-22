-- BL-DB-03 prerequisite: represent legacy DIRECT_CONVERSATION_V1 coordination
-- without fabricating an ActionInterestActivation or first-content attribution.
--
-- CREATOR_GATED_V2 contexts still require a real current activation through
-- guarded application writes and the policy-aware hardening owned by BL-DB-04.

BEGIN;

ALTER TABLE "ActionCoordinationContext"
  ALTER COLUMN "currentActivationId" DROP NOT NULL;

COMMIT;
