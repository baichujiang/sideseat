-- Existing intentions remain private. New clients may explicitly opt in.
ALTER TABLE "WeeklyIntent"
ADD COLUMN "exploreVisible" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "WeeklyIntent_exploreVisible_status_expiresAt_idx"
ON "WeeklyIntent"("exploreVisible", "status", "expiresAt");
