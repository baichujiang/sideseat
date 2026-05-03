-- Proposal status lifecycle.
CREATE TYPE "StudySessionProposalStatus" AS ENUM (
  'PROPOSED', 'ACCEPTED', 'DECLINED', 'CANCELED', 'SUPERSEDED', 'EXPIRED'
);

CREATE TYPE "CalendarRepeatRule" AS ENUM (
  'NONE',
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'YEARLY'
);

-- StudySessionProposal: 1:1 for MVP; connectionId is nullable in the schema
-- so we can extend to courseId later without another migration.
CREATE TABLE "StudySessionProposal" (
  "id"           TEXT NOT NULL,
  "proposerId"   TEXT NOT NULL,
  "connectionId" TEXT,
  "counterOfId"  TEXT,
  "startAt"      TIMESTAMP(3) NOT NULL,
  "endAt"        TIMESTAMP(3) NOT NULL,
  "location"     TEXT,
  "note"         TEXT,
  "status"       "StudySessionProposalStatus" NOT NULL DEFAULT 'PROPOSED',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudySessionProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudySessionProposal_connectionId_createdAt_idx"
  ON "StudySessionProposal"("connectionId", "createdAt");
CREATE INDEX "StudySessionProposal_proposerId_createdAt_idx"
  ON "StudySessionProposal"("proposerId", "createdAt");
CREATE INDEX "StudySessionProposal_status_startAt_idx"
  ON "StudySessionProposal"("status", "startAt");

ALTER TABLE "StudySessionProposal"
  ADD CONSTRAINT "StudySessionProposal_proposerId_fkey"
  FOREIGN KEY ("proposerId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "StudySessionProposal"
  ADD CONSTRAINT "StudySessionProposal_connectionId_fkey"
  FOREIGN KEY ("connectionId")
  REFERENCES "Connection"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "StudySessionProposal"
  ADD CONSTRAINT "StudySessionProposal_counterOfId_fkey"
  FOREIGN KEY ("counterOfId")
  REFERENCES "StudySessionProposal"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- CalendarEntry: materialized one-off events. Unique per (user, proposal)
-- so re-accepting a proposal is a no-op.
CREATE TABLE "CalendarEntry" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "proposalId" TEXT,
  "title"      TEXT NOT NULL,
  "location"   TEXT,
  "repeatRule" "CalendarRepeatRule" NOT NULL DEFAULT 'NONE',
  "repeatUntil" TIMESTAMP(3),
  "startAt"    TIMESTAMP(3) NOT NULL,
  "endAt"      TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarEntry_userId_proposalId_key"
  ON "CalendarEntry"("userId", "proposalId");
CREATE INDEX "CalendarEntry_userId_startAt_idx"
  ON "CalendarEntry"("userId", "startAt");

ALTER TABLE "CalendarEntry"
  ADD CONSTRAINT "CalendarEntry_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CalendarEntry"
  ADD CONSTRAINT "CalendarEntry_proposalId_fkey"
  FOREIGN KEY ("proposalId")
  REFERENCES "StudySessionProposal"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
