DO $$
BEGIN
  CREATE TYPE "MessageType" AS ENUM (
    'TEXT',
    'AVAILABILITY_CARD',
    'PLAN_REQUEST_CARD',
    'PLAN_CONFIRMED_CARD',
    'SYSTEM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AvailabilityVisibilityMode" AS ENUM ('FREE_BUSY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PlanType" AS ENUM (
    'STUDY',
    'MEAL',
    'SPORTS',
    'LANGUAGE',
    'CUSTOM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PlanRequestStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'COUNTER_PROPOSED',
    'CANCELED',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "type" "MessageType" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN IF NOT EXISTS "availabilityShareId" TEXT,
  ADD COLUMN IF NOT EXISTS "planRequestId" TEXT;

ALTER TABLE "CalendarEntry"
  ADD COLUMN IF NOT EXISTS "planRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "eventType" "PlanType",
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS "AvailabilityShare" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "visibilityMode" "AvailabilityVisibilityMode" NOT NULL DEFAULT 'FREE_BUSY',
  "rangeStart" TIMESTAMP(3) NOT NULL,
  "rangeEnd" TIMESTAMP(3) NOT NULL,
  "selectedDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3),
  "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvailabilityShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlanRequest" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "availabilityShareId" TEXT,
  "counterOfId" TEXT,
  "proposerUserId" TEXT NOT NULL,
  "receiverUserId" TEXT NOT NULL,
  "planType" "PlanType" NOT NULL,
  "title" TEXT NOT NULL,
  "location" TEXT,
  "message" TEXT,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "status" "PlanRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Message_availabilityShareId_idx" ON "Message"("availabilityShareId");
CREATE INDEX IF NOT EXISTS "Message_planRequestId_idx" ON "Message"("planRequestId");
CREATE INDEX IF NOT EXISTS "AvailabilityShare_connectionId_createdAt_idx" ON "AvailabilityShare"("connectionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AvailabilityShare_ownerUserId_createdAt_idx" ON "AvailabilityShare"("ownerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AvailabilityShare_expiresAt_idx" ON "AvailabilityShare"("expiresAt");
CREATE INDEX IF NOT EXISTS "PlanRequest_connectionId_createdAt_idx" ON "PlanRequest"("connectionId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlanRequest_availabilityShareId_createdAt_idx" ON "PlanRequest"("availabilityShareId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlanRequest_proposerUserId_createdAt_idx" ON "PlanRequest"("proposerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlanRequest_receiverUserId_createdAt_idx" ON "PlanRequest"("receiverUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlanRequest_status_startTime_idx" ON "PlanRequest"("status", "startTime");
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarEntry_userId_planRequestId_key" ON "CalendarEntry"("userId", "planRequestId");

DO $$
BEGIN
  ALTER TABLE "Message"
    ADD CONSTRAINT "Message_availabilityShareId_fkey"
    FOREIGN KEY ("availabilityShareId")
    REFERENCES "AvailabilityShare"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Message"
    ADD CONSTRAINT "Message_planRequestId_fkey"
    FOREIGN KEY ("planRequestId")
    REFERENCES "PlanRequest"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AvailabilityShare"
    ADD CONSTRAINT "AvailabilityShare_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId")
    REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AvailabilityShare"
    ADD CONSTRAINT "AvailabilityShare_connectionId_fkey"
    FOREIGN KEY ("connectionId")
    REFERENCES "Connection"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PlanRequest"
    ADD CONSTRAINT "PlanRequest_connectionId_fkey"
    FOREIGN KEY ("connectionId")
    REFERENCES "Connection"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PlanRequest"
    ADD CONSTRAINT "PlanRequest_availabilityShareId_fkey"
    FOREIGN KEY ("availabilityShareId")
    REFERENCES "AvailabilityShare"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PlanRequest"
    ADD CONSTRAINT "PlanRequest_counterOfId_fkey"
    FOREIGN KEY ("counterOfId")
    REFERENCES "PlanRequest"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PlanRequest"
    ADD CONSTRAINT "PlanRequest_proposerUserId_fkey"
    FOREIGN KEY ("proposerUserId")
    REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PlanRequest"
    ADD CONSTRAINT "PlanRequest_receiverUserId_fkey"
    FOREIGN KEY ("receiverUserId")
    REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CalendarEntry"
    ADD CONSTRAINT "CalendarEntry_planRequestId_fkey"
    FOREIGN KEY ("planRequestId")
    REFERENCES "PlanRequest"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
