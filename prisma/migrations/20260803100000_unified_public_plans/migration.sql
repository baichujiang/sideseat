ALTER TABLE "ClassmatePost"
ADD COLUMN "startsAt" TIMESTAMP(3),
ADD COLUMN "endsAt" TIMESTAMP(3),
ADD COLUMN "location" VARCHAR(120),
ADD COLUMN "capacity" INTEGER;

CREATE INDEX "ClassmatePost_city_status_startsAt_idx"
ON "ClassmatePost"("city", "status", "startsAt");
