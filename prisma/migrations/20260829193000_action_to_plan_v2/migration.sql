-- SideSeat V2 Action-to-Plan foundation. All changes are additive so deployed
-- clients and existing rows remain valid while feature flags are disabled.

ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'ACTION_INTEREST_CARD';

CREATE TYPE "ProductFunnelEventName" AS ENUM (
  'OPPORTUNITY_IMPRESSION',
  'OPPORTUNITY_OPEN',
  'ACTION_INTERESTED',
  'ACTION_INTEREST_WITHDRAWN',
  'CONVERSATION_OPENED',
  'PLAN_PROPOSED',
  'PLAN_ACCEPTED',
  'PLAN_COUNTERED',
  'PLAN_DECLINED',
  'OUTCOME_RECORDED'
);

CREATE TYPE "ProductFunnelSurface" AS ENUM (
  'DISCOVER_RECOMMENDED',
  'DISCOVER_EXPLORE',
  'ACTION_DETAIL',
  'CHAT',
  'PLAN_CENTER',
  'SMALL_GROUP'
);

CREATE TYPE "ProductFunnelSourceKind" AS ENUM (
  'BUDDY_POST',
  'COURSE_ACTION',
  'DISCOVER_ACTIVITY',
  'PLAN',
  'SMALL_GROUP'
);

CREATE TYPE "ExperimentVariant" AS ENUM ('CONTROL', 'TREATMENT');
CREATE TYPE "ActionInterestStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

CREATE TYPE "PlanOriginKind" AS ENUM (
  'ACTION_INTEREST',
  'CLASSMATE_POST',
  'DISCOVER_ACTIVITY',
  'AVAILABILITY_SHARE',
  'SCHEDULE_SHARE',
  'SMALL_GROUP'
);

CREATE TYPE "PlanOutcomeValue" AS ENUM (
  'OCCURRED',
  'DID_NOT_OCCUR',
  'PREFER_NOT_TO_SAY'
);

CREATE TYPE "SocialIntentTopic" AS ENUM (
  'COFFEE',
  'STUDY',
  'SPORTS',
  'EXPLORE',
  'FOOD',
  'EVENTS'
);

CREATE TYPE "SocialMeetingPreference" AS ENUM (
  'ONE_TO_ONE',
  'SMALL_GROUP',
  'BOTH'
);

CREATE TYPE "SocialGroupOpportunityStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'CONFIRMED',
  'EXPIRED',
  'CANCELED'
);

CREATE TYPE "SocialGroupCandidateStatus" AS ENUM (
  'CANDIDATE',
  'INVITED',
  'INTERESTED',
  'DECLINED',
  'WITHDRAWN',
  'CONFIRMED'
);

