-- CreateTable
CREATE TABLE "UserCalendarCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "presetKey" TEXT,
    "icsSubscriptionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCalendarCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCalendarCategory_userId_presetKey_key" ON "UserCalendarCategory"("userId", "presetKey");

-- CreateIndex
CREATE INDEX "UserCalendarCategory_userId_sortOrder_idx" ON "UserCalendarCategory"("userId", "sortOrder");

-- AddForeignKey
ALTER TABLE "UserCalendarCategory" ADD CONSTRAINT "UserCalendarCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CalendarEntry" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "CalendarEntry_categoryId_idx" ON "CalendarEntry"("categoryId");

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "UserCalendarCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
