ALTER TABLE "WeeklyIntent" ADD COLUMN "shareToken" TEXT;
CREATE UNIQUE INDEX "WeeklyIntent_shareToken_key" ON "WeeklyIntent"("shareToken");