CREATE TABLE "ProductFunnelEvent" (
  "id" TEXT NOT NULL,
  "clientEventId" UUID NOT NULL,
  "actorId" TEXT NOT NULL,
  "name" "ProductFunnelEventName" NOT NULL,
  "surface" "ProductFunnelSurface" NOT NULL,
  "sourceKind" "ProductFunnelSourceKind",
  "sourceId" TEXT,
  "connectionId" TEXT,
  "planRequestId" TEXT,
  "experimentKey" TEXT,
  "experimentVariant" "ExperimentVariant",
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductFunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExperimentAssignment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "experimentKey" TEXT NOT NULL,
  "variant" "ExperimentVariant" NOT NULL,
  "eligible" BOOLEAN NOT NULL DEFAULT false,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExperimentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionInterest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "classmatePostId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "status" "ActionInterestStatus" NOT NULL DEFAULT 'ACTIVE',
  "originSnapshot" JSONB NOT NULL,
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionInterest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanOutcomeResponse" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" "PlanOutcomeValue" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanOutcomeResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSocialPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topics" "SocialIntentTopic"[] DEFAULT ARRAY[]::"SocialIntentTopic"[],
  "meetingPreference" "SocialMeetingPreference" NOT NULL DEFAULT 'BOTH',
  "weeklyWindows" JSONB NOT NULL,
  "timeZone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
  "activeUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSocialPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialGroupOpportunity" (
  "id" TEXT NOT NULL,
  "topic" "SocialIntentTopic" NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "school" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "location" VARCHAR(120),
  "minimumMembers" INTEGER NOT NULL DEFAULT 3,
  "maximumMembers" INTEGER NOT NULL DEFAULT 5,
  "responseDeadline" TIMESTAMP(3) NOT NULL,
  "status" "SocialGroupOpportunityStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "groupChatId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialGroupOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialGroupCandidate" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "SocialGroupCandidateStatus" NOT NULL DEFAULT 'CANDIDATE',
  "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "limitedProfileSnapshot" JSONB NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialGroupCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialGroupOutcomeResponse" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" "PlanOutcomeValue" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialGroupOutcomeResponse_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Message"
  ADD COLUMN "actionInterestId" TEXT;

ALTER TABLE "PlanRequest"
  ADD COLUMN "actionInterestId" TEXT,
  ADD COLUMN "originKind" "PlanOriginKind",
  ADD COLUMN "originId" TEXT,
  ADD COLUMN "originSnapshot" JSONB;

ALTER TABLE "CalendarEntry"
  ADD COLUMN "socialGroupOpportunityId" TEXT;

CREATE UNIQUE INDEX "ProductFunnelEvent_clientEventId_key" ON "ProductFunnelEvent"("clientEventId");
CREATE INDEX "ProductFunnelEvent_name_occurredAt_idx" ON "ProductFunnelEvent"("name", "occurredAt");
CREATE INDEX "ProductFunnelEvent_actorId_occurredAt_idx" ON "ProductFunnelEvent"("actorId", "occurredAt");
CREATE INDEX "ProductFunnelEvent_experimentKey_experimentVariant_occurredAt_idx" ON "ProductFunnelEvent"("experimentKey", "experimentVariant", "occurredAt");
CREATE INDEX "ProductFunnelEvent_receivedAt_idx" ON "ProductFunnelEvent"("receivedAt");

CREATE UNIQUE INDEX "ExperimentAssignment_userId_experimentKey_key" ON "ExperimentAssignment"("userId", "experimentKey");
CREATE INDEX "ExperimentAssignment_experimentKey_variant_idx" ON "ExperimentAssignment"("experimentKey", "variant");

CREATE UNIQUE INDEX "ActionInterest_userId_classmatePostId_key" ON "ActionInterest"("userId", "classmatePostId");
CREATE INDEX "ActionInterest_classmatePostId_status_idx" ON "ActionInterest"("classmatePostId", "status");
CREATE INDEX "ActionInterest_connectionId_createdAt_idx" ON "ActionInterest"("connectionId", "createdAt");
CREATE INDEX "Message_actionInterestId_idx" ON "Message"("actionInterestId");
CREATE INDEX "PlanRequest_actionInterestId_createdAt_idx" ON "PlanRequest"("actionInterestId", "createdAt");
CREATE INDEX "PlanRequest_originKind_originId_idx" ON "PlanRequest"("originKind", "originId");

CREATE UNIQUE INDEX "PlanOutcomeResponse_planId_userId_key" ON "PlanOutcomeResponse"("planId", "userId");
CREATE INDEX "PlanOutcomeResponse_userId_createdAt_idx" ON "PlanOutcomeResponse"("userId", "createdAt");
CREATE INDEX "PlanOutcomeResponse_planId_value_idx" ON "PlanOutcomeResponse"("planId", "value");

CREATE UNIQUE INDEX "UserSocialPreference_userId_key" ON "UserSocialPreference"("userId");
CREATE INDEX "UserSocialPreference_activeUntil_idx" ON "UserSocialPreference"("activeUntil");

CREATE UNIQUE INDEX "SocialGroupOpportunity_groupChatId_key" ON "SocialGroupOpportunity"("groupChatId");
CREATE INDEX "SocialGroupOpportunity_status_responseDeadline_idx" ON "SocialGroupOpportunity"("status", "responseDeadline");
CREATE INDEX "SocialGroupOpportunity_school_city_topic_startAt_idx" ON "SocialGroupOpportunity"("school", "city", "topic", "startAt");
CREATE UNIQUE INDEX "SocialGroupCandidate_opportunityId_userId_key" ON "SocialGroupCandidate"("opportunityId", "userId");
CREATE INDEX "SocialGroupCandidate_userId_status_createdAt_idx" ON "SocialGroupCandidate"("userId", "status", "createdAt");
CREATE UNIQUE INDEX "SocialGroupOutcomeResponse_opportunityId_userId_key" ON "SocialGroupOutcomeResponse"("opportunityId", "userId");
CREATE INDEX "SocialGroupOutcomeResponse_userId_createdAt_idx" ON "SocialGroupOutcomeResponse"("userId", "createdAt");

CREATE UNIQUE INDEX "CalendarEntry_userId_socialGroupOpportunityId_key" ON "CalendarEntry"("userId", "socialGroupOpportunityId");
CREATE INDEX "CalendarEntry_socialGroupOpportunityId_idx" ON "CalendarEntry"("socialGroupOpportunityId");

ALTER TABLE "ProductFunnelEvent" ADD CONSTRAINT "ProductFunnelEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFunnelEvent" ADD CONSTRAINT "ProductFunnelEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductFunnelEvent" ADD CONSTRAINT "ProductFunnelEvent_planRequestId_fkey" FOREIGN KEY ("planRequestId") REFERENCES "PlanRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionInterest" ADD CONSTRAINT "ActionInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionInterest" ADD CONSTRAINT "ActionInterest_classmatePostId_fkey" FOREIGN KEY ("classmatePostId") REFERENCES "ClassmatePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionInterest" ADD CONSTRAINT "ActionInterest_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_actionInterestId_fkey" FOREIGN KEY ("actionInterestId") REFERENCES "ActionInterest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_actionInterestId_fkey" FOREIGN KEY ("actionInterestId") REFERENCES "ActionInterest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanOutcomeResponse" ADD CONSTRAINT "PlanOutcomeResponse_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanOutcomeResponse" ADD CONSTRAINT "PlanOutcomeResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSocialPreference" ADD CONSTRAINT "UserSocialPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialGroupOpportunity" ADD CONSTRAINT "SocialGroupOpportunity_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialGroupOpportunity" ADD CONSTRAINT "SocialGroupOpportunity_groupChatId_fkey" FOREIGN KEY ("groupChatId") REFERENCES "GroupChat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialGroupCandidate" ADD CONSTRAINT "SocialGroupCandidate_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SocialGroupOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialGroupCandidate" ADD CONSTRAINT "SocialGroupCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialGroupOutcomeResponse" ADD CONSTRAINT "SocialGroupOutcomeResponse_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SocialGroupOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialGroupOutcomeResponse" ADD CONSTRAINT "SocialGroupOutcomeResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_socialGroupOpportunityId_fkey" FOREIGN KEY ("socialGroupOpportunityId") REFERENCES "SocialGroupOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
